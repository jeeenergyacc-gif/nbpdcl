import { useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import {
  Zap, MapPin, Building2, Radio, GitBranch, Scale,
  TrendingUp, TrendingDown, Activity, Trophy, AlertTriangle, ChevronRight, Home,
} from 'lucide-react';

import Header from '@/components/layout/Header';
import KpiCard from '@/components/cards/KpiCard';
import ChartCard from '@/components/charts/ChartCard';
import CircleContributionRadial from '@/components/charts/CircleContributionRadial';
import DataTable from '@/components/common/DataTable';
import { FilterSelect, FilterResetButton, MonthSelect, fyLabel, FY_QUARTER_LABEL } from '@/components/filters/FilterPrimitives';
import {
  useInputEnergyFilterOptions, useInputEnergyKpis, useInputEnergyTrend,
  useInputEnergyCircleRanking, useInputEnergyCircleHeatmap, useInputEnergyTreemap,
  useInputEnergyInsights, useInputEnergyTable, InputEnergyFilters,
} from '@/api/inputEnergyApi';
import { useSharingSplit } from '@/api/sharingApi';

const EMPTY_FILTERS: InputEnergyFilters = {
  year: '', quarter: '', month: '', discom_name: 'BSPHCL', circle: '', division: '',
  substation: '', feeder_name: '', feeder_type: '', search: '',
};

const PLOT_CONFIG = { displayModeBar: false, responsive: true };
const PLOT_FONT = { family: 'Inter, sans-serif', size: 11, color: '#111827' };
const GRID = 'rgba(15,23,42,0.07)';

/** Fixed circle palette — a circle keeps its colour across every chart. */
const CIRCLE_COLORS = [
  '#2563EB', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#6366F1',
  '#84CC16', '#A855F7',
];
const colorFor = (name: string, all: string[]) => CIRCLE_COLORS[Math.max(0, all.indexOf(name)) % CIRCLE_COLORS.length];

type Period = 'monthly' | 'quarterly' | 'halfyearly' | 'yearly' | 'financial';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'halfyearly', label: 'Half Yearly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'financial', label: 'Financial Year' },
];

interface TrendRow { year_month: string; energy_quantum: number; }
interface TreemapRow { circle: string; division: string; energy_quantum: number; }

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (v?: number, d = 2) =>
  v === undefined || v === null ? '—' : v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Pretty label for a YYYY-MM key — this dashboard is monthly, never day-wise. */
const monthLabel = (ym: string) => `${MONTH_ABBR[parseInt(ym.slice(5, 7), 10) - 1] ?? ym} ${ym.slice(0, 4)}`;

/** Buckets the backend monthly series for display. No value is recomputed —
 *  monthly energy is summed into the coarser period. */
function bucketKey(ym: string, p: Period): string {
  const y = parseInt(ym.slice(0, 4), 10);
  const m = parseInt(ym.slice(5, 7), 10);
  if (p === 'monthly') return ym;

  // Everything coarser than a month is FINANCIAL-year based (Apr → Mar), to match
  // the rest of the app (backend FY_QUARTERS, the filter bar, the booklet):
  //   Q1 = Apr-Jun, Q2 = Jul-Sep, Q3 = Oct-Dec, Q4 = Jan-Mar
  // Jan/Feb/Mar belong to the PREVIOUS financial year, so both the quarter number
  // and the year label shift for them. The old code used calendar quarters, which
  // mislabelled Apr-Jun as "Q2" and put Jan-Mar in the wrong year.
  const fy = m >= 4 ? y : y - 1;               // financial-year start year
  const fyMonthIndex = (m - 4 + 12) % 12;      // 0 for Apr … 11 for Mar
  const fyTag = `FY${String(fy).slice(2)}-${String((fy + 1) % 100).padStart(2, '0')}`;  // e.g. FY26-27

  if (p === 'quarterly') {
    const q = Math.floor(fyMonthIndex / 3) + 1;   // Apr-Jun→1 … Jan-Mar→4
    return `${fyTag} Q${q}`;
  }
  if (p === 'halfyearly') {
    const h = fyMonthIndex < 6 ? 1 : 2;           // Apr-Sep→H1, Oct-Mar→H2
    return `${fyTag} H${h}`;
  }
  if (p === 'yearly') return `${y}`;              // plain calendar year (unchanged)
  // financial year label
  return `FY ${fy}-${String((fy + 1) % 100).padStart(2, '0')}`;
}
function bucketSeries(trend: TrendRow[], p: Period) {
  const map = new Map<string, number>();
  trend.forEach((t) => {
    if (!t.year_month) return;
    const k = bucketKey(t.year_month, p);
    map.set(k, (map.get(k) || 0) + t.energy_quantum);
  });
  const keys = Array.from(map.keys()).sort();
  return { labels: keys.map((k) => (p === 'monthly' ? monthLabel(k) : k)), values: keys.map((k) => map.get(k) || 0) };
}

/** Labels stay on permanently; they stagger once points get dense so they can
 *  never overlap or clip. */
function thinLabels(values: number[], digits = 0): string[] {
  const n = values.length;
  const step = n <= 14 ? 1 : n <= 28 ? 2 : n <= 60 ? 4 : Math.ceil(n / 14);
  return values.map((v, i) => (i % step === 0 ? fmt(v, digits) : ''));
}

/** Graceful axis-tick truncation — long circle names get an ellipsis, the full
 *  name still shows in the tooltip (which reads the untruncated x data). */
const truncate = (s: string, n = 12) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default function InputEnergyDashboard() {
  const [filters, setFilters] = useState<InputEnergyFilters>(EMPTY_FILTERS);
  const [period, setPeriod] = useState<Period>('monthly');
  const [drillCircle, setDrillCircle] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data: options } = useInputEnergyFilterOptions();
  const { data: kpis, isLoading: kpisLoading, refetch, isFetching } = useInputEnergyKpis(filters);
  const { data: trend, isLoading: trendLoading } = useInputEnergyTrend(filters);
  const { data: circleRanking, isLoading: circleLoading } = useInputEnergyCircleRanking(filters);
  const { data: circleHeatmap, isLoading: heatLoading } = useInputEnergyCircleHeatmap(filters);
  const { data: treemap, isLoading: treemapLoading } = useInputEnergyTreemap(filters);
  const { data: insights, isLoading: insightsLoading } = useInputEnergyInsights(filters);
  const { data: tableData, isLoading: tableLoading } = useInputEnergyTable(filters, page, 25);

  const handleChange = (key: keyof InputEnergyFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const handleReset = () => { setFilters(EMPTY_FILTERS); setPeriod('monthly'); setDrillCircle(null); setPage(1); };

  const trendRows = (trend || []) as TrendRow[];
  const treeRows = ((treemap || []) as TreemapRow[]).filter((r) => r.energy_quantum > 0);

  const monthly = useMemo(() => bucketSeries(trendRows, 'monthly'), [trendRows]);
  const quarterly = useMemo(() => bucketSeries(trendRows, 'quarterly'), [trendRows]);
  const yearly = useMemo(() => bucketSeries(trendRows, 'yearly'), [trendRows]);
  const periodSeries = useMemo(() => bucketSeries(trendRows, period), [trendRows, period]);

  // Circles (fixed order = highest energy first) and their colours.
  const circles = useMemo(
    () => ((circleRanking || []) as any[]).filter((c) => c.energy_quantum > 0).map((c) => ({ name: c.circle, value: c.energy_quantum })),
    [circleRanking]
  );
  const circleNames = circles.map((c) => c.name);
  const circleTotal = circles.reduce((s, c) => s + c.value, 0);

  // Divisions grouped under each circle — powers both the legend and the treemap drill-down.
  const divisionsByCircle = useMemo(() => {
    const map = new Map<string, { division: string; value: number }[]>();
    treeRows.forEach((r) => {
      const list = map.get(r.circle) || [];
      list.push({ division: r.division, value: r.energy_quantum });
      map.set(r.circle, list);
    });
    map.forEach((list) => list.sort((a, b) => b.value - a.value));
    return map;
  }, [treeRows]);

  // Net energy = import + export (export arrives negative from the backend).
  const netEnergy = (kpis?.import_energy ?? 0) + (kpis?.export_energy ?? 0);
  const sparkTrend = trendRows.map((t) => t.energy_quantum);

  // ---- Pareto (80/20) over circles — cumulative % is display maths over
  // backend-supplied circle totals; no value is invented.
  const pareto = useMemo(() => {
    let running = 0;
    return circles.map((c) => {
      running += c.value;
      return { name: c.name, value: c.value, cum: circleTotal ? (running / circleTotal) * 100 : 0 };
    });
  }, [circles, circleTotal]);

  // ---- Treemap (drill-down: circles → divisions of the selected circle)
  const treemapView = useMemo(() => {
    if (drillCircle) {
      const list = divisionsByCircle.get(drillCircle) || [];
      const tot = list.reduce((s, d) => s + d.value, 0);
      return {
        labels: list.map((d) => d.division),
        values: list.map((d) => d.value),
        colors: list.map(() => colorFor(drillCircle, circleNames)),
        total: tot,
      };
    }
    return {
      labels: circles.map((c) => c.name),
      values: circles.map((c) => c.value),
      colors: circles.map((c) => colorFor(c.name, circleNames)),
      total: circleTotal,
    };
  }, [drillCircle, divisionsByCircle, circles, circleNames, circleTotal]);

  // ---- Executive insight cards, derived from the backend circle × month matrix.
  const derivedInsights = useMemo(() => {
    const out: { tag: string; text: string; Icon: typeof Trophy; color: string }[] = [];
    if (circles.length) {
      const top = circles[0];
      const bottom = circles[circles.length - 1];
      out.push({ tag: 'Highest Energy Circle', text: `${top.name} — ${fmt(top.value)} MU (${((top.value / circleTotal) * 100).toFixed(1)}% of network)`, Icon: Trophy, color: '#16A34A' });
      out.push({ tag: 'Lowest Energy Circle', text: `${bottom.name} — ${fmt(bottom.value)} MU (${((bottom.value / circleTotal) * 100).toFixed(1)}% of network)`, Icon: AlertTriangle, color: '#DC2626' });
    }

    const hm = circleHeatmap as { circles: string[]; months: string[]; z: number[][] } | undefined;
    if (hm?.z?.length && hm.months.length >= 2) {
      const stats = hm.circles.map((c, i) => {
        const series = hm.z[i] || [];
        const first = series[0] || 0;
        const last = series[series.length - 1] || 0;
        const growth = first ? ((last - first) / first) * 100 : 0;
        const mean = series.reduce((s, v) => s + v, 0) / (series.length || 1);
        const sd = Math.sqrt(series.reduce((s, v) => s + (v - mean) ** 2, 0) / (series.length || 1));
        const cv = mean ? (sd / mean) * 100 : Infinity;
        return { name: c, growth, cv };
      });
      const grown = [...stats].sort((a, b) => b.growth - a.growth)[0];
      const declined = [...stats].sort((a, b) => a.growth - b.growth)[0];
      const stable = [...stats].sort((a, b) => a.cv - b.cv)[0];
      if (grown) out.push({ tag: 'Highest Growth', text: `${grown.name} grew ${grown.growth >= 0 ? '+' : ''}${grown.growth.toFixed(1)}% across the period`, Icon: TrendingUp, color: '#0EA5E9' });
      if (declined) out.push({ tag: 'Largest Decline', text: `${declined.name} moved ${declined.growth.toFixed(1)}% across the period`, Icon: TrendingDown, color: '#F97316' });
      if (stable && isFinite(stable.cv)) out.push({ tag: 'Most Stable Circle', text: `${stable.name} — lowest month-to-month variation (${stable.cv.toFixed(1)}% CV)`, Icon: Activity, color: '#7E57C2' });
    }

    out.push({
      tag: 'Net Energy',
      text: `Import ${fmt(kpis?.import_energy)} MU − Export ${fmt(Math.abs(kpis?.export_energy ?? 0))} MU = ${fmt(netEnergy)} MU`,
      Icon: Scale, color: '#1565C0',
    });
    return out;
  }, [circles, circleTotal, circleHeatmap, kpis, netEnergy]);

  const heat = circleHeatmap as { circles: string[]; months: string[]; z: number[][] } | undefined;

  // Heatmap hygiene: never render an "Unknown" circle or a circle whose entire
  // row is 0 MU — those tiles carry no information and clutter the grid. Backend
  // data is untouched; this is a pure display filter over the returned matrix.
  const heatFiltered = useMemo(() => {
    if (!heat?.z?.length) return heat;
    const keep = heat.circles
      .map((name, i) => ({ name, i }))
      .filter(({ name, i }) => {
        const isUnknown = !name || name.trim().toLowerCase() === 'unknown';
        const rowHasEnergy = (heat.z[i] || []).some((v) => (v || 0) > 0);
        return !isUnknown && rowHasEnergy;
      });
    return { circles: keep.map((k) => k.name), months: heat.months, z: keep.map((k) => heat.z[k.i]) };
  }, [heat]);

  // Period DISCOM split (MU + %) for the new "DISCOM Sharing Percentage" chart.
  const { data: sharingSplit } = useSharingSplit({ year: filters.year, quarter: filters.quarter, month: filters.month });
  const sharingBars = useMemo(() => {
    const nb = sharingSplit?.nbpdcl_mu ?? 0;
    const sb = sharingSplit?.sbpdcl_mu ?? 0;
    if (!sharingSplit?.resolved || nb + sb <= 0) return null;
    return {
      names: ['NBPDCL', 'SBPDCL'],
      mu: [nb, sb],
      pct: [sharingSplit.nbpdcl_pct ?? 0, sharingSplit.sbpdcl_pct ?? 0],
      colors: ['#2563EB', '#14B8A6'],
      periodLabel: sharingSplit.period_key === 'all' ? 'Latest available period' : sharingSplit.period_key,
    };
  }, [sharingSplit]);

  return (
    <div className="flex-1 min-w-0">
      <Header
        title="NBPDCL Energy Accounting Dashboard"
        subtitle="Monthly Energy Distribution Monitoring — DISCOM › Circle › Division › GSS › Feeder"
        dataMonth={trendRows.length ? monthLabel(trendRows[trendRows.length - 1].year_month) : undefined}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      <div className="p-6 space-y-5">
        {/* Filters — every existing filter preserved, plus the period selector */}
        <div className="card p-3 flex flex-wrap items-center gap-2">
          <FilterSelect value={filters.year} onChange={(v) => handleChange('year', v)} options={options?.years || []} placeholder="Year" labelFor={fyLabel} />
          <FilterSelect value={filters.quarter} onChange={(v) => handleChange('quarter', v)} options={options?.quarters || []} placeholder="Quarter" labelFor={(q) => FY_QUARTER_LABEL[q] || q} />
          <MonthSelect value={filters.month} onChange={(v) => handleChange('month', v)} />
          <FilterSelect value={filters.discom_name} onChange={(v) => handleChange('discom_name', v)} options={options?.discoms || []} placeholder="DISCOM" />
          <FilterSelect value={filters.circle} onChange={(v) => handleChange('circle', v)} options={options?.circles || []} placeholder="Circle" />
          <FilterSelect value={filters.division} onChange={(v) => handleChange('division', v)} options={options?.divisions || []} placeholder="Division" />
          <FilterSelect value={filters.substation} onChange={(v) => handleChange('substation', v)} options={options?.substations || []} placeholder="Substation" />
          <FilterSelect value={filters.feeder_type} onChange={(v) => handleChange('feeder_type', v)} options={options?.feeder_types || []} placeholder="Import/Export" />

          <span className="w-px h-6 bg-border mx-1" />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="text-xs font-medium border border-border rounded-lg px-2.5 py-2 bg-white text-textprimary outline-none focus:border-primary min-w-[130px]"
            title="Period"
          >
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <input
            type="text" value={filters.search} onChange={(e) => handleChange('search', e.target.value)}
            placeholder="Search feeder…"
            className="text-xs font-medium border border-border rounded-lg px-2.5 py-2 bg-white text-textprimary outline-none focus:border-primary min-w-[150px]"
          />
          <FilterResetButton onReset={handleReset} />
        </div>

        {/* KPI cards — 4 per row over 2 rows, so nothing is crowded */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Input Energy" value={fmt(kpis?.total_energy_mu)} unit="MU" icon={Zap} color="#2563EB" loading={kpisLoading} sparkline={sparkTrend} />
          <KpiCard label="Total Circles" value={fmt(kpis?.total_circles, 0)} unit="Nos." icon={MapPin} color="#10B981" loading={kpisLoading} />
          <KpiCard label="Total Divisions" value={fmt(kpis?.total_divisions, 0)} unit="Nos." icon={Building2} color="#8B5CF6" loading={kpisLoading} />
          <KpiCard label="Total GSS" value={fmt(kpis?.total_gss, 0)} unit="Nos." icon={Radio} color="#F59E0B" loading={kpisLoading} />
          <KpiCard label="Total Feeders" value={fmt(kpis?.total_feeders, 0)} unit="Nos." icon={GitBranch} color="#06B6D4" loading={kpisLoading} />
          <KpiCard label="Net Energy" value={fmt(netEnergy)} unit="MU" icon={Scale} color="#EC4899" loading={kpisLoading} sub="Import − Export" />
        </div>

        {/* Period trend (Monthly / Quarterly / Half-Yearly / Yearly / FY) */}
        <ChartCard title={`Energy Trend — ${PERIODS.find((p) => p.value === period)?.label}`} loading={trendLoading} height={330}>
          <Plot
            data={[{
              x: periodSeries.labels, y: periodSeries.values,
              type: 'scatter', mode: 'lines+markers+text',
              line: { color: '#2563EB', width: 3, shape: 'spline', smoothing: 1.1 },
              marker: { size: 8, color: '#2563EB', line: { color: '#fff', width: 2 } },
              fill: 'tozeroy', fillcolor: 'rgba(37,99,235,0.10)',
              text: thinLabels(periodSeries.values), textposition: 'top center',
              textfont: { size: 10, color: '#1E40AF' }, cliponaxis: false,
              hovertemplate: '<b>%{x}</b><br>%{y:,.2f} MU<extra></extra>',
            } as any]}
            layout={{
              margin: { t: 28, r: 24, b: 60, l: 62 }, font: PLOT_FONT,
              paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
              xaxis: { type: 'category', automargin: true, showgrid: false, tickangle: periodSeries.labels.length > 8 ? -35 : 0 },
              yaxis: { title: { text: 'MU' }, gridcolor: GRID, automargin: true, rangemode: 'tozero' },
            } as any}
            config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
          />
        </ChartCard>

        {/* Quarterly column + Yearly area */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Quarterly Energy" loading={trendLoading} height={300}>
            <Plot
              data={[{
                x: quarterly.labels, y: quarterly.values, type: 'bar',
                marker: { color: '#8B5CF6' }, marker_cornerradius: 7,
                text: quarterly.values.map((v) => fmt(v, 0)), textposition: 'outside',
                textfont: { size: 11, color: '#4C1D95' }, cliponaxis: false,
                hovertemplate: '<b>%{x}</b><br>%{y:,.2f} MU<extra></extra>',
              } as any]}
              layout={{
                margin: { t: 30, r: 20, b: 50, l: 62 }, font: PLOT_FONT,
                paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                bargap: 0.42,
                xaxis: { type: 'category', automargin: true, showgrid: false },
                yaxis: { title: { text: 'MU' }, gridcolor: GRID, automargin: true, rangemode: 'tozero' },
                uniformtext: { mode: 'show', minsize: 9 },
              } as any}
              config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
            />
          </ChartCard>

          <ChartCard title="Yearly Energy" loading={trendLoading} height={300}>
            <Plot
              data={[
                yearly.values.length <= 1
                  ? {
                      // A single year reads better as a centred column — a one-point
                      // line put its marker (and label) on the very left edge, on top
                      // of the Y-axis ticks.
                      x: yearly.labels, y: yearly.values, type: 'bar',
                      marker: { color: '#0EA5E9' }, marker_cornerradius: 8, width: 0.4,
                      text: yearly.values.map((v) => fmt(v, 0)), textposition: 'outside',
                      textfont: { size: 12, color: '#075985' }, cliponaxis: false,
                      hovertemplate: '<b>%{x}</b><br>%{y:,.2f} MU<extra></extra>',
                    }
                  : {
                      x: yearly.labels, y: yearly.values,
                      type: 'scatter', mode: 'lines+markers+text',
                      line: { color: '#0EA5E9', width: 3, shape: 'spline', smoothing: 1.1 },
                      marker: { size: 9, color: '#0EA5E9', line: { color: '#fff', width: 2 } },
                      fill: 'tozeroy', fillcolor: 'rgba(14,165,233,0.16)',
                      text: yearly.values.map((v) => fmt(v, 0)), textposition: 'top center',
                      textfont: { size: 11, color: '#075985' }, cliponaxis: false,
                      hovertemplate: '<b>%{x}</b><br>%{y:,.2f} MU<extra></extra>',
                    },
              ] as any}
              layout={{
                margin: { t: 34, r: 24, b: 50, l: 66 }, font: PLOT_FONT,
                paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                bargap: 0.6,
                xaxis: { type: 'category', automargin: true, showgrid: false },
                yaxis: { title: { text: 'MU' }, gridcolor: GRID, automargin: true, rangemode: 'tozero' },
                uniformtext: { mode: 'show', minsize: 9 },
              } as any}
              config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
            />
          </ChartCard>
        </div>

        {/* Circle contribution — donut with each circle's card floating by its slice */}
        <div className="card p-5">
          <div className="text-xs font-bold text-textprimary uppercase tracking-wide mb-1">Circle — Wise Contribution (%)</div>
          <div className="text-[11px] text-textsecondary mb-3">Each circle's share of total NBPDCL input energy · name + % shown inside each slice; scroll the panel for every circle's divisions · hover to link a slice with its card</div>
          {circleLoading ? (
            <div className="skeleton h-[520px] w-full rounded-xl" />
          ) : circles.length ? (
            <CircleContributionRadial
              circles={circles.map((c) => ({
                name: c.name,
                value: c.value,
                color: colorFor(c.name, circleNames),
                divisions: divisionsByCircle.get(c.name) || [],
              }))}
              total={circleTotal}
              centerLabel="NBPDCL"
              fmt={fmt}
            />
          ) : (
            <div className="h-[300px] flex items-center justify-center text-sm text-textsecondary">No data available</div>
          )}
        </div>

        {/* Treemap — Circle › Division with drill-down + breadcrumb */}
        <div className="card p-5">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="text-xs font-bold text-textprimary uppercase tracking-wide">Energy Treemap — Circle › Division</div>
            <div className="ml-auto flex items-center gap-1 text-[11px]">
              <button
                onClick={() => setDrillCircle(null)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md font-semibold transition ${drillCircle ? 'text-primary hover:bg-primary/10' : 'bg-primary/10 text-primary'}`}
              >
                <Home size={12} /> All Circles
              </button>
              {drillCircle && (
                <>
                  <ChevronRight size={12} className="text-textsecondary" />
                  <span className="px-2 py-1 rounded-md bg-primary/10 text-primary font-semibold">{drillCircle}</span>
                </>
              )}
            </div>
          </div>
          {treemapLoading ? (
            <div className="skeleton h-[420px] w-full rounded-xl" />
          ) : treemapView.labels.length ? (
            <Plot
              data={[{
                type: 'treemap',
                labels: treemapView.labels,
                parents: treemapView.labels.map(() => ''),
                values: treemapView.values,
                marker: {
                  colors: treemapView.colors,
                  line: { color: '#fff', width: 3 },
                  cornerradius: 8,
                },
                // Name + energy + contribution %, inside every rectangle.
                texttemplate: '<b>%{label}</b><br>%{value:,.2f} MU<br>%{percentRoot:.1%}',
                textposition: 'middle center',
                textfont: { size: 12, color: '#fff', family: 'Inter, sans-serif' },
                hovertemplate: '<b>%{label}</b><br>%{value:,.2f} MU<br>%{percentRoot:.2%} of shown<extra></extra>',
                sort: true,
                pathbar: { visible: false },
                tiling: { packing: 'squarify', pad: 3 },
              } as any]}
              layout={{
                margin: { t: 6, r: 6, b: 6, l: 6 }, font: PLOT_FONT,
                paper_bgcolor: 'rgba(0,0,0,0)',
                uniformtext: { mode: 'show', minsize: 8 },
              } as any}
              config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: 420 }}
              onClick={(e: any) => {
                const label = e?.points?.[0]?.label;
                if (!drillCircle && label && divisionsByCircle.has(label)) setDrillCircle(label);
              }}
            />
          ) : (
            <div className="h-[300px] flex items-center justify-center text-sm text-textsecondary">No data available</div>
          )}
          {!drillCircle && (
            <div className="text-[11px] text-textsecondary mt-2">Click a circle to drill into its divisions.</div>
          )}
        </div>

        {/* Circle × Month heatmap — rounded, separated cells */}
        <ChartCard title="Circle Heatmap — Monthly Energy (MU)" loading={heatLoading} height={360}>
          {heatFiltered?.z?.length ? (
            <Plot
              data={[{
                z: heatFiltered.z,
                x: heatFiltered.months.map(monthLabel),
                y: heatFiltered.circles,
                type: 'heatmap',
                colorscale: [[0, '#DC2626'], [0.35, '#F97316'], [0.65, '#FACC15'], [1, '#16A34A']],
                xgap: 5, ygap: 5,
                hoverongaps: false,
                hovertemplate: '<b>%{y}</b> · %{x}<br>%{z:,.2f} MU<extra></extra>',
                colorbar: { title: { text: 'MU', side: 'right' }, thickness: 12, len: 0.9, outlinewidth: 0, tickfont: { size: 10 } },
              } as any]}
              layout={{
                margin: { t: 12, r: 12, b: 54, l: 110 }, font: PLOT_FONT,
                paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                xaxis: { automargin: true, tickangle: (heatFiltered.months.length > 8 ? -35 : 0) },
                yaxis: { automargin: true },
              } as any}
              config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-textsecondary">No data available</div>
          )}
        </ChartCard>

        {/* Pareto — 80/20 across circles, dual axis */}
        <ChartCard title="Pareto Analysis — Circle Contribution (80/20)" loading={circleLoading} height={380}>
          {pareto.length ? (
            <Plot
              data={[
                {
                  x: pareto.map((p) => p.name), y: pareto.map((p) => p.value),
                  type: 'bar', name: 'Energy (MU)',
                  marker: { color: pareto.map((p) => colorFor(p.name, circleNames)) }, marker_cornerradius: 6,
                  text: pareto.map((p) => fmt(p.value, 0)), textposition: 'outside',
                  textfont: { size: 9 }, cliponaxis: false,
                  hovertemplate: '<b>%{x}</b><br>%{y:,.2f} MU<extra></extra>',
                },
                {
                  x: pareto.map((p) => p.name), y: pareto.map((p) => p.cum),
                  type: 'scatter', mode: 'lines+markers+text', name: 'Cumulative %', yaxis: 'y2',
                  line: { color: '#DC2626', width: 2.5, shape: 'spline', smoothing: 1 },
                  marker: { size: 7, color: '#DC2626', line: { color: '#fff', width: 1.5 } },
                  text: pareto.map((p) => `${p.cum.toFixed(0)}%`), textposition: 'bottom center',
                  textfont: { size: 10, color: '#991B1B' }, cliponaxis: false,
                  hovertemplate: '<b>%{x}</b><br>Cumulative: %{y:.1f}%<extra></extra>',
                },
              ] as any}
              layout={{
                margin: { t: 40, r: 62, b: 96, l: 66 }, font: PLOT_FONT,
                paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                bargap: 0.4,
                legend: { orientation: 'h', y: 1.14, x: 0 },
                xaxis: {
                  type: 'category', automargin: true, showgrid: false, tickangle: -35,
                  tickmode: 'array',
                  tickvals: pareto.map((p) => p.name),
                  ticktext: pareto.map((p) => truncate(p.name)),
                },
                yaxis: { title: { text: 'Energy (MU)' }, gridcolor: GRID, automargin: true, rangemode: 'tozero' },
                yaxis2: {
                  title: { text: 'Cumulative %' }, overlaying: 'y', side: 'right',
                  range: [0, 108], ticksuffix: '%', showgrid: false, automargin: true,
                },
                shapes: [{
                  type: 'line', xref: 'paper', yref: 'y2',
                  x0: 0, x1: 1, y0: 80, y1: 80,
                  line: { color: '#94A3B8', width: 1, dash: 'dash' },
                }],
                annotations: [{
                  xref: 'paper', yref: 'y2', x: 1, y: 80, xanchor: 'right', yanchor: 'bottom',
                  text: '80% threshold', showarrow: false, font: { size: 9, color: '#64748B' },
                }],
                uniformtext: { mode: 'show', minsize: 8 },
              } as any}
              config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-textsecondary">No data available</div>
          )}
        </ChartCard>

        {/* DISCOM Sharing Percentage — period NBPDCL vs SBPDCL split (MU + %).
            Data comes straight from the sharing engine's input-energy split, so
            it always agrees with the allocation applied across the app. */}
        <ChartCard title="DISCOM Sharing Percentage" loading={circleLoading} height={360}>
          {sharingBars ? (
            <div className="w-full h-full flex flex-col">
              <div className="text-[11px] text-textsecondary mb-1">
                Period: <span className="font-semibold text-textprimary">{sharingBars.periodLabel}</span>
                {' · '}derived from NBPDCL / SBPDCL input energy
              </div>
              <Plot
                data={[{
                  x: sharingBars.names,
                  y: sharingBars.mu,
                  type: 'bar',
                  width: 0.5,
                  marker: {
                    color: sharingBars.colors,
                    cornerradius: 10,
                    line: { color: 'rgba(255,255,255,0.6)', width: 1 },
                  } as any,
                  text: sharingBars.names.map((_, i) =>
                    `<b>${parseFloat(sharingBars.pct[i].toFixed(2))}%</b><br>${fmt(sharingBars.mu[i])} MU`),
                  textposition: 'outside',
                  textfont: { size: 14, color: '#0F172A' },
                  cliponaxis: false,
                  hovertemplate: '<b>%{x}</b><br>%{y:,.3f} MU<extra></extra>',
                } as any]}
                layout={{
                  margin: { t: 46, r: 24, b: 40, l: 68 }, font: PLOT_FONT,
                  paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                  bargap: 0.45,
                  xaxis: { type: 'category', automargin: true, showgrid: false, tickfont: { size: 13 } },
                  yaxis: { title: { text: 'Energy (MU)' }, gridcolor: GRID, automargin: true, rangemode: 'tozero' },
                } as any}
                config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-textsecondary">
              No DISCOM split available for this period
            </div>
          )}
        </ChartCard>

        {/* Executive insights — cards with icons and coloured indicators */}
        <div className="card p-5">
          <div className="text-xs font-bold text-textprimary uppercase tracking-wide mb-3">Executive Insights</div>
          {insightsLoading || circleLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton h-[70px] w-full rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {derivedInsights.map((ins, i) => (
                <div
                  key={i}
                  className="rounded-xl border p-3 flex items-start gap-3 transition-all duration-200 hover:shadow-md"
                  style={{ borderColor: `${ins.color}33`, backgroundColor: `${ins.color}0D` }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${ins.color}1F`, color: ins.color }}>
                    <ins.Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: ins.color }}>{ins.tag}</div>
                    <div className="text-[13px] text-textprimary leading-snug mt-0.5">{ins.text}</div>
                  </div>
                </div>
              ))}
              {(insights || []).slice(0, 3).map((line: string, i: number) => (
                <div key={`b-${i}`} className="rounded-xl border border-border p-3 flex items-start gap-3 bg-slate-50/60 transition-all duration-200 hover:shadow-md">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-200 text-slate-600">
                    <Activity size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Network</div>
                    <div className="text-[13px] text-textprimary leading-snug mt-0.5">{line}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detailed data — sticky header, sorting, pagination, CSV export */}
        <div className="card p-4">
          <div className="text-xs font-bold text-textprimary uppercase tracking-wide mb-3">Detailed Feeder-Level Data</div>
          <DataTable
            rows={tableData?.rows || []}
            total={tableData?.total || 0}
            page={page}
            pageSize={25}
            onPageChange={setPage}
            loading={tableLoading}
            exportFilename="input-energy"
          />
        </div>
      </div>
    </div>
  );
}
