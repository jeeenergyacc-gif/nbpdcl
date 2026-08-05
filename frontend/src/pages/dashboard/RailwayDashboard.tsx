import { useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import {
  TrainFront, Zap, Activity, TrendingDown, TrendingUp, Gauge as GaugeIcon,
  FileSpreadsheet, FileText, RefreshCw, CalendarClock, LucideIcon,
} from 'lucide-react';

import PremiumCard from '@/components/purchase/PremiumCard';
import { FilterSelect, FilterResetButton, MonthSelect, fyLabel, FY_QUARTER_LABEL } from '@/components/filters/FilterPrimitives';
import AllocationChip from '@/components/filters/AllocationChip';
import { useRailwayFilterOptions, useRailwayMonthlyComparison, RailwayFilters } from '@/api/railwayApi';

const EMPTY_FILTERS: RailwayFilters = { year: '', quarter: '', month: '', metric: '', discom: 'BSPHCL' };

const PLOT_CONFIG = { displayModeBar: false, responsive: true };
const FONT = 'Inter, sans-serif';
const AXIS = '#8FA3C7';
const GRID = 'rgba(143,163,199,0.16)';
const TEXT = '#E8EEFB';

// Metric keys as they appear in the sheet (matched case/space-insensitively).
const M = {
  schBihar: 'railway_schedule_bihar_boundary',
  schBsptcl: 'railway_schedule_bsptcl',
  drawal: 'railway_drawal',
  overdrawal: 'railway_overdrawal',
  stoaSch: 'stoa_schedule',
  stoaDrawal: 'stoa_drawal',
} as const;

const COLORS = {
  schBihar: '#3DA6F2',
  schBsptcl: '#22C1C3',
  drawal: '#A855F7',
  overdrawal: '#EF4444',
  stoaSch: '#22C55E',
  stoaDrawal: '#3DA6F2',
};

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym: string) => `${MONTH_ABBR[parseInt(ym.slice(5, 7), 10) - 1] ?? ym} ${ym.slice(0, 4)}`;
const fmt = (v: number, d = 3) =>
  v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '_');

interface MonthRow {
  month: string;
  label: string;
  schBihar: number;
  schBsptcl: number;
  drawal: number;
  overdrawal: number;
  stoaSch: number;
  stoaDrawal: number;
}

/** Reads a metric out of the backend's month record regardless of key casing. */
function pick(rec: Record<string, any>, key: string): number {
  const hit = Object.keys(rec).find((k) => norm(k) === key);
  const v = hit ? rec[hit] : 0;
  return typeof v === 'number' ? v : parseFloat(v) || 0;
}

export default function RailwayDashboard() {
  const [filters, setFilters] = useState<RailwayFilters>(EMPTY_FILTERS);
  const { data: options } = useRailwayFilterOptions();

  // Single source for the whole page — /railway/monthly-comparison already returns
  // every metric for every month, so no chart needs a second round-trip.
  const { data: comparison, isLoading, refetch, isFetching, dataUpdatedAt } = useRailwayMonthlyComparison(filters);

  const handleChange = (key: keyof RailwayFilters, value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const handleReset = () => setFilters(EMPTY_FILTERS);

  const rows = useMemo<MonthRow[]>(() => {
    return ((comparison || []) as Record<string, any>[])
      .filter((r) => r.month)
      .map((r) => ({
        month: r.month,
        label: monthLabel(r.month),
        schBihar: pick(r, M.schBihar),
        schBsptcl: pick(r, M.schBsptcl),
        drawal: pick(r, M.drawal),
        overdrawal: pick(r, M.overdrawal),
        stoaSch: pick(r, M.stoaSch),
        stoaDrawal: pick(r, M.stoaDrawal),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [comparison]);

  const latest = rows[rows.length - 1];
  const previous = rows.length > 1 ? rows[rows.length - 2] : undefined;

  const labels = rows.map((r) => r.label);
  const many = labels.length > 8;

  // Overdrawal % = (Drawal − BSPTCL Schedule) / BSPTCL Schedule × 100
  const overdrawalPct = latest && latest.schBsptcl
    ? ((latest.drawal - latest.schBsptcl) / latest.schBsptcl) * 100
    : 0;

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  // ---- exports (no new dependencies) ---------------------------------------
  const tableRows = useMemo(() => rows.map((r) => ({
    'Reporting Month': r.label,
    'Railway Schedule (Bihar Boundary)': fmt(r.schBihar),
    'Railway Schedule (BSPTCL)': fmt(r.schBsptcl),
    'Railway Drawal': fmt(r.drawal),
    'Railway Overdrawal': fmt(r.overdrawal),
    'STOA Schedule': fmt(r.stoaSch),
    'STOA Drawal': fmt(r.stoaDrawal),
    'Overdrawal % (vs BSPTCL)': r.schBsptcl ? `${(((r.drawal - r.schBsptcl) / r.schBsptcl) * 100).toFixed(2)}%` : '—',
    'Utilization % (vs Bihar Boundary)': r.schBihar ? `${((r.drawal / r.schBihar) * 100).toFixed(2)}%` : '—',
    'Variance (Drawal − BSPTCL)': fmt(r.drawal - r.schBsptcl),
  })), [rows]);

  const exportExcel = () => {
    if (!tableRows.length) return;
    const cols = Object.keys(tableRows[0]);
    const html =
      `<table border="1"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>` +
      `<tbody>${tableRows.map((r) => `<tr>${cols.map((c) => `<td>${(r as any)[c]}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const blob = new Blob([`\ufeff${html}`], { type: 'application/vnd.ms-excel' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `railway-power-${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportPdf = () => window.print(); // browser's "Save as PDF" target

  const btn = 'h-10 px-3 rounded-lg text-xs font-semibold flex items-center gap-2 transition border';

  return (
    <div className="flex-1 min-w-0" style={{ background: '#04122B', minHeight: '100vh' }}>
      {/* HEADER */}
      <div className="px-6 pt-5 pb-3 flex flex-wrap items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#2F6FE0,#22C1C3)' }}>
          <TrainFront size={22} className="text-white" />
        </div>
        <div className="min-w-0">
          <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', lineHeight: 1.1, letterSpacing: -0.4 }}>
            RAILWAY POWER DASHBOARD
          </h1>
          <div style={{ fontSize: 14, color: AXIS }}>Monthly Overview of Railway Power Metrics</div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button onClick={exportExcel} className={btn} style={{ background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.35)', color: '#86EFAC' }}>
            <FileSpreadsheet size={15} /> Export Excel
          </button>
          <button onClick={exportPdf} className={btn} style={{ background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.35)', color: '#FCA5A5' }}>
            <FileText size={15} /> Export PDF
          </button>
          <button onClick={() => refetch()} className={btn} style={{ background: 'rgba(61,166,242,0.12)', borderColor: 'rgba(61,166,242,0.35)', color: '#93C5FD' }}>
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
          <div className="h-10 px-3 rounded-lg flex items-center gap-2 border" style={{ background: 'rgba(143,163,199,0.08)', borderColor: 'rgba(143,163,199,0.22)' }}>
            <CalendarClock size={15} style={{ color: AXIS }} />
            <div className="leading-tight">
              <div style={{ fontSize: 9, color: AXIS, textTransform: 'uppercase', letterSpacing: 0.5 }}>Last Updated</div>
              <div style={{ fontSize: 11, color: TEXT, fontWeight: 600 }}>{lastUpdated}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-4">
        {/* FILTER BAR */}
        <div className="rounded-xl p-3 flex flex-wrap items-center gap-2 border" style={{ background: 'rgba(9,32,68,0.75)', borderColor: 'rgba(143,163,199,0.18)' }}>
          <FilterSelect value={filters.discom || 'BSPHCL'} onChange={(v) => handleChange('discom', v)} options={options?.discoms || ['BSPHCL', 'NBPDCL', 'SBPDCL']} placeholder="DISCOM" />
          <FilterSelect value={filters.year} onChange={(v) => handleChange('year', v)} options={options?.years || []} placeholder="Year" labelFor={fyLabel} />
          <FilterSelect value={filters.quarter} onChange={(v) => handleChange('quarter', v)} options={options?.quarters || []} placeholder="Quarter" labelFor={(q) => FY_QUARTER_LABEL[q] || q} />
          <MonthSelect value={filters.month} onChange={(v) => handleChange('month', v)} />
          <FilterSelect value={filters.metric} onChange={(v) => handleChange('metric', v)} options={options?.metrics || []} placeholder="Metric" />
          <FilterResetButton onReset={handleReset} />
        </div>
        <AllocationChip discom={filters.discom} year={filters.year} quarter={filters.quarter} month={filters.month} />

        {/* KPI CARDS — 3 per row over 2 rows, for quarterly-analysis readability */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <RailwayKpi label="Railway Schedule (Bihar Boundary)" icon={TrainFront} accent={COLORS.schBihar}
            value={latest?.schBihar} prev={previous?.schBihar} month={latest?.label} prevMonth={previous?.label}
            spark={rows.map((r) => r.schBihar)} loading={isLoading} />
          <RailwayKpi label="Railway Schedule (BSPTCL)" icon={Zap} accent={COLORS.schBsptcl}
            value={latest?.schBsptcl} prev={previous?.schBsptcl} month={latest?.label} prevMonth={previous?.label}
            spark={rows.map((r) => r.schBsptcl)} loading={isLoading} />
          <RailwayKpi label="Railway Drawal" icon={Activity} accent={COLORS.drawal}
            value={latest?.drawal} prev={previous?.drawal} month={latest?.label} prevMonth={previous?.label}
            spark={rows.map((r) => r.drawal)} loading={isLoading} />
          <RailwayKpi label="Railway Overdrawal" icon={TrendingDown} accent={COLORS.overdrawal} invertTrend
            value={latest?.overdrawal} prev={previous?.overdrawal} month={latest?.label} prevMonth={previous?.label}
            spark={rows.map((r) => r.overdrawal)} loading={isLoading} />
          <RailwayKpi label="STOA Schedule" icon={TrendingUp} accent={COLORS.stoaSch}
            value={latest?.stoaSch} prev={previous?.stoaSch} month={latest?.label} prevMonth={previous?.label}
            spark={rows.map((r) => r.stoaSch)} loading={isLoading} />
          <RailwayKpi label="STOA Drawal" icon={GaugeIcon} accent={COLORS.stoaDrawal}
            value={latest?.stoaDrawal} prev={previous?.stoaDrawal} month={latest?.label} prevMonth={previous?.label}
            spark={rows.map((r) => r.stoaDrawal)} loading={isLoading} />
        </div>

        {/* ROW 1 — 40% | 30% | 30% */}
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-[40fr_30fr_30fr] gap-4">
          <PremiumCard title="Railway Schedule vs Drawal Trend" height={330} loading={isLoading}>
            <Plot
              data={[
                line(labels, rows.map((r) => r.schBihar), 'Bihar Boundary Schedule', COLORS.schBihar, 'top center'),
                line(labels, rows.map((r) => r.schBsptcl), 'BSPTCL Schedule', COLORS.schBsptcl, 'bottom center'),
                line(labels, rows.map((r) => r.drawal), 'Railway Drawal', COLORS.drawal, 'top center'),
              ] as any}
              layout={darkLayout({
                margin: { t: 46, r: 22, b: 48, l: 62 },
                legend: { orientation: 'h', y: 1.16, x: 0, font: { color: TEXT, size: 10 } },
                xaxis: axis('Month', many),
                yaxis: { ...yaxis('MU'), range: yRange([...rows.map((r) => r.schBihar), ...rows.map((r) => r.schBsptcl), ...rows.map((r) => r.drawal)]) },
              })}
              config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
            />
          </PremiumCard>

          <PremiumCard title="Railway Overdrawal Trend" height={330} loading={isLoading}>
            <Plot
              data={[{
                x: labels, y: rows.map((r) => r.overdrawal), type: 'bar', name: 'Railway Overdrawal',
                marker: { color: COLORS.overdrawal, cornerradius: 6 },
                text: rows.map((r, i) => (labels.length <= 8 || i % Math.ceil(labels.length / 10) === 0 ? fmt(r.overdrawal) : '')), textposition: 'outside',
                textfont: { size: 10, color: TEXT }, cliponaxis: false,
                hovertemplate: '<b>%{x}</b><br>%{y:.3f} MU<extra></extra>',
              } as any]}
              layout={darkLayout({
                margin: { t: 30, r: 18, b: 48, l: 58 },
                bargap: 0.45,
                xaxis: axis('Month', many),
                yaxis: { ...yaxis('MU'), range: yRange(rows.map((r) => r.overdrawal)) },
                uniformtext: { mode: 'show', minsize: 8 },
              })}
              config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
            />
          </PremiumCard>

          <PremiumCard title="Schedule Comparison (Bihar Boundary vs BSPTCL)" height={330} loading={isLoading}>
            <Plot
              data={[
                bar(labels, rows.map((r) => r.schBihar), 'Bihar Boundary Schedule', COLORS.schBihar),
                bar(labels, rows.map((r) => r.schBsptcl), 'BSPTCL Schedule', COLORS.schBsptcl),
              ] as any}
              layout={darkLayout({
                margin: { t: 46, r: 18, b: 48, l: 58 },
                barmode: 'group', bargap: 0.35, bargroupgap: 0.12,
                legend: { orientation: 'h', y: 1.16, x: 0, font: { color: TEXT, size: 10 } },
                xaxis: axis('Month', many),
                yaxis: { ...yaxis('MU'), range: yRange([...rows.map((r) => r.schBihar), ...rows.map((r) => r.schBsptcl)]) },
                uniformtext: { mode: 'show', minsize: 8 },
              })}
              config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
            />
          </PremiumCard>
        </div>

        {/* ROW 2 — 33% | 33% | 34% */}
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          <PremiumCard title="STOA Schedule vs STOA Drawal" height={310} loading={isLoading}>
            <Plot
              data={[
                line(labels, rows.map((r) => r.stoaSch), 'STOA Schedule', COLORS.stoaSch, 'top center'),
                line(labels, rows.map((r) => r.stoaDrawal), 'STOA Drawal', COLORS.stoaDrawal, 'bottom center'),
              ] as any}
              layout={darkLayout({
                margin: { t: 46, r: 20, b: 48, l: 58 },
                legend: { orientation: 'h', y: 1.16, x: 0, font: { color: TEXT, size: 10 } },
                xaxis: axis('Month', many),
                yaxis: { ...yaxis('MU'), range: yRange([...rows.map((r) => r.stoaSch), ...rows.map((r) => r.stoaDrawal)]) },
              })}
              config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
            />
          </PremiumCard>

          {/* Waterfall: BSPTCL Schedule + Overdrawal = Railway Drawal */}
          <PremiumCard
            title="Railway Drawal Breakup (Waterfall)"
            subtitle={latest ? `${latest.label} · BSPTCL + Overdrawal = Drawal` : undefined}
            height={310} loading={isLoading}
          >
            {latest ? (
              <Plot
                data={[{
                  type: 'waterfall',
                  orientation: 'v',
                  measure: ['absolute', 'relative', 'total'],
                  x: ['BSPTCL Schedule', 'Overdrawal', 'Railway Drawal'],
                  y: [latest.schBsptcl, latest.overdrawal, 0],
                  text: [fmt(latest.schBsptcl), fmt(latest.overdrawal), fmt(latest.schBsptcl + latest.overdrawal)],
                  textposition: 'outside',
                  textfont: { size: 11, color: TEXT },
                  cliponaxis: false,
                  connector: { line: { color: 'rgba(143,163,199,0.5)', dash: 'dot', width: 1 } },
                  increasing: { marker: { color: COLORS.stoaSch } },
                  decreasing: { marker: { color: COLORS.overdrawal } },
                  totals: { marker: { color: COLORS.drawal } },
                  hovertemplate: '<b>%{x}</b><br>%{y:.3f} MU<extra></extra>',
                } as any]}
                layout={darkLayout({
                  margin: { t: 30, r: 18, b: 52, l: 58 },
                  xaxis: axis('', false),
                  yaxis: { ...yaxis('MU'), range: yRange([latest.schBsptcl + latest.overdrawal]) },
                  uniformtext: { mode: 'show', minsize: 8 },
                })}
                config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
              />
            ) : <Empty />}
          </PremiumCard>

          {/* Semi-circular gauge — Overdrawal % */}
          <PremiumCard
            title="Overdrawal % (vs BSPTCL Schedule)"
            subtitle="(Drawal − BSPTCL Schedule) ÷ BSPTCL Schedule × 100"
            height={310} loading={isLoading}
          >
            {latest ? (
              <div className="h-full flex flex-col">
                <Plot
                  data={[{
                    type: 'indicator',
                    mode: 'gauge+number',
                    value: overdrawalPct,
                    number: { suffix: '%', valueformat: '.2f', font: { size: 30, color: '#F2B33D', family: FONT } },
                    gauge: {
                      axis: { range: [0, 100], tickcolor: AXIS, tickfont: { color: AXIS, size: 9 }, nticks: 5 },
                      bar: { color: 'rgba(0,0,0,0)', thickness: 0 },
                      bgcolor: 'rgba(0,0,0,0)', borderwidth: 0,
                      steps: [
                        { range: [0, 15], color: '#22C55E' },
                        { range: [15, 30], color: '#FACC15' },
                        { range: [30, 50], color: '#F97316' },
                        { range: [50, 100], color: '#EF4444' },
                      ],
                    },
                  } as any]}
                  layout={{
                    ...darkLayout({ margin: { t: 18, r: 26, b: 4, l: 26 } }),
                    shapes: needle(overdrawalPct, 0, 100),
                  } as any}
                  config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '85%' }}
                />
                <div className="text-center pb-1" style={{ color: AXIS, fontSize: 11, fontWeight: 600 }}>{latest.label}</div>
              </div>
            ) : <Empty />}
          </PremiumCard>
        </div>

        {/* DETAIL TABLE */}
        <div className="rounded-xl border overflow-hidden" style={{ background: 'rgba(9,32,68,0.75)', borderColor: 'rgba(143,163,199,0.18)' }}>
          <div className="px-4 py-3 flex items-center gap-3">
            <div style={{ fontSize: 11, fontWeight: 800, color: '#F2B33D', letterSpacing: 1, textTransform: 'uppercase' }}>Detail Table</div>
            <button onClick={exportExcel} className="ml-auto text-[11px] font-semibold px-2.5 py-1.5 rounded-md border transition"
              style={{ background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.35)', color: '#86EFAC' }}>
              Export Excel
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]" style={{ color: TEXT }}>
              <thead className="sticky top-0" style={{ background: '#0B2450' }}>
                <tr>
                  {tableRows[0] && Object.keys(tableRows[0]).map((c) => (
                    <th key={c} className="text-left font-bold px-3 py-2.5 whitespace-nowrap" style={{ color: AXIS, borderBottom: '1px solid rgba(143,163,199,0.2)' }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r, i) => (
                  <tr key={i} className="transition-colors hover:bg-white/5">
                    {Object.entries(r).map(([k, v]) => (
                      <td key={k} className="px-3 py-2.5 whitespace-nowrap tabular-nums" style={{ borderBottom: '1px solid rgba(143,163,199,0.09)' }}>{v as string}</td>
                    ))}
                  </tr>
                ))}
                {!tableRows.length && (
                  <tr><td className="px-3 py-6 text-center" style={{ color: AXIS }} colSpan={10}>No data available</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ color: AXIS, fontSize: 11 }}>
          MU = Million Units (Energy) · All values are rounded to 3 decimal places.
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- helpers */

function Empty() {
  return <div className="flex items-center justify-center h-full text-sm" style={{ color: AXIS }}>No data available</div>;
}

/** Shared dark Plotly layout. */
function darkLayout(extra: Record<string, any>): any {
  return {
    font: { family: FONT, size: 11, color: TEXT },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    hovermode: 'x unified',
    ...extra,
  };
}
/** X axis — months, so genuinely categorical. */
function axis(title: string, rotate = false): any {
  return {
    title: title ? { text: title, font: { color: AXIS, size: 10 } } : undefined,
    type: 'category' as const,
    automargin: true,
    gridcolor: GRID,
    zeroline: false,
    linecolor: 'rgba(143,163,199,0.35)',
    tickfont: { color: AXIS, size: 10 },
    tickangle: rotate ? -35 : 0,
  };
}

/**
 * Y axis — numeric, and anchored at zero.
 *
 * This previously reused the X helper, which forced `type: 'category'` on the Y
 * axis too. Plotly then treated each energy value as a discrete label, so the
 * ticks printed raw data (39.516, 108.821…) and every bar was drawn between two
 * categories — i.e. with no height at all. Bars now measure from 0, so a value
 * is always proportional to its bar, and adding more months (or a full year)
 * only rescales the axis instead of hiding data.
 */
function yaxis(title = 'MU', padTop = 0.14): any {
  return {
    title: { text: title, font: { color: AXIS, size: 10 } },
    type: 'linear' as const,
    rangemode: 'tozero' as const,
    automargin: true,
    gridcolor: GRID,
    zeroline: true,
    zerolinecolor: 'rgba(143,163,199,0.35)',
    linecolor: 'rgba(143,163,199,0.35)',
    tickfont: { color: AXIS, size: 10 },
    // headroom so the outside value labels never clip against the card edge
    ...(padTop ? { constrain: 'range' } : {}),
  };
}

/** Upper bound with headroom, so labels sitting above the tallest bar stay inside. */
function yRange(values: number[], padTop = 0.18): [number, number] {
  const max = Math.max(0, ...values.filter((v) => isFinite(v)));
  return [0, max > 0 ? max * (1 + padTop) : 1];
}
/** Line series with permanent data labels above/below its markers. */
function line(x: string[], y: number[], name: string, color: string, textposition: string) {
  const step = y.length <= 12 ? 1 : Math.ceil(y.length / 12);
  return {
    x, y, type: 'scatter', mode: 'lines+markers+text', name,
    line: { color, width: 2.5, shape: 'spline', smoothing: 1.1 },
    marker: { size: 8, color, line: { color: '#04122B', width: 1.5 } },
    text: y.map((v, i) => (i % step === 0 ? fmt(v) : '')),
    textposition, textfont: { size: 9.5, color }, cliponaxis: false,
    hovertemplate: `<b>${name}</b><br>%{y:.3f} MU<extra></extra>`,
  };
}
function bar(x: string[], y: number[], name: string, color: string) {
  // With many months, printing a value over every bar overlaps in a narrow card.
  // Show every label up to 8 points, then thin to ~10 evenly-spaced labels.
  const step = y.length <= 8 ? 1 : Math.ceil(y.length / 10);
  return {
    x, y, type: 'bar', name,
    marker: { color, cornerradius: 5 },
    text: y.map((v, i) => (i % step === 0 ? fmt(v) : '')), textposition: 'outside',
    textfont: { size: 9.5, color: TEXT }, cliponaxis: false,
    hovertemplate: `<b>${name}</b><br>%{y:.3f} MU<extra></extra>`,
  };
}
/** Analog needle for the semi-circular gauge (paper coords). */
function needle(value: number, min: number, max: number) {
  const span = max - min || 1;
  const v = Math.max(min, Math.min(max, value));
  const angle = Math.PI * (1 - (v - min) / span);
  const cx = 0.5, cy = 0.22, len = 0.34;
  return [
    {
      type: 'line', xref: 'paper', yref: 'paper',
      x0: cx, y0: cy, x1: cx + len * Math.cos(angle) * 0.6, y1: cy + len * Math.sin(angle),
      line: { color: '#FFFFFF', width: 3 },
    },
    {
      type: 'circle', xref: 'paper', yref: 'paper',
      x0: cx - 0.02, y0: cy - 0.032, x1: cx + 0.02, y1: cy + 0.032,
      fillcolor: '#FFFFFF', line: { color: '#04122B', width: 1.5 },
    },
  ];
}

/** Gradient KPI tile: icon, value, month, variance, % change, trend arrow, sparkline. */
function RailwayKpi({
  label, icon: Icon, accent, value, prev, month, prevMonth, spark, loading, invertTrend,
}: {
  label: string; icon: LucideIcon; accent: string;
  value?: number; prev?: number; month?: string; prevMonth?: string;
  spark: number[]; loading?: boolean; invertTrend?: boolean;
}) {
  if (loading) {
    return <div className="rounded-xl h-[128px] animate-pulse" style={{ background: 'rgba(143,163,199,0.10)' }} />;
  }
  const delta = value !== undefined && prev !== undefined ? value - prev : undefined;
  const pct = delta !== undefined && prev ? (delta / Math.abs(prev)) * 100 : undefined;
  // A rise in overdrawal is a bad thing — colour the arrow accordingly.
  const good = delta === undefined ? true : invertTrend ? delta <= 0 : delta >= 0;
  const trendColor = delta === undefined || delta === 0 ? '#8FA3C7' : good ? '#22C55E' : '#EF4444';
  const Arrow = delta !== undefined && delta < 0 ? TrendingDown : TrendingUp;

  return (
    <div
      className="rounded-xl p-3 border flex flex-col transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: `linear-gradient(145deg, ${accent}2E 0%, rgba(9,32,68,0.9) 72%)`,
        borderColor: `${accent}55`,
        boxShadow: `inset 0 1px 0 ${accent}33`,
      }}
    >
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${accent}30`, color: accent }}>
          <Icon size={15} />
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: TEXT, lineHeight: 1.15 }}>{label}</div>
      </div>

      <div className="mt-2">
        <div style={{ fontSize: 21, fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>
          {value !== undefined ? fmt(value) : '—'}
          <span style={{ fontSize: 11, color: AXIS, fontWeight: 600, marginLeft: 4 }}>MU</span>
        </div>
        <div style={{ fontSize: 10, color: AXIS }}>{month ?? '—'}</div>
      </div>

      {delta !== undefined && (
        <div className="flex items-center gap-1.5 mt-1.5" style={{ color: trendColor, fontSize: 10.5, fontWeight: 700 }}>
          <Arrow size={12} />
          <span>{delta >= 0 ? '+' : ''}{fmt(delta)} MU</span>
          {pct !== undefined && <span>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>}
        </div>
      )}
      {prevMonth && <div style={{ fontSize: 9.5, color: AXIS }}>vs {prevMonth}</div>}

      <Spark points={spark} color={accent} />
    </div>
  );
}

function Spark({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null;
  const W = 110, H = 22;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const step = W / (points.length - 1);
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${H - ((v - min) / span) * (H - 3) - 1.5}`).join(' ');
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-auto pt-1.5 block">
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
