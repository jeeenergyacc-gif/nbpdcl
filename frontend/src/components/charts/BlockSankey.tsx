import { useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface BlockSankeyNode {
  name: string;
  value: number;
  column: number;
  color: string;
}
export interface BlockSankeyLink {
  source: string;
  target: string;
  value: number;
}

interface BlockSankeyProps {
  nodes: BlockSankeyNode[];
  links: BlockSankeyLink[];
  height?: number;
  /** Unit suffix rendered inside each card, e.g. "MU". */
  unit?: string;
  /** Decimal places for the value shown inside each card. */
  digits?: number;
  labelColor?: string;
}

const fmt = (v: number, d: number) =>
  v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

const shade = (hex: string, pct: number) => {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = cl(((n >> 16) & 255) * (1 + pct));
  const g = cl(((n >> 8) & 255) * (1 + pct));
  const b = cl((n & 255) * (1 + pct));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
};

/** Wraps a node name onto at most 3 lines so it always fits inside its card. */
function wrap(name: string, maxChars: number): string[] {
  const words = name.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let cur = '';
  words.forEach((w) => {
    if (!cur.length) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  });
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

/**
 * Block-style Sankey — the same model as the Power Purchase dashboard:
 * every node is a rounded gradient card with its name and value rendered INSIDE
 * it (never outside, never on hover only), and flows are ribbons whose thickness
 * encodes the value. Cards are drawn above the ribbons, so a label can never be
 * obscured by a flow, and equal-height cards inside a column guarantee no overlap.
 */
export default function BlockSankey({
  nodes, links, height = 440, unit = 'MU', digits = 3, labelColor = '#FFFFFF',
}: BlockSankeyProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 900, h: height });

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!nodes.length) return null;

    const colCount = Math.max(...nodes.map((n) => n.column)) + 1;
    const W = Math.max(520, box.w);
    const H = Math.max(300, box.h);
    const PAD_X = 8;
    const PAD_Y = 10;
    const gapY = 10;
    const colW = Math.min(190, ((W - PAD_X * 2) / colCount) * 0.62);
    const xOf = (c: number) => (colCount > 1 ? PAD_X + c * ((W - PAD_X * 2 - colW) / (colCount - 1)) : PAD_X);

    const cards: Record<string, { name: string; value: number; color: string; x: number; y: number; w: number; h: number }> = {};
    for (let c = 0; c < colCount; c++) {
      const colNodes = nodes.filter((n) => n.column === c).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
      const n = colNodes.length;
      if (!n) continue;
      const avail = H - PAD_Y * 2 - gapY * (n - 1);
      const cardH = Math.max(42, avail / n);
      colNodes.forEach((node, i) => {
        cards[node.name] = {
          name: node.name, value: node.value, color: node.color,
          x: xOf(c), y: PAD_Y + i * (cardH + gapY), w: colW, h: cardH,
        };
      });
    }

    const usable = links.filter((l) => l.value > 0 && cards[l.source] && cards[l.target]);
    const maxLink = Math.max(1, ...usable.map((l) => l.value));
    const thick = (l: BlockSankeyLink) => {
      const cap = cards[l.source].h * 0.82;
      return Math.max(2.5, Math.min(cap, (l.value / maxLink) * 62));
    };

    const outTotal: Record<string, number> = {};
    const inTotal: Record<string, number> = {};
    usable.forEach((l) => {
      outTotal[l.source] = (outTotal[l.source] || 0) + thick(l);
      inTotal[l.target] = (inTotal[l.target] || 0) + thick(l);
    });

    const outCursor: Record<string, number> = {};
    const inCursor: Record<string, number> = {};
    const ribbons = usable
      .slice()
      .sort((a, b) => b.value - a.value)
      .map((l) => {
        const s = cards[l.source];
        const t = cards[l.target];
        const th = thick(l);
        const sStack = outCursor[l.source] || 0;
        const tStack = inCursor[l.target] || 0;
        outCursor[l.source] = sStack + th;
        inCursor[l.target] = tStack + th;

        const sTop = s.y + s.h / 2 - Math.min(outTotal[l.source], s.h * 0.86) / 2 + sStack;
        const tTop = t.y + t.h / 2 - Math.min(inTotal[l.target], t.h * 0.86) / 2 + tStack;
        const x1 = s.x + s.w;
        const x2 = t.x;
        const cx = (x1 + x2) / 2;

        return {
          id: `${l.source}->${l.target}`,
          d: `M ${x1} ${sTop} C ${cx} ${sTop}, ${cx} ${tTop}, ${x2} ${tTop} L ${x2} ${tTop + th} C ${cx} ${tTop + th}, ${cx} ${sTop + th}, ${x1} ${sTop + th} Z`,
          from: s.color, to: t.color, value: l.value,
        };
      });

    return { cards: Object.values(cards), ribbons, W, H };
  }, [nodes, links, box]);

  return (
    <div ref={wrapRef} style={{ width: '100%', height }}>
      {layout ? (
        <svg width="100%" height="100%" viewBox={`0 0 ${layout.W} ${layout.H}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
          <defs>
            {layout.ribbons.map((r, i) => (
              <linearGradient key={r.id} id={`bsk-f-${i}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={r.from} stopOpacity="0.62" />
                <stop offset="100%" stopColor={r.to} stopOpacity="0.62" />
              </linearGradient>
            ))}
            {layout.cards.map((c) => (
              <linearGradient key={c.name} id={`bsk-c-${c.name.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={shade(c.color, 0.2)} />
                <stop offset="100%" stopColor={shade(c.color, -0.22)} />
              </linearGradient>
            ))}
            <filter id="bsk-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0F172A" floodOpacity="0.28" />
            </filter>
          </defs>

          {/* ribbons first — cards always render on top, so labels can never be covered */}
          <g>
            {layout.ribbons.map((r, i) => (
              <path key={r.id} d={r.d} fill={`url(#bsk-f-${i})`} className="transition-opacity duration-300">
                <title>{`${r.id.replace('->', ' → ')}: ${fmt(r.value, digits)} ${unit}`}</title>
              </path>
            ))}
          </g>

          {/* node cards — name + value live inside the block */}
          <g>
            {layout.cards.map((c) => {
              const id = c.name.replace(/[^a-z0-9]/gi, '');
              const maxChars = Math.max(9, Math.floor(c.w / 7.4));
              const lines = wrap(c.name, maxChars);
              const nameSize = c.h < 54 ? 10.5 : 12.5;
              const valSize = c.h < 54 ? 10.5 : 12;
              const lh = nameSize + 3;
              const blockH = lines.length * lh + valSize + 3;
              const ty = c.y + c.h / 2 - blockH / 2 + nameSize;
              return (
                <g key={c.name} filter="url(#bsk-shadow)">
                  <rect
                    x={c.x} y={c.y} width={c.w} height={c.h} rx={10}
                    fill={`url(#bsk-c-${id})`} stroke={shade(c.color, 0.3)} strokeWidth={1.3}
                  />
                  <rect x={c.x + 1.5} y={c.y + 1.5} width={c.w - 3} height={Math.min(12, c.h / 3)} rx={8} fill="#fff" opacity="0.16" />
                  {lines.map((ln, i) => (
                    <text
                      key={i} x={c.x + c.w / 2} y={ty + i * lh} textAnchor="middle"
                      fill={labelColor} fontFamily="Inter, sans-serif" fontSize={nameSize} fontWeight={700}
                    >
                      {ln}
                    </text>
                  ))}
                  <text
                    x={c.x + c.w / 2} y={ty + lines.length * lh + 2} textAnchor="middle"
                    fill={labelColor} fontFamily="Inter, sans-serif" fontSize={valSize} fontWeight={700} opacity={0.95}
                  >
                    {fmt(c.value, digits)} {unit}
                  </text>
                  <title>{`${c.name}: ${fmt(c.value, digits)} ${unit}`}</title>
                </g>
              );
            })}
          </g>
        </svg>
      ) : null}
    </div>
  );
}
