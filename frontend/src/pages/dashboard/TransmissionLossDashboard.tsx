import { useMemo, useState, ReactElement } from 'react';
import Plot from 'react-plotly.js';
import {
  Zap, Activity, ArrowDownRight, Percent, Layers, TrendingDown,
  CheckCircle2, XCircle, ShieldCheck, Flag, Sigma,
} from 'lucide-react';

import Header from '@/components/layout/Header';
import KpiCard from '@/components/cards/KpiCard';
import ChartCard from '@/components/charts/ChartCard';
import BlockSankey, { BlockSankeyNode, BlockSankeyLink } from '@/components/charts/BlockSankey';
import { FilterSelect, FilterResetButton, MonthSelect, fyLabel, FY_QUARTER_LABEL } from '@/components/filters/FilterPrimitives';
import AllocationChip from '@/components/filters/AllocationChip';
import { formatPct } from '@/api/sharingApi';
import {
  useTransmissionFilterOptions, useTransmissionDashboard,
  TransmissionFilters, BalanceRow, ValidationRow,
} from '@/api/transmissionApi';

const EMPTY_FILTERS: TransmissionFilters = { year: '', quarter: '', month: '', discom: 'BSPHCL' };
const PLOT_CONFIG = { displayModeBar: false, responsive: true };
const PLOT_FONT = { family: 'Inter, sans-serif', size: 11, color: '#111827' };
const GRID = 'rgba(15,23,42,0.07)';

// Design tokens from the spec
const C = {
  navy: '#0E2A5C', blue: '#2E7FD4', purple: '#7C4DBE', teal: '#0E9A94',
  red: '#DF3B3B', green: '#2E9B4F', orange: '#F07C1F', nepal: '#00A99D', amber: '#E8A33D',
};

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym?: string | null) => (ym ? `${MONTH_ABBR[parseInt(ym.slice(5, 7), 10) - 1] ?? ym} ${ym.slice(0, 4)}` : '—');
const fmt = (v?: number, d = 2) =>
  v === undefined || v === null ? '—' : v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v?: number) => (v === undefined || v === null ? '—' : `${v.toFixed(2)}%`);

const BAND_META: Record<string, { title: string; tint: string }> = {
  A: { title: 'A · Schedule Side — CTL', tint: 'rgba(46,127,212,0.06)' },
  B: { title: 'B · Drawal Side — STL', tint: 'rgba(240,124,31,0.06)' },
  C: { title: 'C · Loss Accounting', tint: 'rgba(223,59,59,0.06)' },
};

export default function TransmissionLossDashboard() {
  const [filters, setFilters] = useState<TransmissionFilters>(EMPTY_FILTERS);

  const { data: options } = useTransmissionFilterOptions();
  const { data: dash, isLoading, refetch, isFetching } = useTransmissionDashboard(filters);

  const kpis = dash?.kpis;
  const ctlWf = dash?.ctl_waterfall;
  const stlWf = dash?.stl_waterfall;
  const ctlSankey = dash?.ctl_sankey;
  const stlSankey = dash?.stl_sankey;
  const trend = dash?.trend;
  const balance: { period: string; rows: BalanceRow[]; nepal_active: boolean; nepal_power: number; discom?: string; nbpdcl_pct?: number | null; sbpdcl_pct?: number | null } | undefined = dash?.balance_table;
  const validation: ValidationRow[] | undefined = dash?.validation;
  const insights: string[] | undefined = dash?.insights;
  // one payload → one loading state for every section
  const kpisLoading = isLoading, ctlWfLoading = isLoading, stlWfLoading = isLoading;
  const ctlSkLoading = isLoading, stlSkLoading = isLoading, trendLoading = isLoading;
  const balanceLoading = isLoading, validationLoading = isLoading, insightsLoading = isLoading;

  // Dynamic DISCOM sharing label for the Energy Balance table (replaces the old
  // static "% of Boundary" column header). The percentage is the SAME month-wise
  // input-energy split the backend used to allocate the table, so badge and table
  // can never disagree. BSPHCL is the combined 100% holding.
  const discomSel = (filters.discom || 'BSPHCL').toUpperCase();
  const sharePct = discomSel === 'NBPDCL' ? balance?.nbpdcl_pct : discomSel === 'SBPDCL' ? balance?.sbpdcl_pct : 100;
  const shareLabel = discomSel === 'BSPHCL'
    ? 'BSPHCL Combined (100%)'
    : `${discomSel} Sharing${formatPct(sharePct) ? ` (${formatPct(sharePct)})` : ''}`;

  const handleChange = (key: keyof TransmissionFilters, value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const handleReset = () => setFilters(EMPTY_FILTERS);

  // For a quarter/FY filter the backend sends period as a range (e.g. "2026-07..2026-09")
  // plus a ready label in period_label ("Q2 FY 26-27"). monthLabel only parses the first
  // month of a range, which is why a quarter used to show just "Jul 2026". Prefer the
  // backend's period_label for ranges; keep monthLabel's nice "Sep 2026" for single months.
  const period = kpis?.is_range ? (kpis?.period_label || monthLabel(kpis?.period)) : monthLabel(kpis?.period);

  const buildSankey = (payload: any, colorMap: Record<string, string>) => {
    const nodes: BlockSankeyNode[] = [];
    const links: BlockSankeyLink[] = [];
    if (!payload?.nodes) return { nodes, links };
    const names: string[] = payload.nodes;
    const nv: Record<string, number> = payload.node_values || {};
    const lastCol = names.length - 1;
    names.forEach((n, i) => nodes.push({
      name: n, value: nv[n] ?? 0,
      column: i === 0 ? 0 : i === lastCol ? 2 : 1,
      color: colorMap[n] ?? (/(loss)/i.test(n) ? C.red : '#5B7BA6'),
    }));
    (payload.links || []).forEach((l: any) => {
      if (l.value > 0) links.push({ source: names[l.source], target: names[l.target], value: l.value });
    });
    return { nodes, links };
  };

  const ctlSankeyModel = useMemo(() => buildSankey(ctlSankey, { 'Central Power': C.blue, 'Actual Drawal': C.navy, 'CTL Loss': C.red }), [ctlSankey]);
  const stlSankeyModel = useMemo(() => buildSankey(stlSankey, { 'Total Power @BSPTCL': C.blue, 'DISCOM Drawal': C.orange, 'Prosumer Sale': C.green, 'Railway Overdrawal': C.purple, 'STL Loss': C.red }), [stlSankey]);

  const sparkCtl = (trend || []).map((t: any) => t.ctl);
  const sparkStl = (trend || []).map((t: any) => t.stl);

  const hasData = !!kpis && (kpis.central_power > 0 || kpis.boundary_schedule > 0);
  const allPass = (validation || []).every((v) => v.pass);

  const waterfall = (title: string, wf: any, loading: boolean, resultColor: string) => (
    <ChartCard title={title} height={340} loading={loading}>
      {wf?.labels?.length ? (
        <Plot
          data={[{
            type: 'waterfall', orientation: 'v',
            measure: wf.measure, x: wf.labels, y: wf.values,
            text: wf.values.map((v: number, i: number) =>
              wf.measure[i] === 'total' ? `${fmt(wf.result)}` : wf.measure[i] === 'relative' ? `−${fmt(Math.abs(v))}` : fmt(v)),
            textposition: 'outside', textfont: { size: 11, color: '#111827' }, cliponaxis: false,
            connector: { line: { color: 'rgba(15,23,42,0.25)', dash: 'dot', width: 1 } },
            increasing: { marker: { color: C.green } },
            decreasing: { marker: { color: C.orange } },
            totals: { marker: { color: resultColor } },
            hovertemplate: '<b>%{x}</b><br>%{y:.2f} MU<extra></extra>',
          } as any]}
          layout={{
            margin: { t: 30, r: 20, b: 48, l: 64 }, font: PLOT_FONT,
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            xaxis: { type: 'category', automargin: true, showgrid: false },
            yaxis: { title: { text: 'MU' }, gridcolor: GRID, rangemode: 'tozero', automargin: true },
            uniformtext: { mode: 'show', minsize: 8 },
            annotations: [{
              xref: 'paper', yref: 'paper', x: 1, y: 1.02, xanchor: 'right', yanchor: 'bottom',
              text: `${title.includes('CTL') ? 'CTL' : 'STL'} ${pct(wf.result_pct)}`, showarrow: false,
              font: { size: 12, color: resultColor, family: 'Inter, sans-serif' },
            }],
          } as any}
          config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
        />
      ) : <Empty />}
    </ChartCard>
  );

  return (
    <div className="flex-1 min-w-0">
      <Header
        title="Transmission Losses Dashboard"
        subtitle="BSPHCL CTL / STL Energy Accounting — computed from live sheets (workbook methodology)"
        dataMonth={period}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      <div className="p-6 space-y-5">
        <div className="card p-3 flex flex-wrap items-center gap-2">
          <FilterSelect value={filters.discom || 'BSPHCL'} onChange={(v) => handleChange('discom', v)} options={options?.discoms || ['BSPHCL', 'NBPDCL', 'SBPDCL']} placeholder="DISCOM" />
          <FilterSelect value={filters.year} onChange={(v) => handleChange('year', v)} options={options?.years || []} placeholder="Year" labelFor={fyLabel} />
          <FilterSelect value={filters.quarter} onChange={(v) => handleChange('quarter', v)} options={options?.quarters || []} placeholder="Quarter" labelFor={(q) => FY_QUARTER_LABEL[q] || q} />
          <MonthSelect value={filters.month} onChange={(v) => handleChange('month', v)} />
          <FilterResetButton onReset={handleReset} />
          {kpis?.nepal_active && (
            <span className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md" style={{ background: `${C.nepal}14`, color: C.nepal }}>
              <Flag size={12} /> Nepal layer active
            </span>
          )}
        </div>
        <AllocationChip
          discom={filters.discom}
          year={filters.year}
          quarter={filters.quarter}
          month={filters.month}
          pctOverride={discomSel === 'NBPDCL' ? balance?.nbpdcl_pct : discomSel === 'SBPDCL' ? balance?.sbpdcl_pct : undefined}
        />

        {!hasData && !kpisLoading && (
          <div className="card p-4 text-sm text-textsecondary">
            No transmission-loss figures computed. Ensure the operational sheets (Plant_Purchase_Master, master_ui_deviation_bihar,
            railway_power, input_energy, prosumer_energy_sales) have data for the selected period.
          </div>
        )}

        {/* KPI STRIP — reference cards, no internal row names */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="CTL %" value={fmt(kpis?.ctl_pct)} unit="%" icon={Percent} color={C.purple} loading={kpisLoading} sparkline={sparkCtl} />
          <KpiCard label="STL %" value={fmt(kpis?.stl_pct)} unit="%" icon={Percent} color={C.teal} loading={kpisLoading} sparkline={sparkStl} />
          <KpiCard label="Bihar Boundary Schedule" value={fmt(kpis?.boundary_schedule)} unit="MU" icon={Activity} color={C.blue} loading={kpisLoading} sub={kpis?.nepal_active ? `incl. Nepal ${fmt(kpis?.nepal_schedule)}` : undefined} />
          <KpiCard label="Schedule for DISCOM" value={fmt(kpis?.actual_drawal_boundary)} unit="MU" icon={Layers} color={C.green} loading={kpisLoading} sub="after STOA + Railway" />
          <KpiCard label="DISCOM Drawal (BSPTCL)" value={fmt(kpis?.total_drawal_bsptcl)} unit="MU" icon={TrendingDown} color={C.orange} loading={kpisLoading} sub="net of Nepal" />
          <KpiCard label="Total System Loss" value={fmt(kpis?.total_loss)} unit="MU" icon={ArrowDownRight} color={C.red} loading={kpisLoading} sub="CTL + STL" />
        </div>

        {/* POWER FLOW SUMMARY — 5-box top-down flow, reference style */}
        {dash?.power_flow && (
          <div className="card p-5">
            <div className="inline-block text-[13px] font-bold text-white uppercase tracking-wide mb-4 px-3 py-1.5 rounded-lg" style={{ background: C.navy }}>
              Power Flow Summary (MU)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-stretch">
              {dash.power_flow.boxes.map((b: any, i: number) => {
                const tone = FLOW_TONE[b.tone] || FLOW_TONE.blue;
                return (
                  <div key={i} className="flex flex-col">
                    <div className="rounded-xl border-2 p-3 text-center flex-1 flex flex-col justify-center" style={{ borderColor: tone.border, background: tone.bg }}>
                      <div className="text-[11px] font-bold uppercase tracking-wide leading-tight" style={{ color: tone.text }}>{b.label}</div>
                      <div className="text-[20px] font-extrabold mt-2" style={{ color: tone.text }}>{fmt(b.value)}</div>
                      <div className="text-[10px] text-textsecondary mt-0.5">MU</div>
                    </div>
                    {/* adjustment chip under the gap to the next box */}
                    {(() => {
                      const adj = dash.power_flow.adjustments.find((a: any) => a.under === i);
                      if (!adj) return <div className="h-7" />;
                      const at = FLOW_TONE[adj.tone] || FLOW_TONE.slate;
                      return (
                        <div className="mt-2 text-center">
                          <span className="inline-block text-[11px] font-semibold px-2.5 py-1 rounded-md" style={{ background: at.bg, color: at.text, border: `1px dashed ${at.border}` }}>
                            {adj.label}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
            {/* Nepal notes */}
            {dash.power_flow.notes?.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                {dash.power_flow.notes.map((n: string, i: number) => (
                  <div key={i} className="text-[11.5px] rounded-lg px-3 py-2 border border-dashed" style={{ borderColor: `${C.nepal}66`, background: `${C.nepal}0A`, color: '#0F766E' }}>
                    {n}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* NEPAL OPTIONAL DATA LAYER + STEP FLOWS */}
        {dash?.nepal_layer && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Nepal panel */}
            <div className="card p-0 overflow-hidden">
              <div className="text-[13px] font-bold text-white uppercase tracking-wide px-4 py-2.5 text-center" style={{ background: C.nepal }}>
                Nepal Power · Optional Data Layer
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border-2 p-3 text-center" style={{ borderColor: `${C.nepal}55`, background: `${C.nepal}0A` }}>
                    <div className="text-[10px] font-bold uppercase text-textsecondary">Nepal Schedule</div>
                    <div className="text-[22px] font-extrabold" style={{ color: C.nepal }}>{fmt(dash.nepal_layer.schedule)}</div>
                    <div className="text-[10px] text-textsecondary">MU · ADD (+)</div>
                  </div>
                  <div className="rounded-xl border-2 p-3 text-center" style={{ borderColor: `${C.nepal}55`, background: `${C.nepal}0A` }}>
                    <div className="text-[10px] font-bold uppercase text-textsecondary">Nepal Energy</div>
                    <div className="text-[22px] font-extrabold" style={{ color: C.nepal }}>{fmt(dash.nepal_layer.energy)}</div>
                    <div className="text-[10px] text-textsecondary">MU · DEDUCT (−)</div>
                  </div>
                </div>
                {dash.nepal_layer.monthly?.length > 0 && (
                  <div className="mt-4">
                    <div className="text-[10px] font-bold uppercase text-textsecondary mb-1.5">Monthly Nepal Energy</div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      {dash.nepal_layer.monthly.map((m: any, i: number) => (
                        <div key={i} className="flex justify-between px-3 py-1.5 text-[12px] border-b border-border last:border-0">
                          <span className="text-textsecondary">{monthLabel(m.month)}</span>
                          <span className="font-semibold text-textprimary tabular-nums">{fmt(m.value)} MU</span>
                        </div>
                      ))}
                      <div className="flex justify-between px-3 py-1.5 text-[12px] font-bold" style={{ background: `${C.nepal}12` }}>
                        <span>Total</span>
                        <span className="tabular-nums" style={{ color: C.nepal }}>{fmt(dash.nepal_layer.total)} MU</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-3 text-[11px] rounded-lg px-3 py-2 border border-dashed" style={{ borderColor: '#F59E0B66', background: '#F59E0B0A', color: '#B45309' }}>
                  ⚠ {dash.nepal_layer.rule}
                </div>
              </div>
            </div>

            {/* Step flows stacked */}
            <div className="space-y-4">
              {dash.ctl_steps && <StepFlow title="CTL — Central Transmission Loss" steps={dash.ctl_steps.steps} footer={dash.ctl_steps.footer} accent={C.purple} />}
              {dash.stl_steps && <StepFlow title="STL — State Transmission Loss (Nepal Engine)" steps={dash.stl_steps.steps} footer={dash.stl_steps.footer} accent={C.teal} />}
            </div>
          </div>
        )}

        {/* CTL + STL WATERFALLS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {waterfall('CTL Waterfall — Central Power → Actual Drawal → CTL', ctlWf, ctlWfLoading, C.purple)}
          {waterfall('STL Waterfall — Total Power @BSPTCL → Drawal → STL', stlWf, stlWfLoading, C.teal)}
        </div>

        {/* CTL + STL SANKEYS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="CTL Flow — Central Power › Drawal › Loss" height={380} loading={ctlSkLoading}>
            {ctlSankeyModel.nodes.length ? <BlockSankey nodes={ctlSankeyModel.nodes} links={ctlSankeyModel.links} height={370} unit="MU" digits={2} /> : <Empty />}
          </ChartCard>
          <ChartCard title="STL Flow — Total Power @BSPTCL › Drawals › Loss" height={380} loading={stlSkLoading}>
            {stlSankeyModel.nodes.length ? <BlockSankey nodes={stlSankeyModel.nodes} links={stlSankeyModel.links} height={370} unit="MU" digits={2} /> : <Empty />}
          </ChartCard>
        </div>

        {/* TREND */}
        {(trend?.length ?? 0) > 1 && (
          <ChartCard title="CTL / STL Loss Trend" height={320} loading={trendLoading}>
            <Plot
              data={[
                lineTrace(trend!.map((t: any) => monthLabel(t.year_month)), trend!.map((t: any) => t.ctl), 'CTL (MU)', C.purple),
                lineTrace(trend!.map((t: any) => monthLabel(t.year_month)), trend!.map((t: any) => t.stl), 'STL (MU)', C.teal),
                lineTrace(trend!.map((t: any) => monthLabel(t.year_month)), trend!.map((t: any) => t.total_loss), 'Total (MU)', C.red),
              ] as any}
              layout={{
                margin: { t: 30, r: 22, b: 50, l: 60 }, font: PLOT_FONT,
                paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                legend: { orientation: 'h', y: 1.16, x: 0 },
                xaxis: { type: 'category', automargin: true, showgrid: false },
                yaxis: { title: { text: 'MU' }, gridcolor: GRID, rangemode: 'tozero', automargin: true },
              } as any}
              config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
            />
          </ChartCard>
        )}

        {/* ENERGY BALANCE TABLE — the canonical A/B/C/D audit table */}
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="text-xs font-bold text-textprimary uppercase tracking-wide">Energy Balance Table — CTL / STL Audit</div>
            <span className="text-[11px] text-textsecondary">· {period}</span>
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded"
              style={discomSel === 'BSPHCL'
                ? { background: 'rgba(37,99,235,0.10)', color: '#1D4ED8' }
                : { background: 'rgba(245,158,11,0.14)', color: '#B45309' }}
            >
              {shareLabel}
            </span>
            {balance?.nepal_active && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: `${C.nepal}14`, color: C.nepal }}>
                Nepal Power {fmt(balance.nepal_power)} MU
              </span>
            )}
          </div>
          {balanceLoading ? (
            <div className="skeleton h-96 w-full rounded" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left" style={{ color: '#64748B' }}>
                    <th className="font-bold px-3 py-2">#</th>
                    <th className="font-bold px-3 py-2">Particulars</th>
                    <th className="font-bold px-3 py-2">Source / Formula</th>
                    <th className="font-bold px-3 py-2 text-right">MU</th>
                  </tr>
                </thead>
                <tbody>
                  {renderBands(balance?.rows || [])}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* VALIDATION PANEL */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="text-xs font-bold text-textprimary uppercase tracking-wide">Validation Panel</div>
            {!validationLoading && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1"
                style={{ background: allPass ? `${C.green}16` : `${C.red}16`, color: allPass ? C.green : C.red }}>
                {allPass ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {allPass ? 'ALL PASS' : 'CHECK FAILED'}
              </span>
            )}
          </div>
          {validationLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(validation || []).map((v: ValidationRow, i: number) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border p-2.5"
                  style={{ borderColor: v.pass ? `${C.green}33` : `${C.red}33`, background: v.pass ? `${C.green}08` : `${C.red}08` }}>
                  {v.pass ? <CheckCircle2 size={16} style={{ color: C.green }} /> : <XCircle size={16} style={{ color: C.red }} />}
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-textprimary truncate">{v.rule}</div>
                    <div className="text-[11px] text-textsecondary tabular-nums">expected {fmt(v.expected)} · actual {fmt(v.actual)}</div>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: v.pass ? `${C.green}18` : `${C.red}18`, color: v.pass ? C.green : C.red }}>
                    {v.pass ? 'PASS' : 'FAIL'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* INSIGHTS */}
        <div className="card p-5">
          <div className="text-xs font-bold text-textprimary uppercase tracking-wide mb-3">Executive Insights</div>
          {insightsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(insights || []).map((line, i) => {
                const isNepal = /nepal/i.test(line);
                const color = /ctl/i.test(line) ? C.purple : /stl/i.test(line) ? C.teal : isNepal ? C.nepal : /total/i.test(line) ? C.red : C.navy;
                const Icon = isNepal ? Flag : /assessed|level/i.test(line) ? ShieldCheck : Sigma;
                return (
                  <div key={i} className="rounded-xl border p-3 flex items-start gap-3 transition-all duration-200 hover:shadow-md"
                    style={{ borderColor: `${color}33`, backgroundColor: `${color}0D` }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1F`, color }}>
                      <Icon size={16} />
                    </div>
                    <div className="text-[12.5px] text-textprimary leading-snug">{line}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-[11px] text-textsecondary px-1">
          CTL = Central Transmission Loss · STL = State Transmission Loss · MU = Million Units.
          All figures computed by the backend from the live sheets per the workbook "LOSS logic" methodology. Nepal is an optional layer (COALESCE to 0 when absent).
        </div>
      </div>
    </div>
  );
}

function renderBands(rows: BalanceRow[]) {
  const out: ReactElement[] = [];
  let currentBand = '';
  rows.forEach((r, i) => {
    if (r.band !== currentBand) {
      currentBand = r.band;
      const meta = BAND_META[r.band];
      if (meta) {
        out.push(
          <tr key={`band-${r.band}`}>
            <td colSpan={4} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ background: meta.tint, color: '#0E2A5C' }}>
              {meta.title}
            </td>
          </tr>
        );
      }
    }
    const isSub = r.subtotal;
    const isLoss = r.loss;
    out.push(
      <tr key={i} className="border-t border-border" style={isSub ? { background: 'rgba(15,23,42,0.03)' } : undefined}>
        <td className="px-3 py-2 tabular-nums text-textsecondary">{r.sl || ''}</td>
        <td className={`px-3 py-2 ${isSub ? 'font-bold text-textprimary' : 'text-textprimary'}`}>{r.particulars}</td>
        <td className="px-3 py-2 text-[11px] text-textsecondary font-mono">{r.formula}</td>
        <td className={`px-3 py-2 text-right tabular-nums ${isSub ? 'font-extrabold' : 'font-semibold'}`}
          style={{ color: isLoss ? '#DF3B3B' : r.mu < 0 ? '#94A3B8' : '#0F172A' }}>
          {r.mu < 0 ? `(${fmt(Math.abs(r.mu))})` : fmt(r.mu)}
        </td>
      </tr>
    );
  });
  return out;
}

const FLOW_TONE: Record<string, { bg: string; border: string; text: string }> = {
  blue: { bg: '#EFF6FF', border: '#93C5FD', text: '#1D4ED8' },
  indigo: { bg: '#EEF2FF', border: '#A5B4FC', text: '#4338CA' },
  teal: { bg: '#F0FDFA', border: '#5EEAD4', text: '#0F766E' },
  green: { bg: '#F0FDF4', border: '#86EFAC', text: '#15803D' },
  orange: { bg: '#FFF7ED', border: '#FDBA74', text: '#C2410C' },
  red: { bg: '#FEF2F2', border: '#FCA5A5', text: '#B91C1C' },
  amber: { bg: '#FFFBEB', border: '#FCD34D', text: '#B45309' },
  slate: { bg: '#F8FAFC', border: '#CBD5E1', text: '#475569' },
};

function StepFlow({ title, steps, footer, accent }: { title: string; steps: any[]; footer: string; accent: string }) {
  const fmtN = (v?: number) => (v === undefined || v === null ? '—' : v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  return (
    <div className="card p-0 overflow-hidden">
      <div className="text-[13px] font-bold text-white uppercase tracking-wide px-4 py-2.5" style={{ background: accent }}>{title}</div>
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {steps.map((st, i) => {
            const isLoss = st.loss;
            const isNepal = st.nepal;
            const border = isLoss ? '#FCA5A5' : isNepal ? `${accent}66` : '#E2E8F0';
            const bg = isLoss ? '#FEF2F2' : isNepal ? `${accent}0A` : '#F8FAFC';
            const valColor = isLoss ? '#DC2626' : isNepal ? accent : '#0F172A';
            return (
              <div key={i} className="rounded-xl p-2.5 text-center" style={{ border: `${isNepal ? '1.5px dashed' : '1px solid'} ${border}`, background: bg }}>
                <div className="text-[9.5px] font-bold uppercase text-textsecondary tracking-wide">STEP {i + 1}</div>
                <div className="text-[10px] text-textsecondary leading-tight mt-1 min-h-[26px] flex items-center justify-center">{st.title}</div>
                <div className="text-[15px] font-extrabold mt-1" style={{ color: valColor }}>{fmtN(st.value)}</div>
                <div className="text-[9px] text-textsecondary">MU</div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-[11px] rounded-lg px-3 py-2" style={{ background: `${accent}0C`, color: '#334155' }}>{footer}</div>
      </div>
    </div>
  );
}

function Empty({ label = 'No data available' }: { label?: string }) {
  return <div className="flex items-center justify-center h-full text-sm text-textsecondary">{label}</div>;
}

function lineTrace(x: string[], y: number[], name: string, color: string) {
  return {
    x, y, type: 'scatter', mode: 'lines+markers+text', name,
    line: { color, width: 2.5, shape: 'spline', smoothing: 1.1 },
    marker: { size: 7, color, line: { color: '#fff', width: 1.5 } },
    text: y.map((v) => v.toFixed(2)), textposition: 'top center',
    textfont: { size: 9.5, color }, cliponaxis: false,
    hovertemplate: `<b>${name}</b><br>%{y:.2f} MU<extra></extra>`,
  };
}
