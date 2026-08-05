import { useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import {
  Zap, CalendarClock, TrendingDown, BarChart3,
  AlertTriangle, Activity, Sigma, TrendingUp, ShieldCheck,
} from 'lucide-react';

import Header from '@/components/layout/Header';
import KpiCard from '@/components/cards/KpiCard';
import ChartCard from '@/components/charts/ChartCard';
import GaugeChart from '@/components/charts/GaugeChart';
import DataTable from '@/components/common/DataTable';
import DeviationCalendar from '@/components/charts/DeviationCalendar';
import { FilterSelect, FilterResetButton, MonthSelect, fyLabel, FY_QUARTER_LABEL } from '@/components/filters/FilterPrimitives';
import AllocationChip from '@/components/filters/AllocationChip';
import {
  useDeviationFilterOptions, useDeviationKpis, useDeviationTrend, useDeviationCumulative,
  useDeviationHeatmap, useDeviationDistribution, useDeviationInsights, useDeviationTable, DeviationFilters,
} from '@/api/deviationApi';

const EMPTY_FILTERS: DeviationFilters = { year: '', quarter: '', month: '', range: '', discom: 'BSPHCL' };
const PLOT_CONFIG = { displayModeBar: false, responsive: true };
const PLOT_FONT = { family: 'Inter, sans-serif', size: 11, color: '#111827' };
const GRID = 'rgba(15,23,42,0.07)';
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const RANGE_OPTIONS = [
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'currentMonth', label: 'Current Month' },
  { value: 'currentYear', label: 'Current Year' },
];

type Granularity = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

interface TrendPoint {
  entry_date: string;
  actual_drawal_bihar: number;
  total_schedule_bihar: number;
  deviation_energy: number;
}

/** Bucket key for a date at the chosen granularity. */
function bucketOf(dateStr: string, g: Granularity): string {
  const d = dateStr.slice(0, 10);
  if (g === 'daily') return d;
  if (g === 'monthly') return d.slice(0, 7);
  if (g === 'yearly') return d.slice(0, 4);
  if (g === 'quarterly') {
    const m = parseInt(d.slice(5, 7), 10);
    return `${d.slice(0, 4)}-Q${Math.floor((m - 1) / 3) + 1}`;
  }
  // weekly — ISO-ish week start (Monday)
  const dt = new Date(`${d}T00:00:00`);
  const day = (dt.getDay() + 6) % 7; // Mon = 0
  dt.setDate(dt.getDate() - day);
  return dt.toISOString().slice(0, 10);
}

/**
 * Aggregates the backend trend series for display only. Sums are used for energy
 * quantities at coarser granularities — no backend value is recomputed or
 * overridden; daily granularity passes the payload through untouched.
 */
function aggregate(trend: TrendPoint[], g: Granularity): TrendPoint[] {
  if (g === 'daily') return trend;
  const map = new Map<string, TrendPoint>();
  trend.forEach((p) => {
    if (!p.entry_date) return;
    const key = bucketOf(p.entry_date, g);
    const acc = map.get(key);
    if (acc) {
      acc.actual_drawal_bihar += p.actual_drawal_bihar;
      acc.total_schedule_bihar += p.total_schedule_bihar;
      acc.deviation_energy += p.deviation_energy;
    } else {
      map.set(key, {
        entry_date: key,
        actual_drawal_bihar: p.actual_drawal_bihar,
        total_schedule_bihar: p.total_schedule_bihar,
        deviation_energy: p.deviation_energy,
      });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
}

/**
 * Always-on labels: every point is labelled while the points are sparse enough to
 * stay legible; past that, labels are staggered (every n-th) so they can never
 * collide or clip. Nothing is hidden on hover — the tooltip still shows all values.
 */
function labelEvery(count: number): number {
  if (count <= 14) return 1;
  if (count <= 28) return 2;
  if (count <= 60) return 4;
  if (count <= 120) return 8;
  return Math.ceil(count / 14);
}
function thinLabels(values: number[], digits = 1): string[] {
  const step = labelEvery(values.length);
  return values.map((v, i) => (i % step === 0 ? v.toFixed(digits) : ''));
}

/**
 * Day-number ticks with the month printed once underneath.
 *
 * Repeating "01 Apr 2026 / 02 Apr 2026 …" under every point crowded the axis and
 * forced the labels to rotate. Days carry the information; the month only needs
 * saying once. Falls back to the full label when the window spans more than one
 * month (where a bare day number would be ambiguous), and when the series has
 * been aggregated to weeks or coarser.
 */
function dayAxis(dates: string[], granularity: Granularity) {
  const daily = granularity === 'daily';
  const months = new Set(dates.map((d) => d.slice(0, 7)));
  const singleMonth = daily && months.size === 1 && dates.length > 0;
  if (!singleMonth) {
    return { ticks: dates, footer: '', rotate: dates.length > 20 ? -60 : dates.length > 10 ? -35 : 0 };
  }
  const ym = dates[0].slice(0, 7);
  const footer = `${MONTH_LABELS[parseInt(ym.slice(5, 7), 10) - 1]} ${ym.slice(0, 4)}`;
  return { ticks: dates.map((d) => d.slice(8, 10)), footer, rotate: 0 };
}

export default function DeviationDashboard() {
  const [filters, setFilters] = useState<DeviationFilters>(EMPTY_FILTERS);
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { data: options } = useDeviationFilterOptions();
  const { data: kpis, isLoading: kpisLoading, refetch, isFetching } = useDeviationKpis(filters);
  const { data: trend, isLoading: trendLoading } = useDeviationTrend(filters);
  const { data: cumulative, isLoading: cumulativeLoading } = useDeviationCumulative(filters);
  const { data: heatmap, isLoading: heatmapLoading } = useDeviationHeatmap(filters);
  const { data: distribution, isLoading: distLoading } = useDeviationDistribution(filters);
  const { data: insights, isLoading: insightsLoading } = useDeviationInsights(filters);
  const [page, setPage] = useState(1);
  const { data: tableData, isLoading: tableLoading } = useDeviationTable(filters, page, 25);

  const handleChange = (key: keyof DeviationFilters, value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    setGranularity('daily');
    setCustomFrom('');
    setCustomTo('');
  };

  // Custom date-range window (display-side) applied on top of the backend filters.
  const windowed = useMemo<TrendPoint[]>(() => {
    const src = (trend || []) as TrendPoint[];
    if (!customFrom && !customTo) return src;
    return src.filter((p) => {
      const d = (p.entry_date || '').slice(0, 10);
      if (customFrom && d < customFrom) return false;
      if (customTo && d > customTo) return false;
      return true;
    });
  }, [trend, customFrom, customTo]);

  const series = useMemo(() => aggregate(windowed, granularity), [windowed, granularity]);

  const dates = series.map((t) => t.entry_date);
  const actuals = series.map((t) => t.actual_drawal_bihar);
  const schedules = series.map((t) => t.total_schedule_bihar);
  const deviations = series.map((t) => t.deviation_energy);

  const barColors = deviations.map((v) => (v >= 0 ? '#16A34A' : '#DC2626'));
  // Day numbers on the ticks, month named once beneath the axis.
  const { ticks, footer: monthFooter, rotate: tickAngle } = dayAxis(dates, granularity);

  /** Month caption placed under the axis, inside the plot — never over a legend. */
  const monthCaption = monthFooter
    ? [{
        text: monthFooter, xref: 'paper', yref: 'paper', x: 0.5, y: -0.185,
        xanchor: 'center', yanchor: 'top', showarrow: false,
        font: { size: 12, color: '#334155', family: 'Inter, sans-serif' },
      }]
    : [];

  // Sparkline series for the KPI cards — sourced straight from the backend trend.
  const sparkActual = (trend || []).map((t: any) => t.actual_drawal_bihar);
  const sparkSchedule = (trend || []).map((t: any) => t.total_schedule_bihar);
  const sparkDeviation = (trend || []).map((t: any) => t.deviation_energy);

  const cumX = (cumulative || []).map((c: any) => c.entry_date);
  const cumY = (cumulative || []).map((c: any) => c.cumulative);

  const devValue = kpis?.today_deviation ?? 0;

  /** The calendar renders one month — the latest month present in the window. */
  const calendarMonth = useMemo(() => {
    if (!windowed.length) return undefined;
    return windowed[windowed.length - 1].entry_date.slice(0, 7);
  }, [windowed]);

  /** Human label for the window actually being shown (e.g. "01 Apr 2026 - 07 Apr 2026"). */
  const periodLabel = useMemo(() => {
    if (!windowed.length) return '—';
    const pretty = (iso: string) => {
      const d = iso.slice(0, 10);
      const day = d.slice(8, 10);
      const mon = MONTH_LABELS[parseInt(d.slice(5, 7), 10) - 1] ?? '';
      return `${day} ${mon} ${d.slice(0, 4)}`;
    };
    const a = pretty(windowed[0].entry_date);
    const b = pretty(windowed[windowed.length - 1].entry_date);
    return a === b ? a : `${a} - ${b}`;
  }, [windowed]);

  return (
    <div className="flex-1 min-w-0">
      <Header
        title="Bihar UI Deviation Dashboard"
        subtitle="Actual drawal vs scheduled energy — live data · auto-refresh 60s"
        dataMonth={kpis?.latest_date}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      <div className="p-6 space-y-5">
        {/* Filters — all existing filters preserved, plus display granularity & custom range */}
        <div className="card p-3 flex flex-wrap items-center gap-2">
          <FilterSelect value={filters.discom || 'BSPHCL'} onChange={(v) => handleChange('discom', v)} options={options?.discoms || ['BSPHCL', 'NBPDCL', 'SBPDCL']} placeholder="DISCOM" />
          <FilterSelect value={filters.year} onChange={(v) => handleChange('year', v)} options={options?.years || []} placeholder="Year" labelFor={fyLabel} />
          <FilterSelect value={filters.quarter} onChange={(v) => handleChange('quarter', v)} options={options?.quarters || []} placeholder="Quarter" labelFor={(q) => FY_QUARTER_LABEL[q] || q} />
          <MonthSelect value={filters.month} onChange={(v) => handleChange('month', v)} />
          <select
            value={filters.range}
            onChange={(e) => handleChange('range', e.target.value)}
            className="text-xs font-medium border border-border rounded-lg px-2.5 py-2 bg-white text-textprimary outline-none focus:border-primary min-w-[140px]"
          >
            <option value="">Date Range</option>
            {RANGE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>

          <span className="w-px h-6 bg-border mx-1" />

          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as Granularity)}
            className="text-xs font-medium border border-border rounded-lg px-2.5 py-2 bg-white text-textprimary outline-none focus:border-primary min-w-[120px]"
            title="Chart granularity"
          >
            {GRANULARITIES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
          <input
            type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
            className="text-xs font-medium border border-border rounded-lg px-2.5 py-2 bg-white text-textprimary outline-none focus:border-primary"
            title="Custom range — from"
          />
          <input
            type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            className="text-xs font-medium border border-border rounded-lg px-2.5 py-2 bg-white text-textprimary outline-none focus:border-primary"
            title="Custom range — to"
          />

          <FilterResetButton onReset={handleReset} />
        </div>
        <AllocationChip discom={filters.discom} year={filters.year} quarter={filters.quarter} month={filters.month} />

        {/* KPIs — reflect the selected period (default: latest month in the sheet) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            label="Period Actual Drawal" value={fmt(kpis?.today_actual)} unit="MU"
            icon={Zap} color="#1565C0" loading={kpisLoading} sparkline={sparkActual}
            sub={kpis?.period_label ? String(kpis.period_label) : undefined}
          />
          <KpiCard
            label="Period Schedule" value={fmt(kpis?.today_schedule)} unit="MU"
            icon={CalendarClock} color="#F97316" loading={kpisLoading} sparkline={sparkSchedule}
            sub={kpis?.reported_days ? `${kpis.reported_days} reported day${kpis.reported_days === 1 ? '' : 's'}` : undefined}
          />
          <KpiCard
            label="Period Deviation" value={fmt(kpis?.today_deviation)} unit="MU"
            icon={TrendingDown} color={devValue >= 0 ? '#16A34A' : '#DC2626'}
            loading={kpisLoading} sparkline={sparkDeviation} sub="Actual − Schedule"
          />
          <KpiCard
            label="Avg Daily Deviation" value={fmt(kpis?.monthly_avg_deviation)} unit="MU"
            icon={BarChart3} color="#7E57C2" loading={kpisLoading} sparkline={sparkDeviation}
            sub="Mean across selection"
          />
        </div>

        {/* Actual vs Schedule Trend — always-on labels, smooth curves, rounded markers */}
        <ChartCard title="Actual Drawal vs Schedule Trend" loading={trendLoading} height={360}>
          <Plot
            data={[
              {
                x: ticks, y: actuals, type: 'scatter', mode: 'lines+markers+text', name: 'Actual Drawal',
                line: { color: '#1565C0', width: 2.5, shape: 'spline', smoothing: 1.1 },
                marker: { size: 7, symbol: 'circle', line: { color: '#fff', width: 1.5 } },
                text: thinLabels(actuals), textposition: 'top center',
                textfont: { size: 10, color: '#1565C0', family: 'Inter, sans-serif' },
                cliponaxis: false,
                hovertemplate: '<b>%{x}</b><br>Actual: %{y:.2f} MU<extra></extra>',
              },
              {
                x: ticks, y: schedules, type: 'scatter', mode: 'lines+markers+text', name: 'Total Schedule',
                line: { color: '#F97316', width: 2.5, shape: 'spline', smoothing: 1.1 },
                marker: { size: 7, symbol: 'circle', line: { color: '#fff', width: 1.5 } },
                text: thinLabels(schedules), textposition: 'bottom center',
                textfont: { size: 10, color: '#C2410C', family: 'Inter, sans-serif' },
                cliponaxis: false,
                hovertemplate: '<b>%{x}</b><br>Schedule: %{y:.2f} MU<extra></extra>',
              },
            ] as any}
            layout={{
              margin: { t: 24, r: 22, b: 78, l: 56 }, font: PLOT_FONT,
              paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
              legend: { orientation: 'h', y: 1.14, x: 0 },
              hovermode: 'x unified',
              annotations: monthCaption,
              xaxis: { tickangle: tickAngle, automargin: true, showgrid: false, type: 'category' },
              yaxis: { title: { text: 'MU' }, gridcolor: GRID, zeroline: false, automargin: true },
            } as any}
            config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
          />
        </ChartCard>

        {/* Daily Deviation + Gauge */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard title="Deviation by Period (MU)" className="lg:col-span-2" loading={trendLoading} height={330}>
            <Plot
              data={[{
                x: ticks, y: deviations, type: 'bar',
                marker: { color: barColors, line: { width: 0 } },
                // Rounded bar corners
                marker_cornerradius: 6,
                text: thinLabels(deviations),
                textposition: 'outside',
                textfont: { size: 10, family: 'Inter, sans-serif' },
                cliponaxis: false,
                hovertemplate: '<b>%{x}</b><br>Deviation: %{y:.2f} MU<extra></extra>',
              } as any]}
              layout={{
                margin: { t: 32, r: 20, b: 78, l: 56 }, font: PLOT_FONT,
                paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                bargap: dates.length > 40 ? 0.15 : 0.35, // auto bar width
                annotations: monthCaption,
                xaxis: { tickangle: tickAngle, automargin: true, showgrid: false, type: 'category' },
                yaxis: { title: { text: 'MU' }, gridcolor: GRID, zerolinecolor: 'rgba(15,23,42,0.25)', automargin: true },
                uniformtext: { mode: 'show', minsize: 8 },
              } as any}
              config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
            />
          </ChartCard>

          <ChartCard title="Deviation Gauge (MU)" loading={kpisLoading} height={330}>
            <div className="h-full flex flex-col">
              <div className="flex-1 min-h-0">
                <GaugeChart value={devValue} min={-5} max={5} />
              </div>
              {/* Selected period, inside the gauge card — never spills onto a neighbour */}
              <div className="text-[11px] text-center text-textsecondary pb-1 px-2 truncate">
                {periodLabel}
              </div>
            </div>
          </ChartCard>
        </div>

        {/* Cumulative + Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Running Cumulative Deviation" loading={cumulativeLoading} height={320}>
            <Plot
              data={[{
                x: cumX, y: cumY, type: 'scatter', mode: 'lines', fill: 'tozeroy',
                line: { color: '#7E57C2', width: 2.5, shape: 'spline', smoothing: 1.1 },
                fillcolor: 'rgba(126,87,194,0.16)',
                hovertemplate: '<b>%{x}</b><br>Cumulative: %{y:.2f} MU<extra></extra>',
              } as any]}
              layout={{
                margin: { t: 16, r: 20, b: 60, l: 56 }, font: PLOT_FONT,
                paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                xaxis: { tickangle: -30, automargin: true, showgrid: false },
                yaxis: { title: { text: 'MU' }, gridcolor: GRID, automargin: true },
              } as any}
              config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
            />
          </ChartCard>

          <ChartCard title="Deviation Distribution — Histogram" loading={distLoading} height={320}>
            <Plot
              data={[{
                x: distribution?.bins || [], y: distribution?.counts || [], type: 'bar',
                marker: { color: '#42A5F5' }, marker_cornerradius: 5,
                text: (distribution?.counts || []).map((c: number) => (c > 0 ? String(c) : '')),
                textposition: 'outside', textfont: { size: 10 }, cliponaxis: false,
                hovertemplate: '%{x}<br>%{y} days<extra></extra>',
              } as any]}
              layout={{
                margin: { t: 26, r: 20, b: 92, l: 52 }, font: PLOT_FONT,
                paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                xaxis: { tickangle: -45, automargin: true, showgrid: false },
                yaxis: { title: { text: 'Days' }, gridcolor: GRID, automargin: true },
                uniformtext: { mode: 'show', minsize: 8 },
              } as any}
              config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
            />
          </ChartCard>
        </div>

        {/* Calendar — a real month grid; each day shows its date and deviation */}
        <ChartCard title="Calendar Heatmap — Monthly Deviation Pattern" loading={trendLoading} height={420}>
          <DeviationCalendar
            points={windowed.map((p) => ({ date: p.entry_date, value: p.deviation_energy }))}
            month={calendarMonth}
          />
        </ChartCard>

        {/* Executive insights — modern cards with icons + coloured indicators */}
        <div className="card p-5">
          <div className="text-xs font-bold text-textprimary uppercase tracking-wide mb-3">Executive Insights</div>
          {insightsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 w-full rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {(insights || []).map((line: string, i: number) => {
                const s = insightStyle(line);
                return (
                  <div
                    key={i}
                    className="rounded-xl border p-3 flex items-start gap-3 transition-all duration-200 hover:shadow-md"
                    style={{ borderColor: `${s.color}33`, backgroundColor: `${s.color}0D` }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${s.color}1F`, color: s.color }}
                    >
                      <s.Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: s.color }}>{s.tag}</div>
                      <div className="text-[13px] text-textprimary leading-snug mt-0.5">{line}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Daily Detail Table — sticky header, hover rows, pagination (existing component) */}
        <div className="card p-4">
          <div className="text-xs font-bold text-textprimary uppercase tracking-wide mb-3">Daily Detail Table</div>
          <DataTable
            rows={tableData?.rows || []}
            total={tableData?.total || 0}
            page={page}
            pageSize={25}
            onPageChange={setPage}
            loading={tableLoading}
          />
        </div>
      </div>
    </div>
  );
}

function fmt(v?: number) {
  if (v === undefined || v === null) return '—';
  return v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/** Maps a backend insight sentence to an icon, colour and tag — text is unchanged. */
function insightStyle(line: string): { Icon: typeof AlertTriangle; color: string; tag: string } {
  const l = line.toLowerCase();
  if (l.includes('maximum positive')) return { Icon: TrendingUp, color: '#16A34A', tag: 'Peak Over-Draw' };
  if (l.includes('maximum negative') || l.includes('worst')) return { Icon: AlertTriangle, color: '#DC2626', tag: 'Peak Under-Draw' };
  if (l.includes('average')) return { Icon: Sigma, color: '#7E57C2', tag: 'Average' };
  if (l.includes('best')) return { Icon: ShieldCheck, color: '#0EA5E9', tag: 'Best Day' };
  if (l.includes('risk')) return { Icon: Activity, color: '#F97316', tag: 'Risk Level' };
  return { Icon: Activity, color: '#1565C0', tag: 'Insight' };
}
