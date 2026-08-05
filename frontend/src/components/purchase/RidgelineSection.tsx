import PremiumCard from './PremiumCard';
import EChartBase from './EChartBase';
import { plantColor, TEXT_MUTED, CHART_FONT } from './theme';

interface HeatmapPayload {
  plant_types: string[];
  months: string[];
  z: number[][];
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Fixed top-to-bottom row order for the ridgeline, matching the reference composition.
const RIDGE_ORDER = ['Thermal', 'Hydro', 'Solar', 'Wind', 'Biomass', 'Sugar'];
const BAND_HEIGHT = 100;

export default function RidgelineSection({ data, loading }: { data: HeatmapPayload | undefined; loading: boolean }) {
  const plantTypes = data?.plant_types || [];
  const months = data?.months || [];
  const z = data?.z || [];

  const orderedTypes = RIDGE_ORDER.filter((t) => plantTypes.some((p) => p.toLowerCase() === t.toLowerCase()))
    .concat(plantTypes.filter((p) => !RIDGE_ORDER.some((t) => t.toLowerCase() === p.toLowerCase())));

  // Year-aware labels for multi-year spans (future 12-month window safety).
  const yearsInData = new Set(months.map((m) => m.slice(0, 4)));
  const monthLabels = months.map((m) => {
    const idx = parseInt(m.slice(5, 7), 10) - 1;
    const base = MONTH_LABELS[idx] ?? m;
    return yearsInData.size > 1 ? `${base} '${m.slice(2, 4)}` : base;
  });

  const rowCount = orderedTypes.length;
  // Rows are drawn top-down; baseline index 0 = topmost band.
  const series = orderedTypes.map((type, rowIdx) => {
    const srcRow = plantTypes.findIndex((p) => p === type);
    const rawValues = srcRow >= 0 ? (z[srcRow] || []) : months.map(() => 0);
    const rowMax = Math.max(1, ...rawValues);
    const baseline = (rowCount - 1 - rowIdx) * BAND_HEIGHT; // last row sits at y=0
    const values = rawValues.map((v) => baseline + (v / rowMax) * BAND_HEIGHT * 0.82);

    return {
      name: type,
      type: 'line',
      data: values,
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      itemStyle: { color: plantColor(type) },
      lineStyle: { color: plantColor(type), width: 2 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: plantColor(type) },
            { offset: 1, color: 'rgba(0,17,44,0)' },
          ],
        },
        opacity: 0.55,
      },
      label: {
        show: true,
        formatter: (p: any) => rawValues[p.dataIndex]?.toFixed(1),
        color: '#E8EEFB',
        fontSize: 10,
        position: 'top',
      },
      z: rowCount - rowIdx,
    };
  });

  const option = {
    textStyle: { fontFamily: CHART_FONT },
    grid: { left: 90, right: 24, top: 10, bottom: 30 },
    xAxis: {
      type: 'category',
      data: monthLabels,
      boundaryGap: false,
      axisLabel: { color: '#E8EEFB', fontWeight: 600 },
      axisLine: { lineStyle: { color: 'rgba(143,163,199,0.3)' } },
      splitLine: { show: true, lineStyle: { color: 'rgba(143,163,199,0.08)' } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: rowCount * BAND_HEIGHT,
      show: false,
    },
    tooltip: { show: false },
    series,
  };

  return (
    <PremiumCard title="Monthly Energy Trend by PPA Type — Ridgeline" height={520} loading={loading}>
      <div className="flex h-full">
        <div className="flex flex-col justify-between py-2 pr-2 shrink-0" style={{ width: 96 }}>
          {orderedTypes.map((type) => {
            const srcRow = plantTypes.findIndex((p) => p === type);
            const total = (srcRow >= 0 ? z[srcRow] || [] : []).reduce((s, v) => s + v, 0);
            return (
              <div key={type} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: plantColor(type) }} />
                <div className="leading-tight">
                  <div className="text-[11px] font-bold" style={{ color: plantColor(type) }}>{type}</div>
                  <div className="text-[10px]" style={{ color: TEXT_MUTED }}>{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })} MU</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex-1 min-w-0">
          {orderedTypes.length && months.length >= 2 ? (
            <EChartBase option={option as any} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-6" style={{ color: TEXT_MUTED }}>
              {orderedTypes.length ? (
                <>
                  <div className="text-sm font-semibold" style={{ color: '#E8EEFB' }}>
                    Single reporting period ({monthLabels[0] ?? '—'})
                  </div>
                  <div className="text-xs mt-1">
                    A ridgeline needs at least two months to show a distribution over time.
                    Values are not interpolated — this view unlocks automatically once more
                    months are present in the sheet.
                  </div>
                </>
              ) : (
                'No data available'
              )}
            </div>
          )}
        </div>
      </div>
    </PremiumCard>
  );
}
