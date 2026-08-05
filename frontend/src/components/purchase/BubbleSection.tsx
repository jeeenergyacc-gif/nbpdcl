import PremiumCard from './PremiumCard';
import EChartBase from './EChartBase';
import { plantColor, PLANT_TYPE_ORDER, TEXT_MUTED, CHART_FONT } from './theme';

interface BubbleRow {
  plant_name: string;
  plant_type: string;
  total_energy: number;
}

const MAX_BUBBLES = 14; // keep labels legible & non-overlapping

export default function BubbleSection({ data, loading }: { data: BubbleRow[] | undefined; loading: boolean }) {
  // Largest plants first; capped so bubbles never collide. (Full plant list is
  // available in the tabular report.)
  const rows = (data || [])
    .filter((r) => r.total_energy > 0)
    .sort((a, b) => b.total_energy - a.total_energy)
    .slice(0, MAX_BUBBLES);

  const maxVal = Math.max(1, ...rows.map((r) => r.total_energy));
  const names = rows.map((r) => r.plant_name);

  // Size scales with energy but is capped so the biggest bubble fits its slot
  // and stays inside the plot area.
  const sizeFor = (v: number) => 16 + Math.sqrt(v / maxVal) * 40;

  const points = rows.map((r) => ({
    name: r.plant_name,
    value: [r.plant_name, Number(r.total_energy.toFixed(2))],
    symbolSize: sizeFor(r.total_energy),
    itemStyle: {
      color: {
        type: 'radial', x: 0.35, y: 0.32, r: 0.7,
        colorStops: [
          { offset: 0, color: '#ffffff' },
          { offset: 0.28, color: plantColor(r.plant_type) },
          { offset: 1, color: plantColor(r.plant_type) },
        ],
      },
      shadowColor: 'rgba(0,0,0,0.45)', shadowBlur: 8, shadowOffsetY: 4,
    },
  }));

  // Legend built from the plant types actually present, in fixed order.
  const typesPresent = PLANT_TYPE_ORDER.filter((t) =>
    rows.some((r) => (r.plant_type || '').toLowerCase() === t.toLowerCase())
  );

  const option = {
    textStyle: { fontFamily: CHART_FONT },
    grid: { left: 64, right: 30, top: 24, bottom: 96 },
    xAxis: {
      type: 'category',
      data: names,
      boundaryGap: true,
      axisLine: { lineStyle: { color: 'rgba(143,163,199,0.4)' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#E8EEFB', fontSize: 10, fontWeight: 600, interval: 0, hideOverlap: false,
        formatter: (v: string) => (v.length > 12 ? v.slice(0, 11) + '…' : v),
        rotate: 30,
      },
    },
    yAxis: {
      type: 'value',
      name: 'Energy (MU)',
      min: 0,
      max: Math.ceil((maxVal * 1.25) / 10) * 10, // headroom so top bubble isn't clipped
      nameTextStyle: { color: TEXT_MUTED },
      splitLine: { lineStyle: { color: 'rgba(143,163,199,0.15)' } },
      axisLabel: { color: TEXT_MUTED },
    },
    tooltip: {
      backgroundColor: '#001B48',
      borderColor: 'rgba(242,179,61,0.3)',
      textStyle: { color: '#E8EEFB' },
      formatter: (p: any) => `<b>${p.data.name}</b><br/>${Number(p.data.value[1]).toLocaleString('en-IN', { maximumFractionDigits: 2 })} MU`,
    },
    series: [
      {
        type: 'scatter',
        data: points,
        label: {
          show: true,
          position: 'top',
          distance: 4,
          color: '#EAF2FF',
          fontFamily: CHART_FONT,
          fontWeight: 700,
          fontSize: 10,
          formatter: (p: any) => `${Number(p.data.value[1]).toFixed(2)}`,
        },
        emphasis: { scale: 1.08 },
      },
    ],
    // Manual legend row (plant types)
    legend: {
      show: true,
      bottom: 2,
      data: typesPresent,
      textStyle: { color: '#E8EEFB', fontFamily: CHART_FONT },
      itemWidth: 12, itemHeight: 12,
    },
  };

  // Legend needs matching series names; add hidden per-type series for swatches.
  const legendSeries = typesPresent.map((t) => ({
    name: t, type: 'scatter', data: [], itemStyle: { color: plantColor(t) },
  }));
  (option.series as any).push(...legendSeries);

  return (
    <PremiumCard title="Plant Wise Energy — Bubble (Size = Energy, Colour = Plant Type)" height={460} loading={loading}>
      {rows.length ? <EChartBase option={option as any} /> : (
        <div className="flex items-center justify-center h-full text-sm" style={{ color: TEXT_MUTED }}>No data available</div>
      )}
    </PremiumCard>
  );
}
