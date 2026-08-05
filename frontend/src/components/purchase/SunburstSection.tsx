import PremiumCard from './PremiumCard';
import EChartBase from './EChartBase';
import { plantColor, PLANT_TYPE_ORDER, CHART_FONT, TEXT_MUTED } from './theme';

interface SunburstRow {
  ppa_category: string;
  plant_type: string;
  plant_name: string;
  energy_quantum: number;
}

function categoryColor(cat: string): string {
  const c = cat.toLowerCase();
  if (/renewable/.test(c)) return '#2E9E6C';
  if (/small|biomass|hydro/.test(c)) return '#C79A34';
  if (/conventional/.test(c)) return '#2F6FE0';
  return '#5B7BA6';
}
const typeOrder = (t: string) => {
  const i = PLANT_TYPE_ORDER.indexOf(t);
  return i === -1 ? 99 : i;
};
const fmt = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 2 });

// Slices whose sweep is below this (degrees) get their label moved OUTSIDE to the
// callout column instead of being crammed (and overlapped) inside a thin arc.
const MIN_LABEL_ANGLE = 10;

export default function SunburstSection({ data, loading }: { data: SunburstRow[] | undefined; loading: boolean }) {
  const rows = (data || []).filter((r) => r.energy_quantum > 0);
  const total = rows.reduce((s, r) => s + r.energy_quantum, 0);

  const catMap: Record<string, Record<string, number>> = {};
  rows.forEach((r) => {
    const cat = r.ppa_category || 'Unknown';
    const type = r.plant_type || 'Unknown';
    catMap[cat] ||= {};
    catMap[cat][type] = (catMap[cat][type] || 0) + r.energy_quantum;
  });

  // Plant-type totals (outer ring) for deciding inside vs outside labels.
  const typeTotals: Record<string, number> = {};
  rows.forEach((r) => {
    const t = r.plant_type || 'Unknown';
    typeTotals[t] = (typeTotals[t] || 0) + r.energy_quantum;
  });
  const angleOf = (v: number) => (total ? (v / total) * 360 : 0);
  const outsideTypes = Object.entries(typeTotals)
    .filter(([, v]) => angleOf(v) < MIN_LABEL_ANGLE)
    .sort((a, b) => typeOrder(a[0]) - typeOrder(b[0]));

  const children = Object.entries(catMap).map(([cat, typeMap]) => ({
    name: cat,
    itemStyle: { color: categoryColor(cat) },
    label: { color: '#fff' },
    children: Object.entries(typeMap)
      .sort((a, b) => typeOrder(a[0]) - typeOrder(b[0]))
      .map(([type, val]) => ({
        name: type,
        value: Number(val.toFixed(2)),
        itemStyle: { color: plantColor(type) },
      })),
  }));

  const option = {
    textStyle: { fontFamily: CHART_FONT },
    tooltip: {
      backgroundColor: '#001B48',
      borderColor: 'rgba(242,179,61,0.3)',
      textStyle: { color: '#E8EEFB' },
      formatter: (p: any) => `<b>${p.name}</b><br/>${fmt(p.value)} MU`,
    },
    title: {
      text: 'Total Purchase (excl. Sale)',
      subtext: `${fmt(total)} MU`,
      left: 'center',
      top: 'center',
      textAlign: 'center',
      textStyle: { color: '#EAF2FF', fontSize: 12, fontWeight: 700, fontFamily: CHART_FONT },
      subtextStyle: { color: '#F2B33D', fontSize: 15, fontWeight: 800, fontFamily: CHART_FONT },
    },
    series: [
      {
        type: 'sunburst',
        radius: ['40%', '86%'], // large hole so the centre total never overlaps the ring
        center: ['50%', '52%'],
        sort: undefined,
        emphasis: { focus: 'ancestor' },
        // Horizontal labels only; thin slices are hidden here and shown outside.
        label: {
          show: true,
          rotate: 0,
          color: '#fff',
          fontFamily: CHART_FONT,
          fontSize: 11,
          fontWeight: 700,
          minAngle: MIN_LABEL_ANGLE,
          overflow: 'break',
          formatter: (p: any) => `${p.name}\n${fmt(p.value)} MU`,
        },
        itemStyle: { borderColor: '#00112C', borderWidth: 1.5 },
        levels: [
          {},
          { r0: '40%', r: '63%', label: { rotate: 0, fontSize: 11 } },
          { r0: '63%', r: '86%', label: { rotate: 0, fontSize: 10 } },
        ],
        data: children,
      },
    ],
  };

  return (
    <PremiumCard title="Energy Sunburst — Total › PPA Category › Plant Type" height={480} loading={loading}>
      {rows.length ? (
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex' }}>
          <div style={{ flex: '1 1 0', minWidth: 0, position: 'relative' }}>
            <EChartBase option={option as any} />
            {/* Central (left) / Intra (right) — compact curved arrows, not straight */}
            <div style={{ position: 'absolute', left: 6, top: '34%', color: '#9EC5F5', fontFamily: CHART_FONT, fontWeight: 700, fontSize: 12 }}>
              Central <span style={{ fontSize: 15 }}>⤵</span>
            </div>
            <div style={{ position: 'absolute', right: 6, top: '30%', textAlign: 'right', color: '#8FE0B4', fontFamily: CHART_FONT, fontWeight: 700, fontSize: 12 }}>
              <span style={{ fontSize: 15 }}>⤴</span> Intra
            </div>
          </div>

          {/* Outside labels for thin slices — horizontal, spaced, never overlapping */}
          {outsideTypes.length > 0 && (
            <div style={{ width: 132, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, paddingRight: 6 }}>
              {outsideTypes.map(([type, val]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: plantColor(type), flexShrink: 0 }} />
                  <div style={{ lineHeight: 1.15 }}>
                    <div style={{ color: plantColor(type), fontWeight: 700, fontSize: 11, fontFamily: CHART_FONT }}>{type}</div>
                    <div style={{ color: '#E8EEFB', fontWeight: 700, fontSize: 11, fontFamily: CHART_FONT }}>{fmt(val)} MU</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-sm" style={{ color: TEXT_MUTED }}>No data available</div>
      )}
    </PremiumCard>
  );
}
