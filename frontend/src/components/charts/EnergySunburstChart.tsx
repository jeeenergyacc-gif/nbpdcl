import React, { useMemo } from 'react';

// ---------------------------------------------------------------------------
// Data contract — raw rows as returned by GET /purchase/sunburst
// ---------------------------------------------------------------------------
export interface SunburstRow {
  ppa_category: string;
  plant_type: string;
  plant_name: string;
  energy_quantum: number;
}

interface EnergySunburstChartProps {
  rows: SunburstRow[];
  palette?: string[];
}

const DEFAULT_PALETTE = ['#1565C0', '#42A5F5', '#2E7D32', '#FB8C00', '#D32F2F', '#7E57C2', '#00897B', '#F9A825'];

const VIEW_W = 800;
const VIEW_H = 600;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;

// Ring geometry
const INNER_HOLE_R = 95;
const INNER_RING_OUTER_R = 180;
const OUTER_RING_INNER_R = 190;
const OUTER_RING_OUTER_R = 280;

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function annularSectorPath(cx: number, cy: number, rInner: number, rOuter: number, startAngle: number, endAngle: number) {
  const span = Math.min(endAngle - startAngle, Math.PI * 2 - 0.0001);
  const largeArc = span > Math.PI ? 1 : 0;
  const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, startAngle + span);
  const p3 = polarToCartesian(cx, cy, rInner, startAngle + span);
  const p4 = polarToCartesian(cx, cy, rInner, startAngle);
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)} Z`;
}

function shade(hex: string, amount: number) {
  // amount in [-1, 1] — negative darkens, positive lightens
  const h = hex.replace('#', '');
  const num = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const adjust = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amount > 0 ? (255 - c) * amount : c * amount))));
  r = adjust(r); g = adjust(g); b = adjust(b);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

interface Segment {
  key: string;
  name: string;
  value: number;
  percentage: number;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  color: string;
}

function labelPercentFromAngleRadius(angle: number, radius: number) {
  const { x, y } = polarToCartesian(CX, CY, radius, angle);
  return { leftPct: (x / VIEW_W) * 100, topPct: (y / VIEW_H) * 100 };
}

function EnergySunburstChart({ rows, palette = DEFAULT_PALETTE }: EnergySunburstChartProps) {
  const { innerSegments, outerSegments, total, categoryCount, plantTypeCount } = useMemo(() => {
    if (!rows.length) {
      return { innerSegments: [] as Segment[], outerSegments: [] as Segment[], total: 0, categoryCount: 0, plantTypeCount: 0 };
    }

    const total = rows.reduce((s, r) => s + (r.energy_quantum || 0), 0);

    // Inner ring: aggregate by PPA category
    const categoryTotals = new Map<string, number>();
    rows.forEach((r) => {
      const key = r.ppa_category || 'Unknown';
      categoryTotals.set(key, (categoryTotals.get(key) || 0) + (r.energy_quantum || 0));
    });

    // Outer ring: aggregate by plant type, grouped/ordered within its parent category
    // so outer wedges stay angularly contiguous with their inner-ring parent.
    const categories = [...categoryTotals.keys()];
    const inner: Segment[] = [];
    const outer: Segment[] = [];
    let cursor = -Math.PI / 2; // start at 12 o'clock

    categories.forEach((cat, catIdx) => {
      const catTotal = categoryTotals.get(cat)!;
      const catSpan = (catTotal / total) * Math.PI * 2;
      const catStart = cursor;
      const catEnd = cursor + catSpan;

      inner.push({
        key: `cat-${cat}`,
        name: cat,
        value: catTotal,
        percentage: (catTotal / total) * 100,
        startAngle: catStart,
        endAngle: catEnd,
        midAngle: (catStart + catEnd) / 2,
        color: palette[catIdx % palette.length],
      });

      // Plant types within this category, sorted largest-first for readability.
      const plantTypeTotals = new Map<string, number>();
      rows.filter((r) => (r.ppa_category || 'Unknown') === cat).forEach((r) => {
        const key = r.plant_type || 'Unknown';
        plantTypeTotals.set(key, (plantTypeTotals.get(key) || 0) + (r.energy_quantum || 0));
      });
      const plantTypes = [...plantTypeTotals.entries()].sort((a, b) => b[1] - a[1]);

      let subCursor = catStart;
      plantTypes.forEach(([ptName, ptValue], ptIdx) => {
        const ptSpan = catTotal > 0 ? (ptValue / catTotal) * catSpan : 0;
        const ptStart = subCursor;
        const ptEnd = subCursor + ptSpan;
        outer.push({
          key: `pt-${cat}-${ptName}`,
          name: ptName,
          value: ptValue,
          percentage: (ptValue / total) * 100,
          startAngle: ptStart,
          endAngle: ptEnd,
          midAngle: (ptStart + ptEnd) / 2,
          color: shade(palette[catIdx % palette.length], 0.18 + 0.12 * (ptIdx % 3)),
        });
        subCursor = ptEnd;
      });

      cursor = catEnd;
    });

    const plantTypeCount = new Set(rows.map((r) => r.plant_type || 'Unknown')).size;

    return { innerSegments: inner, outerSegments: outer, total, categoryCount: categories.length, plantTypeCount };
  }, [rows, palette]);

  // Simple collision-avoidance: split outer labels left/right of center, sort by
  // vertical position, and enforce a minimum gap so text never overlaps.
  const outerLabels = useMemo(() => {
    type L = { seg: Segment; leftPct: number; topPct: number; anchorLeftPct: number; anchorTopPct: number; small: boolean };
    const labels: L[] = outerSegments
      .filter((s) => s.percentage >= 0.3)
      .map((s) => {
        const small = s.percentage < 8;
        const labelRadius = small ? OUTER_RING_OUTER_R + 55 : (OUTER_RING_INNER_R + OUTER_RING_OUTER_R) / 2;
        const anchor = labelPercentFromAngleRadius(s.midAngle, OUTER_RING_OUTER_R);
        const pos = labelPercentFromAngleRadius(s.midAngle, labelRadius);
        return { seg: s, leftPct: pos.leftPct, topPct: pos.topPct, anchorLeftPct: anchor.leftPct, anchorTopPct: anchor.topPct, small };
      });

    const left = labels.filter((l) => l.leftPct < 50).sort((a, b) => a.topPct - b.topPct);
    const right = labels.filter((l) => l.leftPct >= 50).sort((a, b) => a.topPct - b.topPct);
    const MIN_GAP = 7; // percentage points
    [left, right].forEach((group) => {
      for (let i = 1; i < group.length; i++) {
        if (group[i].topPct - group[i - 1].topPct < MIN_GAP) {
          group[i].topPct = group[i - 1].topPct + MIN_GAP;
        }
      }
    });
    return [...left, ...right];
  }, [outerSegments]);

  const innerLabels = useMemo(
    () =>
      innerSegments
        .filter((s) => s.percentage >= 3)
        .map((s) => ({ seg: s, ...labelPercentFromAngleRadius(s.midAngle, (INNER_HOLE_R + INNER_RING_OUTER_R) / 2) })),
    [innerSegments]
  );

  if (!rows.length) {
    return <div className="flex items-center justify-center h-full text-sm text-textsecondary">No data available</div>;
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 380,
        perspective: '1000px',
        background: 'radial-gradient(circle, #0a2246 0%, #020a17 100%)',
        borderRadius: 12,
        padding: 12,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          transform: 'rotateX(55deg) rotateZ(-15deg)',
          transformStyle: 'preserve-3d',
          position: 'relative',
        }}
      >
        <svg width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ overflow: 'visible' }}>
          <defs>
            <radialGradient id="sunburstCenterHole" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#020813" />
              <stop offset="90%" stopColor="#0b1e36" />
              <stop offset="100%" stopColor="#1e3a8a" />
            </radialGradient>
            <filter id="sunburstDropShadow" x="-10%" y="-10%" width="130%" height="130%">
              <feDropShadow dx="0" dy="18" stdDeviation="12" floodColor="#000000" floodOpacity="0.6" />
            </filter>
            {[...innerSegments, ...outerSegments].map((s) => (
              <linearGradient key={`grad-${s.key}`} id={`grad-${s.key}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={shade(s.color, 0.22)} />
                <stop offset="100%" stopColor={shade(s.color, -0.28)} />
              </linearGradient>
            ))}
          </defs>

          <g filter="url(#sunburstDropShadow)">
            {outerSegments.map((s) => (
              <path
                key={s.key}
                d={annularSectorPath(CX, CY, OUTER_RING_INNER_R, OUTER_RING_OUTER_R, s.startAngle, s.endAngle)}
                fill={`url(#grad-${s.key})`}
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={1.5}
              />
            ))}
            {innerSegments.map((s) => (
              <path
                key={s.key}
                d={annularSectorPath(CX, CY, INNER_HOLE_R, INNER_RING_OUTER_R, s.startAngle, s.endAngle)}
                fill={`url(#grad-${s.key})`}
                opacity={0.92}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth={1}
              />
            ))}
            <circle cx={CX} cy={CY} r={INNER_HOLE_R} fill="url(#sunburstCenterHole)" stroke="#2563eb" strokeWidth={2.5} />
          </g>

          {/* Leader lines for small outer segments */}
          {outerLabels.filter((l) => l.small).map((l) => (
            <line
              key={`leader-${l.seg.key}`}
              x1={(l.anchorLeftPct / 100) * VIEW_W}
              y1={(l.anchorTopPct / 100) * VIEW_H}
              x2={(l.leftPct / 100) * VIEW_W}
              y2={(l.topPct / 100) * VIEW_H}
              stroke="#94A3B8"
              strokeWidth={1.2}
              strokeDasharray="3 2"
            />
          ))}
        </svg>

        {/* Counter-rotated text overlay so labels stay flat/readable */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            transform: 'rotateZ(15deg) rotateX(-55deg)',
            transformOrigin: 'center center',
            pointerEvents: 'none',
          }}
        >
          {/* Center summary */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#93c5fd', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 1 }}>Total Purchase</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#ffffff' }}>
              {total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 12, color: '#93c5fd', fontWeight: 600 }}>MU · {categoryCount} categories · {plantTypeCount} plant types</div>
          </div>

          {innerLabels.map(({ seg, leftPct, topPct }) => (
            <div
              key={seg.key}
              style={{ position: 'absolute', top: `${topPct}%`, left: `${leftPct}%`, transform: 'translate(-50%, -50%)', textAlign: 'center', maxWidth: 130 }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#ffffff' }}>{seg.name}</div>
              <div style={{ fontSize: 10, color: '#bfdbfe' }}>{seg.value.toLocaleString('en-IN', { maximumFractionDigits: 1 })} MU</div>
            </div>
          ))}

          {outerLabels.map(({ seg, leftPct, topPct }) => (
            <div
              key={seg.key}
              style={{ position: 'absolute', top: `${topPct}%`, left: `${leftPct}%`, transform: 'translate(-50%, -50%)', textAlign: 'center', maxWidth: 130 }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#e2f0ff' }}>{seg.name}</div>
              <div style={{ fontSize: 10, color: '#a7c5f5' }}>({seg.percentage.toFixed(1)}%) {seg.value.toLocaleString('en-IN', { maximumFractionDigits: 1 })} MU</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default React.memo(EnergySunburstChart);
