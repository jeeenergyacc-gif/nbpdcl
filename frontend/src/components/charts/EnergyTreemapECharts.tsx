import EChartBase from '@/components/purchase/EChartBase';
import type { EChartsOption } from 'echarts';
import type { BlockTreemapBucket } from '@/components/charts/BlockTreemap';

interface Props {
  buckets: BlockTreemapBucket[];
  unit?: string;
  digits?: number;
  grandTotal?: number;
  height?: number;
}

/**
 * Real (squarified) treemap via ECharts — the layout engine guarantees children
 * stay INSIDE their parent and tiles never overlap, whatever the data. Parent
 * plant-types carry an upper label; plant tiles show name · MU · % where there's
 * room (ECharts truncates/hides labels that don't fit rather than letting them
 * spill). Clicking a plant-type zooms into it (proper drill-down + breadcrumb) so
 * small tiles are always reachable — no more "+N more" overlap. Pure presentation:
 * values come straight from the same buckets the block layout used.
 */
export default function EnergyTreemapECharts({
  buckets, unit = 'MU', digits = 2, grandTotal, height = 430,
}: Props) {
  const total = grandTotal ?? buckets.reduce((s, b) => s + b.total, 0);
  const fmt = (v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const pctOf = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  const data = buckets.map((b) => ({
    name: b.name,
    value: b.total,
    itemStyle: { color: b.color },
    children: [...b.items]
      .filter((i) => i.value > 0)
      .sort((x, y) => y.value - x.value)
      .map((it) => ({ name: it.name, value: it.value, itemStyle: { color: b.color } })),
  }));

  const option: EChartsOption = {
    tooltip: {
      confine: true,
      formatter: (info: any) => {
        const v = info.value as number;
        const path = (info.treePathInfo || []).map((p: any) => p.name).filter(Boolean).join(' › ');
        return `<div style="font-weight:700">${info.name}</div>` +
          (path ? `<div style="font-size:11px;color:#94a3b8">${path}</div>` : '') +
          `<div>${fmt(v)} ${unit} · <b>${pctOf(v).toFixed(2)}%</b></div>`;
      },
    },
    series: [{
      type: 'treemap',
      roam: false,
      nodeClick: 'zoomToNode',
      width: '100%',
      height: '100%',
      top: 4, left: 4, right: 4, bottom: 24,
      visibleMin: 1,
      breadcrumb: {
        show: true, height: 20, bottom: 0, left: 'center', emptyItemWidth: 18,
        itemStyle: { color: '#1e293b', borderColor: '#334155', borderWidth: 1, textStyle: { color: '#e2e8f0', fontSize: 11 } },
        emphasis: { itemStyle: { color: '#334155' } },
      },
      upperLabel: {
        show: true, height: 24, color: '#fff', fontWeight: 700, fontSize: 12, fontFamily: 'Inter, sans-serif',
        overflow: 'truncate',
        formatter: (p: any) => `  ${p.name}   ·   ${fmt(p.value)} ${unit}   ·   ${pctOf(p.value).toFixed(1)}%`,
      },
      label: {
        show: true, position: 'insideTopLeft', color: '#fff', fontSize: 12, fontWeight: 600,
        lineHeight: 15, fontFamily: 'Inter, sans-serif', overflow: 'truncate',
        formatter: (p: any) => `${p.name}\n${fmt(p.value)} ${unit} · ${pctOf(p.value).toFixed(1)}%`,
      },
      itemStyle: { borderColor: '#fff', borderWidth: 1, gapWidth: 2, borderRadius: 6 },
      levels: [
        { itemStyle: { gapWidth: 6, borderWidth: 0 } },
        {
          itemStyle: { borderColor: '#ffffff', borderWidth: 3, gapWidth: 3, borderRadius: 8 },
          upperLabel: { show: true },
          colorSaturation: [0.4, 0.6],
        },
        {
          itemStyle: { borderColor: 'rgba(255,255,255,0.85)', borderWidth: 1, gapWidth: 1, borderRadius: 4 },
          colorSaturation: [0.32, 0.5],
        },
      ],
      data,
    }],
  };

  return <EChartBase option={option} height={height} />;
}
