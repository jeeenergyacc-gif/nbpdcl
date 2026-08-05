import PremiumCard from './PremiumCard';
import EChartBase from './EChartBase';
import { PLANT_TYPE_ORDER, TEXT_MUTED, CHART_FONT } from './theme';

interface HeatmapPayload {
  plant_types: string[];
  months: string[];
  z: number[][];
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function HeatmapSection({ data, loading }: { data: HeatmapPayload | undefined; loading: boolean }) {
  const plantTypes = data?.plant_types || [];
  const months = data?.months || [];
  const z = data?.z || [];

  // Re-order rows into the fixed canonical plant-type order (never sorted by value).
  const orderedTypes = PLANT_TYPE_ORDER.filter((t) => plantTypes.some((p) => p.toLowerCase() === t.toLowerCase()))
    .concat(plantTypes.filter((p) => !PLANT_TYPE_ORDER.some((t) => t.toLowerCase() === p.toLowerCase())));

  const cells: [number, number, number][] = [];
  orderedTypes.forEach((type, rowIdx) => {
    const srcRow = plantTypes.findIndex((p) => p === type);
    months.forEach((_, colIdx) => {
      const val = srcRow >= 0 ? z[srcRow]?.[colIdx] ?? 0 : 0;
      cells.push([colIdx, rowIdx, val]);
    });
  });

  // Year-aware labels: keep clean "Apr" for a single-year span (matches the
  // reference), but disambiguate to "Apr '26" once the data spans >1 year — so a
  // future 12-month window like Apr-2026 → Mar-2027 never shows repeated month
  // names without a year.
  const yearsInData = new Set(months.map((m) => m.slice(0, 4)));
  const monthLabels = months.map((m) => {
    const idx = parseInt(m.slice(5, 7), 10) - 1;
    const base = MONTH_LABELS[idx] ?? m;
    return yearsInData.size > 1 ? `${base} '${m.slice(2, 4)}` : base;
  });

  const maxVal = Math.max(1, ...cells.map((c) => c[2]));

  // Financial-year / period caption (Indian FY: Apr→Mar). Shows which year the
  // heatmap covers, e.g. "FY 2026-27 · Apr 2026" or a range for multi-month data.
  const fyLabel = (ym: string) => {
    const y = parseInt(ym.slice(0, 4), 10);
    const m = parseInt(ym.slice(5, 7), 10);
    const start = m >= 4 ? y : y - 1;
    return `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}`;
  };
  const prettyMonth = (ym: string) => {
    const idx = parseInt(ym.slice(5, 7), 10) - 1;
    return `${MONTH_LABELS[idx] ?? ''} ${ym.slice(0, 4)}`;
  };
  let periodCaption = '';
  if (months.length === 1) {
    periodCaption = `${fyLabel(months[0])} · ${prettyMonth(months[0])}`;
  } else if (months.length > 1) {
    const a = months[0], b = months[months.length - 1];
    const fy = fyLabel(a) === fyLabel(b) ? fyLabel(a) : `${fyLabel(a)} → ${fyLabel(b)}`;
    periodCaption = `${fy} · ${prettyMonth(a)} – ${prettyMonth(b)}`;
  }

  const option = {
    textStyle: { fontFamily: CHART_FONT },
    grid: { left: 90, right: 24, top: 20, bottom: 70 },
    xAxis: {
      type: 'category',
      data: monthLabels,
      splitArea: { show: true },
      axisLabel: { color: '#E8EEFB', fontWeight: 600 },
      axisLine: { lineStyle: { color: 'rgba(143,163,199,0.3)' } },
    },
    yAxis: {
      type: 'category',
      data: orderedTypes,
      splitArea: { show: true },
      axisLabel: { color: '#E8EEFB', fontWeight: 600 },
      axisLine: { lineStyle: { color: 'rgba(143,163,199,0.3)' } },
    },
    visualMap: {
      min: 0,
      max: maxVal,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      textStyle: { color: TEXT_MUTED },
      inRange: { color: ['#1e3a8a', '#2563eb', '#22c55e', '#eab308', '#f97316', '#dc2626'] },
    },
    tooltip: {
      backgroundColor: '#001B48',
      borderColor: 'rgba(242,179,61,0.3)',
      textStyle: { color: '#E8EEFB' },
      formatter: (p: any) => `${orderedTypes[p.value[1]]} · ${monthLabels[p.value[0]]}<br/><b>${Number(p.value[2]).toLocaleString('en-IN')}</b> MU`,
    },
    series: [
      {
        type: 'heatmap',
        data: cells,
        label: {
          show: true,
          color: '#0A1730',
          fontWeight: 700,
          fontSize: 11,
          formatter: (p: any) => Number(p.value[2]).toLocaleString('en-IN', { maximumFractionDigits: Number(p.value[2]) < 100 ? 1 : 0 }),
        },
        itemStyle: { borderColor: '#00112C', borderWidth: 2 },
      },
    ],
  };

  return (
    <PremiumCard title="Monthly Energy Heatmap" subtitle={periodCaption} height={440} loading={loading}>
      {orderedTypes.length ? <EChartBase option={option as any} /> : (
        <div className="flex items-center justify-center h-full text-sm" style={{ color: TEXT_MUTED }}>No data available</div>
      )}
    </PremiumCard>
  );
}
