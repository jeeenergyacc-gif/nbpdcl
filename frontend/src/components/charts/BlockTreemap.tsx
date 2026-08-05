export interface BlockTreemapItem {
  name: string;
  value: number;
}
export interface BlockTreemapBucket {
  /** Parent group name shown in the header (e.g. a PPA category, a plant type). */
  name: string;
  total: number;
  /** Base colour — the header and every child block are shaded from this. */
  color: string;
  items: BlockTreemapItem[];
}

interface BlockTreemapProps {
  buckets: BlockTreemapBucket[];
  unit?: string;
  digits?: number;
  /** Optional grand total, used to print a % under each block. */
  grandTotal?: number;
  height?: number;
  headerTextColor?: string;
}

const shade = (hex: string, pct: number) => {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = cl(((n >> 16) & 255) * (1 + pct));
  const g = cl(((n >> 8) & 255) * (1 + pct));
  const b = cl((n & 255) * (1 + pct));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
};

const FONT = "'Inter', system-ui, sans-serif";

/**
 * Block treemap — the same construction used by the Power Purchase dashboard.
 *
 * Deliberately NOT value-proportional: a true treemap sizes tiles by value, which
 * lets one dominant item (Thermal, Sugar) swallow the panel and clip every other
 * label. Here the parent groups share the space evenly and the children inside a
 * group are balanced, so every block stays readable. The numbers are printed in
 * the blocks — the area is a layout device, not the measurement.
 */
export default function BlockTreemap({
  buckets, unit = 'MU', digits = 2, grandTotal, height = 440, headerTextColor = '#EAF2FF',
}: BlockTreemapProps) {
  const fmt = (v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const pctOf = (v: number) => (grandTotal ? `${((v / grandTotal) * 100).toFixed(1)}%` : null);

  const ordered = [...buckets].filter((b) => b.total > 0).sort((a, b) => b.total - a.total);
  if (!ordered.length) return null;

  const [lead, ...rest] = ordered;

  const Block = ({ item, color, flex }: { item: BlockTreemapItem; color: string; flex: number }) => {
    const pct = pctOf(item.value);
    // Font scales with the block's share of its group. Every block can SHRINK
    // (minHeight:0) so flexbox always packs the group inside its fixed box — tiles
    // never overflow onto the group below. Priority when space is tight:
    // name → value → percentage (the % is the first to drop).
    const weight = Math.min(1, flex / 2.2);
    const nameSize = Math.round(10 + weight * 3);   // 10 → 13
    const valueSize = Math.round(9 + weight * 2);   // 9  → 11
    const showPct = !!pct && flex >= 0.9;

    return (
      <div
        style={{
          flex, minHeight: 0, minWidth: 0, borderRadius: 10,
          background: `linear-gradient(180deg, ${shade(color, 0.18)} 0%, ${shade(color, -0.24)} 100%)`,
          border: `1px solid ${shade(color, -0.34)}`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: '3px 5px', overflow: 'hidden',
          containerType: 'inline-size',
        }}
        // Full, untruncated text is always available on hover.
        title={`${item.name} — ${fmt(item.value)} ${unit}${pct ? ` (${pct})` : ''}`}
      >
        <div
          style={{
            color: '#fff', fontWeight: 700, fontSize: nameSize, lineHeight: 1.12, fontFamily: FONT,
            width: '100%',
            // clamp to 2 lines: text can never spill onto the block below it
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', wordBreak: 'break-word',
          }}
        >
          {item.name}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.94)', fontWeight: 600, fontSize: valueSize, fontFamily: FONT, whiteSpace: 'nowrap' }}>
          {fmt(item.value)} {unit}
        </div>
        {showPct && (
          <div style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600, fontSize: valueSize - 1, fontFamily: FONT }}>{pct}</div>
        )}
      </div>
    );
  };

  const Header = ({ b }: { b: BlockTreemapBucket }) => {
    const pct = pctOf(b.total);
    return (
      <div
        style={{
          borderRadius: 10, background: b.color, padding: '7px 10px', textAlign: 'center',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)', flexShrink: 0,
        }}
      >
        <div style={{ color: headerTextColor, fontWeight: 700, fontSize: 12.5, lineHeight: 1.15, fontFamily: FONT }}>{b.name}</div>
        <div style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, fontSize: 11, fontFamily: FONT }}>
          {fmt(b.total)} {unit}{pct ? ` · ${pct}` : ''}
        </div>
      </div>
    );
  };

  /** One group: header on top, dominant child as a large block, the rest in a row below. */
  const Group = ({ b, flex }: { b: BlockTreemapBucket; flex: number }) => {
    const items = [...b.items].filter((i) => i.value > 0).sort((x, y) => y.value - x.value);
    if (!items.length) {
      return (
        <div style={{ flex, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Header b={b} />
          <Block item={{ name: b.name, value: b.total }} color={b.color} flex={1} />
        </div>
      );
    }
    const [first, ...others] = items;
    // Cap the tail so no single row becomes an unreadable sliver.
    const tail = others.slice(0, 4);
    const overflow = others.length - tail.length;
    return (
      <div style={{ flex, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Header b={b} />
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Block item={first} color={b.color} flex={tail.length ? 2.2 : 1} />
          {tail.length > 0 && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 8 }}>
              {tail.map((it) => <Block key={it.name} item={it} color={b.color} flex={1} />)}
              {overflow > 0 && (
                <Block item={{ name: `+${overflow} more`, value: others.slice(tail.length).reduce((s, o) => s + o.value, 0) }} color={b.color} flex={1} />
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Lead group on the left; the remaining groups stack on the right — the same
  // two-column arrangement as the Power Purchase treemap.
  return (
    <div style={{ width: '100%', height, display: 'flex', gap: 8, padding: 6, boxSizing: 'border-box' }}>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Group b={lead} flex={1} />
      </div>
      {rest.length > 0 && (
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rest.map((b) => <Group key={b.name} b={b} flex={1} />)}
        </div>
      )}
    </div>
  );
}
