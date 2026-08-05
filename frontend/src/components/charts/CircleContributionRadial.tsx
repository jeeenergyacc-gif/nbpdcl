import { useMemo, useRef, useState, useEffect } from 'react';

export interface RadialCircle {
  name: string;
  value: number;
  color: string;
  divisions: { division: string; value: number }[];
}

interface CircleContributionRadialProps {
  circles: RadialCircle[];
  total: number;
  centerLabel?: string;
  fmt?: (v: number, d?: number) => string;
}

const DEFAULT_FMT = (v: number, d = 1) =>
  v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Circle-wise contribution — larger fixed donut with the circle name + % printed
 * INSIDE each slice (where it fits), paired with a SCROLLABLE card panel that
 * lists EVERY circle with its quantum, share and the FULL division breakdown
 * (name · MU · % of that circle). Hovering a slice highlights its card and vice
 * versa. Nothing overlaps and no card is hidden. Display only — no value is
 * recomputed.
 */
export default function CircleContributionRadial({
  circles, total, fmt = DEFAULT_FMT,
}: CircleContributionRadialProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1000);
  const [hovered, setHovered] = useState<string | null>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const stack = w < 720;                            // narrow: donut on top, list below
  const DON = stack ? Math.min(w - 8, 440) : 460;   // bigger donut
  const cx = DON / 2;
  const cy = DON / 2;
  const R = DON / 2 - 8;
  const RINNER = R * 0.54;
  const RLABEL = RINNER + (R - RINNER) * 0.55;
  const MIN_PCT_DEG = 8;                             // show % inside if slice ≥ this
  const MIN_NAME_DEG = 14;                           // also show name if slice ≥ this

  const slices = useMemo(() => {
    let acc = 0;
    return circles.map((c) => {
      const frac = total ? c.value / total : 0;
      const start = acc - Math.PI / 2;
      const end = acc + frac * Math.PI * 2 - Math.PI / 2;
      acc += frac * Math.PI * 2;
      const mid = (start + end) / 2;
      return { ...c, start, end, mid, frac, deg: frac * 360 };
    });
  }, [circles, total]);

  const arcPath = (start: number, end: number) => {
    const x1 = cx + R * Math.cos(start), y1 = cy + R * Math.sin(start);
    const x2 = cx + R * Math.cos(end), y2 = cy + R * Math.sin(end);
    const xi1 = cx + RINNER * Math.cos(end), yi1 = cy + RINNER * Math.sin(end);
    const xi2 = cx + RINNER * Math.cos(start), yi2 = cy + RINNER * Math.sin(start);
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${RINNER} ${RINNER} 0 ${large} 0 ${xi2} ${yi2} Z`;
  };

  const short = (s: string, n: number) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

  if (!circles.length) {
    return <div className="h-[300px] flex items-center justify-center text-sm text-textsecondary">No data available</div>;
  }

  const donut = (
    <div style={{ flexShrink: 0, width: DON, height: DON, position: 'relative' }}>
      <svg width={DON} height={DON}>
        {slices.map((s) => {
          const dim = hovered && hovered !== s.name;
          return (
            <path
              key={s.name}
              d={arcPath(s.start, s.end)}
              fill={s.color}
              stroke="#fff"
              strokeWidth={hovered === s.name ? 3.5 : 2.5}
              opacity={dim ? 0.32 : 1}
              style={{ cursor: 'pointer', transition: 'opacity .12s' }}
              onMouseEnter={() => setHovered(s.name)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
        {/* name + % printed INSIDE each slice (white with a dark halo for contrast).
            Thin slices push their label outward where the arc is wider, so even a
            ~5-6% slice (e.g. Kishanganj) still shows its name + %. */}
        {slices.filter((s) => s.deg >= MIN_PCT_DEG).map((s) => {
          const thin = s.deg < 22;
          const lr = thin ? RINNER + (R - RINNER) * 0.72 : RLABEL;
          const lx = cx + lr * Math.cos(s.mid);
          const ly = cy + lr * Math.sin(s.mid);
          const showName = s.deg >= MIN_NAME_DEG;
          const pct = (s.frac * 100).toFixed(s.deg >= 24 ? 1 : 0);
          const nameSize = thin ? 10 : 11.5;
          const pctSize = thin ? 11 : 12.5;
          const nameMax = thin ? 11 : 13;
          const halo = { paintOrder: 'stroke', stroke: 'rgba(15,23,42,0.6)', strokeWidth: 3, strokeLinejoin: 'round' } as any;
          const dim = hovered && hovered !== s.name;
          return (
            <g key={`lbl-${s.name}`} opacity={dim ? 0.32 : 1} style={{ pointerEvents: 'none' }}>
              {showName && (
                <text x={lx} y={ly - 7} textAnchor="middle" dominantBaseline="central" fontSize={nameSize} fontWeight={800} fill="#fff" fontFamily="Inter, sans-serif" style={halo}>
                  {short(s.name, nameMax)}
                </text>
              )}
              <text x={lx} y={showName ? ly + 7 : ly} textAnchor="middle" dominantBaseline="central" fontSize={showName ? pctSize : 12} fontWeight={800} fill="#fff" fontFamily="Inter, sans-serif" style={halo}>
                {pct}%
              </text>
            </g>
          );
        })}
        {/* centre — Total Input Energy + value */}
        <circle cx={cx} cy={cy} r={RINNER - 2} fill="#fff" />
        <text x={cx} y={cy - 16} textAnchor="middle" fontSize={11} fontWeight={700} fill="#64748B" fontFamily="Inter, sans-serif" style={{ textTransform: 'uppercase', letterSpacing: 0.4 } as any}>
          Total Input Energy
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize={22} fontWeight={800} fill="#0F172A" fontFamily="Inter, sans-serif">
          {fmt(total, 2)}
        </text>
        <text x={cx} y={cy + 26} textAnchor="middle" fontSize={12} fontWeight={600} fill="#64748B" fontFamily="Inter, sans-serif">
          MU
        </text>
      </svg>
    </div>
  );

  const cardList = (
    <div
      style={{
        flex: 1, minWidth: 0,
        maxHeight: stack ? 320 : DON,
        overflowY: 'auto', paddingRight: 6,
        display: 'grid',
        gridTemplateColumns: w >= 1040 ? '1fr 1fr' : '1fr',
        gap: 8, alignContent: 'start',
      }}
    >
      {slices.map((s) => {
        const pct = total ? (s.value / total) * 100 : 0;
        const divs = [...s.divisions].sort((a, b) => b.value - a.value);
        const active = hovered === s.name;
        return (
          <div
            key={`card-${s.name}`}
            onMouseEnter={() => setHovered(s.name)}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: active ? `${s.color}20` : `${s.color}0D`,
              border: `1.5px solid ${active ? s.color : `${s.color}40`}`,
              boxShadow: active ? `0 4px 14px ${s.color}33` : 'none',
              borderRadius: 10, padding: '7px 10px', cursor: 'default',
              transition: 'all .12s', fontFamily: 'Inter, system-ui, sans-serif',
              opacity: hovered && !active ? 0.55 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: s.color, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                {s.name}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: '#0F172A', flexShrink: 0 }}>{pct.toFixed(2)}%</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginTop: 1 }}>
              {fmt(s.value, 2)} <span style={{ color: '#64748B', fontWeight: 600 }}>MU</span>
            </div>
            {divs.length > 0 && (
              <div style={{ marginTop: 4, borderTop: '1px solid rgba(15,23,42,0.08)', paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {divs.map((d) => {
                  const dPct = s.value ? (d.value / s.value) * 100 : 0;
                  return (
                    <div key={d.division} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10.5, color: '#475569' }}>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.division}</span>
                      <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#334155', fontWeight: 600 }}>{fmt(d.value, 2)} MU</span>
                        <span style={{ color: '#94A3B8', marginLeft: 6 }}>{dPct.toFixed(1)}%</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative', width: '100%',
        display: 'flex', flexDirection: stack ? 'column' : 'row',
        alignItems: stack ? 'center' : 'flex-start', gap: 16,
      }}
    >
      {donut}
      {cardList}
    </div>
  );
}
