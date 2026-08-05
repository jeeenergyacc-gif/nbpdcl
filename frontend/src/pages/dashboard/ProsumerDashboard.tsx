import { useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import {
  Zap, Factory, Building2, Ban, Percent, Gauge,
  TrendingUp, TrendingDown, Trophy, Activity, Sigma,
} from 'lucide-react';

import Header from '@/components/layout/Header';
import KpiCard from '@/components/cards/KpiCard';
import ChartCard from '@/components/charts/ChartCard';
import BlockSankey, { BlockSankeyNode, BlockSankeyLink } from '@/components/charts/BlockSankey';
import { BlockTreemapBucket } from '@/components/charts/BlockTreemap';
import EnergyTreemapECharts from '@/components/charts/EnergyTreemapECharts';
import DataTable from '@/components/common/DataTable';
import { FilterSelect, FilterResetButton, MonthSelect, fyLabel, FY_QUARTER_LABEL } from '@/components/filters/FilterPrimitives';
import AllocationChip from '@/components/filters/AllocationChip';
import {
  useProsumerFilterOptions, useProsumerKpis, useProsumerTrend, useProsumerPlantTypeContribution,
  useProsumerVoltageSales, useProsumerTypeVoltageHeatmap, useProsumerTreemap,
  useProsumerSankey, useProsumerInsights, useProsumerTable, ProsumerFilters,
} from '@/api/prosumerApi';

const EMPTY_FILTERS: ProsumerFilters = {
  year: '', quarter: '', month: '', plant_type: '', voltage_level: '',
  ppa_type: '', plant_name: '', search: '', min_sales: '', max_sales: '',
  discom: 'BSPHCL',
};

const PLOT_CONFIG = { displayModeBar: false, responsive: true };
const PLOT_FONT = { family: 'Inter, sans-serif', size: 11, color: '#111827' };
const GRID = 'rgba(15,23,42,0.08)';

/** Fixed plant-type palette — a type keeps its colour in every chart. */
const TYPE_COLORS: Record<string, string> = {
  Sugar: '#F97316',
  Hydel: '#2563EB',
  Solar: '#FACC15',
  SOLAR: '#FACC15',
  'State Solar': '#8B5CF6',
  GSS: '#10B981',
  'Bio-Mass': '#EC4899',
};
const FALLBACK = ['#06B6D4', '#EF4444', '#84CC16', '#6366F1', '#14B8A6'];
const typeColor = (name: string, i = 0) => TYPE_COLORS[name] ?? FALLBACK[i % FALLBACK.length];
const VOLTAGE_COLOR = '#0EA5E9';
const PPA_COLOR = '#14B8A6';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym: string) => `${MONTH_ABBR[parseInt(ym.slice(5, 7), 10) - 1] ?? ym} ${ym.slice(0, 4)}`;
const fmt = (v?: number, d = 3) =>
  v === undefined || v === null ? '—' : v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

const voltageLabel = (v: string) => (/kv/i.test(v) ? v : `${v} KV`);

export default function ProsumerDashboard() {
  const [filters, setFilters] = useState<ProsumerFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const { data: options } = useProsumerFilterOptions();
  const { data: kpis, isLoading: kpisLoading, refetch, isFetching } = useProsumerKpis(filters);
  const { data: trend, isLoading: trendLoading } = useProsumerTrend(filters);
  const { data: contribution, isLoading: contribLoading } = useProsumerPlantTypeContribution(filters);
  const { data: voltage, isLoading: voltageLoading } = useProsumerVoltageSales(filters);
  const { data: tvHeatmap, isLoading: heatLoading } = useProsumerTypeVoltageHeatmap(filters);
  const { data: treemap, isLoading: treemapLoading } = useProsumerTreemap(filters);
  const { data: sankey, isLoading: sankeyLoading } = useProsumerSankey(filters);
  const { data: insights, isLoading: insightsLoading } = useProsumerInsights(filters);
  const { data: tableData, isLoading: tableLoading } = useProsumerTable(filters, page, 25);

  // Any filter change resets pagination — otherwise you can land on an empty page.
  const handleChange = (key: keyof ProsumerFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const handleReset = () => { setFilters(EMPTY_FILTERS); setPage(1); };

  // ---- Monthly trend
  const trendRows = (trend || []) as { year_month: string; sales_unit: number }[];
  const trendX = trendRows.map((t) => monthLabel(t.year_month));
  const trendY = trendRows.map((t) => t.sales_unit);
  const sparkline = trendY;

  // ---- Plant-type contribution
  const types = useMemo(
    () => ((contribution || []) as any[]).filter((c) => c.sales_unit > 0)
      .map((c, i) => ({ name: c.plant_type as string, value: c.sales_unit as number, color: typeColor(c.plant_type, i) })),
    [contribution]
  );
  const typeTotal = types.reduce((s, t) => s + t.value, 0);

  // ---- Voltage-wise sales
  const voltages = useMemo(
    () => ((voltage || []) as any[]).filter((v) => v.sales_unit > 0)
      .map((v) => ({ name: voltageLabel(String(v.voltage_level)), value: v.sales_unit as number }))
      .sort((a, b) => parseFloat(a.name) - parseFloat(b.name)),
    [voltage]
  );

  // ---- Plant type × voltage matrix
  const heat = tvHeatmap as { plant_types: string[]; voltage_levels: (string | number)[]; z: number[][] } | undefined;

  // ---- Treemap — Plant Type (parent) › Plant (children), rendered with the
  // squarified ECharts treemap (click-to-drill, no overlap).
  const treeRows = (treemap || []) as { plant_type: string; plant_name: string; sales_unit: number }[];
  const treeBuckets = useMemo<BlockTreemapBucket[]>(() => {
    const map = new Map<string, { total: number; items: { name: string; value: number }[] }>();
    treeRows.forEach((r) => {
      if (r.sales_unit <= 0) return;
      const b = map.get(r.plant_type) || { total: 0, items: [] };
      b.total += r.sales_unit;
      b.items.push({ name: r.plant_name, value: r.sales_unit });
      map.set(r.plant_type, b);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, b], i) => ({ name, total: b.total, color: typeColor(name, i), items: b.items }));
  }, [treeRows]);
  const treeTotal = treeBuckets.reduce((s, b) => s + b.total, 0);

  /**
   * Sales-flow Sankey — Plant Type › Voltage Level › PPA Type, rendered with the
   * same block-card model as the Power Purchase dashboard.
   *
   * The backend `/prosumer/sankey` endpoint returns PPA → Plant Type totals and
   * `/type-voltage-heatmap` returns the exact Plant Type × Voltage matrix. The
   * Plant-Type→Voltage leg is therefore exact. For the Voltage→PPA leg, each
   * plant type's voltage flow is attributed across that plant type's own PPA mix
   * (taken from the backend sankey payload) — exact whenever a plant type sells
   * under a single PPA type, which is the case in this dataset. No backend call,
   * contract, or value is modified.
   */
  const sankeyModel = useMemo(() => {
    const nodes: BlockSankeyNode[] = [];
    const links: BlockSankeyLink[] = [];
    if (!heat?.z?.length) return { nodes, links };

    // PPA mix per plant type, from the existing backend sankey payload.
    const ppaByType = new Map<string, Map<string, number>>();
    const sk = sankey as { nodes: string[]; links: { source: number; target: number; value: number }[] } | undefined;
    (sk?.links || []).forEach((l) => {
      const src = sk!.nodes[l.source];
      const tgt = sk!.nodes[l.target];
      if (tgt === 'Total Sales') return; // that leg is the ptype → total roll-up
      const inner = ppaByType.get(tgt) || new Map<string, number>();
      inner.set(src, (inner.get(src) || 0) + l.value);
      ppaByType.set(tgt, inner);
    });

    const typeTotals = new Map<string, number>();
    const voltTotals = new Map<string, number>();
    const ppaTotals = new Map<string, number>();
    const voltPpa = new Map<string, number>();

    heat.plant_types.forEach((pt, ri) => {
      heat.voltage_levels.forEach((vl, ci) => {
        const val = heat.z[ri]?.[ci] || 0;
        if (val <= 0) return;
        const vName = voltageLabel(String(vl));
        typeTotals.set(pt, (typeTotals.get(pt) || 0) + val);
        voltTotals.set(vName, (voltTotals.get(vName) || 0) + val);
        links.push({ source: pt, target: vName, value: val });

        // attribute this cell across the plant type's PPA mix
        const mix = ppaByType.get(pt);
        const mixTotal = mix ? Array.from(mix.values()).reduce((s, v) => s + v, 0) : 0;
        if (mix && mixTotal > 0) {
          mix.forEach((share, ppa) => {
            const part = val * (share / mixTotal);
            if (part <= 0) return;
            ppaTotals.set(ppa, (ppaTotals.get(ppa) || 0) + part);
            voltPpa.set(`${vName}|${ppa}`, (voltPpa.get(`${vName}|${ppa}`) || 0) + part);
          });
        }
      });
    });

    voltPpa.forEach((v, key) => {
      const [vName, ppa] = key.split('|');
      links.push({ source: vName, target: ppa, value: v });
    });

    typeTotals.forEach((v, name) => nodes.push({ name, value: v, column: 0, color: typeColor(name, nodes.length) }));
    voltTotals.forEach((v, name) => nodes.push({ name, value: v, column: 1, color: VOLTAGE_COLOR }));
    ppaTotals.forEach((v, name) => nodes.push({ name, value: v, column: 2, color: PPA_COLOR }));

    return { nodes, links };
  }, [heat, sankey]);

  // ---- Executive insight cards
  const insightCards = useMemo(() => {
    const out: { tag: string; text: string; Icon: typeof Trophy; color: string }[] = [];
    if (kpis) {
      out.push({ tag: 'Total Sales', text: `Prosumer sales stand at ${fmt(kpis.total_sales)} MU across ${kpis.total_plants} registered plants.`, Icon: Sigma, color: '#2563EB' });
      out.push({ tag: 'Active Plants', text: `${kpis.active_plants} of ${kpis.total_plants} plants are actively generating sales.`, Icon: Factory, color: '#10B981' });
      out.push({ tag: 'Zero Sales', text: `${kpis.zero_sales_plants} plants (${fmt(kpis.zero_sales_pct, 2)}%) recorded zero sales.`, Icon: Ban, color: '#EF4444' });
    }
    if (types.length && typeTotal) {
      const top = types[0];
      out.push({ tag: 'Top Contribution', text: `${top.name} leads with ${fmt(top.value)} MU (${((top.value / typeTotal) * 100).toFixed(1)}% of total sales).`, Icon: Trophy, color: top.color });
    }
    if (trendY.length >= 2) {
      const first = trendY[0];
      const last = trendY[trendY.length - 1];
      const growth = first ? ((last - first) / first) * 100 : 0;
      out.push({
        tag: 'Growth Trend',
        text: `Sales moved ${growth >= 0 ? '+' : ''}${growth.toFixed(1)}% from ${trendX[0]} to ${trendX[trendX.length - 1]}.`,
        Icon: growth >= 0 ? TrendingUp : TrendingDown,
        color: growth >= 0 ? '#16A34A' : '#F97316',
      });
    }
    if (kpis) {
      out.push({ tag: 'Average per Plant', text: `Average sales per plant is ${fmt(kpis.average_sales_per_plant)} MU.`, Icon: Gauge, color: '#8B5CF6' });
    }
    return out;
  }, [kpis, types, typeTotal, trendY, trendX]);

  return (
    <div className="flex-1 min-w-0">
      <Header
        title="Prosumer Sales Energy Dashboard"
        subtitle="Overview of Prosumer Sales Energy (MU)"
        dataMonth={trendRows.length ? monthLabel(trendRows[trendRows.length - 1].year_month) : undefined}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      <div className="p-6 space-y-5">
        {/* Filters — unchanged contract */}
        <div className="card p-3 flex flex-wrap items-center gap-2">
          <FilterSelect value={filters.discom || 'BSPHCL'} onChange={(v) => handleChange('discom', v)} options={options?.discoms || ['BSPHCL', 'NBPDCL', 'SBPDCL']} placeholder="DISCOM" />
          <FilterSelect value={filters.year} onChange={(v) => handleChange('year', v)} options={options?.years || []} placeholder="Year" labelFor={fyLabel} />
          <FilterSelect value={filters.quarter} onChange={(v) => handleChange('quarter', v)} options={options?.quarters || []} placeholder="Quarter" labelFor={(q) => FY_QUARTER_LABEL[q] || q} />
          <MonthSelect value={filters.month} onChange={(v) => handleChange('month', v)} />
          <FilterSelect value={filters.plant_type} onChange={(v) => handleChange('plant_type', v)} options={options?.plant_types || []} placeholder="Plant Type" />
          <FilterSelect value={filters.voltage_level} onChange={(v) => handleChange('voltage_level', v)} options={options?.voltage_levels || []} placeholder="Voltage Level" />
          <FilterSelect value={filters.ppa_type} onChange={(v) => handleChange('ppa_type', v)} options={options?.ppa_types || []} placeholder="PPA Type" />
          <input
            type="text" value={filters.search} onChange={(e) => handleChange('search', e.target.value)}
            placeholder="Search plant…"
            className="text-xs font-medium border border-border rounded-lg px-2.5 py-2 bg-white text-textprimary outline-none focus:border-primary min-w-[160px]"
          />
          <FilterResetButton onReset={handleReset} />
        </div>
        <AllocationChip discom={filters.discom} year={filters.year} quarter={filters.quarter} month={filters.month} />

        {/* KPI row — 4 cards over 2 rows (Zero Sales Plants and Average Sales/Plant removed) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard label="Total Prosumer Sales" value={fmt(kpis?.total_sales)} unit="MU" icon={Zap} color="#2563EB" loading={kpisLoading} sparkline={sparkline} />
          <KpiCard label="Active Plants" value={fmt(kpis?.active_plants, 0)} unit="Nos." icon={Factory} color="#10B981" loading={kpisLoading} sub={kpis ? `${kpis.total_plants ? ((kpis.active_plants / kpis.total_plants) * 100).toFixed(0) : 0}% of total plants` : undefined} />
          <KpiCard label="Total Plants" value={fmt(kpis?.total_plants, 0)} unit="Nos." icon={Building2} color="#8B5CF6" loading={kpisLoading} sub="Across all categories" />
          <KpiCard label="Zero Sales %" value={fmt(kpis?.zero_sales_pct, 2)} unit="%" icon={Percent} color="#EF4444" loading={kpisLoading} />
        </div>

        {/* ROW 1 — Monthly trend (55%) | Plant type donut (45%) */}
        <div className="grid grid-cols-1 xl:grid-cols-[55fr_45fr] gap-4">
          <ChartCard title="Monthly Sales Trend (MU)" loading={trendLoading} height={340}>
            <Plot
              data={[{
                x: trendX, y: trendY,
                type: 'scatter', mode: 'lines+markers+text',
                line: { color: '#2563EB', width: 3, shape: 'spline', smoothing: 1.1 },
                marker: { size: 9, color: '#2563EB', line: { color: '#fff', width: 2 } },
                fill: 'tozeroy', fillcolor: 'rgba(37,99,235,0.14)',
                text: trendY.map((v) => `${fmt(v)} MU`),
                textposition: 'top center',
                textfont: { size: 11, color: '#1E40AF', family: 'Inter, sans-serif' },
                cliponaxis: false,
                hovertemplate: '<b>%{x}</b><br>%{y:.3f} MU<extra></extra>',
              } as any]}
              layout={{
                margin: { t: 34, r: 26, b: 52, l: 66 }, font: PLOT_FONT,
                paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                xaxis: { type: 'category', title: { text: 'Month' }, automargin: true, showgrid: false },
                yaxis: { title: { text: 'Sales (MU)' }, gridcolor: GRID, automargin: true, rangemode: 'tozero' },
              } as any}
              config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
            />
          </ChartCard>

          <ChartCard title="Plant Type Contribution (MU)" loading={contribLoading} height={340}>
            {types.length ? (
              <Plot
                data={[{
                  type: 'pie',
                  labels: types.map((t) => t.name),
                  values: types.map((t) => t.value),
                  hole: 0.5,
                  sort: false,
                  marker: { colors: types.map((t) => t.color), line: { color: '#fff', width: 2 } },
                  // Outside labels + leader lines; Plotly auto-places them so they never collide.
                  textinfo: 'label+value+percent',
                  texttemplate: '<b>%{label}</b><br>%{value:.3f} MU<br>%{percent}',
                  textposition: 'outside',
                  automargin: true,
                  textfont: { size: 10, family: 'Inter, sans-serif', color: '#0F172A' },
                  hovertemplate: '<b>%{label}</b><br>%{value:.3f} MU (%{percent})<extra></extra>',
                } as any]}
                layout={{
                  margin: { t: 30, r: 30, b: 30, l: 30 }, font: PLOT_FONT,
                  paper_bgcolor: 'rgba(0,0,0,0)',
                  showlegend: false,
                  annotations: [{
                    text: `<b>${fmt(typeTotal)}</b><br>MU Total`, x: 0.5, y: 0.5, showarrow: false,
                    font: { size: 14, color: '#0F172A', family: 'Inter, sans-serif' },
                  }],
                  uniformtext: { mode: 'show', minsize: 8 },
                } as any}
                config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-textsecondary">No data available</div>
            )}
          </ChartCard>
        </div>

        {/* ROW 2 — Voltage column | Plant Type × Voltage matrix */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartCard title="Sales by Voltage Level (MU)" loading={voltageLoading} height={330}>
            {voltages.length ? (
              <Plot
                data={[{
                  x: voltages.map((v) => v.name), y: voltages.map((v) => v.value),
                  type: 'bar',
                  marker: { color: VOLTAGE_COLOR }, marker_cornerradius: 6,
                  text: voltages.map((v) => fmt(v.value)), textposition: 'outside',
                  textfont: { size: 11, color: '#075985' }, cliponaxis: false,
                  hovertemplate: '<b>%{x}</b><br>%{y:.3f} MU<extra></extra>',
                } as any]}
                layout={{
                  margin: { t: 34, r: 18, b: 54, l: 62 }, font: PLOT_FONT,
                  paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                  bargap: 0.5,
                  xaxis: { type: 'category', title: { text: 'Voltage Level' }, automargin: true, showgrid: false },
                  yaxis: { title: { text: 'Sales (MU)' }, gridcolor: GRID, automargin: true, rangemode: 'tozero', showgrid: true },
                  uniformtext: { mode: 'show', minsize: 9 },
                } as any}
                config={PLOT_CONFIG} useResizeHandler style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-textsecondary">No data available</div>
            )}
          </ChartCard>

          {/* Matrix — every cell prints its value; colour is a secondary cue only */}
          <ChartCard title="Plant Type vs Voltage Level (MU)" loading={heatLoading} height={330}>
            {heat?.plant_types?.length ? (
              <div className="h-full overflow-auto">
                <table className="w-full text-[11px] border-separate" style={{ borderSpacing: 3 }}>
                  <thead>
                    <tr>
                      <th className="text-left font-bold text-textsecondary uppercase tracking-wide px-2 py-1.5">Plant Type</th>
                      {heat.voltage_levels.map((v) => (
                        <th key={String(v)} className="text-center font-bold text-textsecondary px-2 py-1.5">{voltageLabel(String(v))}</th>
                      ))}
                      <th className="text-center font-bold text-textprimary px-2 py-1.5">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heat.plant_types.map((pt, ri) => {
                      const row = heat.z[ri] || [];
                      const rowMax = Math.max(1e-9, ...heat.z.flat());
                      const rowTotal = row.reduce((s, v) => s + (v || 0), 0);
                      return (
                        <tr key={pt}>
                          <td className="font-semibold text-textprimary px-2 py-1.5 whitespace-nowrap">{pt}</td>
                          {row.map((v, ci) => {
                            const intensity = (v || 0) / rowMax;
                            const color = typeColor(pt, ri);
                            return (
                              <td
                                key={ci}
                                className="text-center font-semibold rounded-lg px-2 py-1.5 tabular-nums"
                                style={{
                                  backgroundColor: v > 0 ? `${color}${Math.round(20 + intensity * 60).toString(16).padStart(2, '0')}` : 'rgba(148,163,184,0.10)',
                                  color: intensity > 0.55 ? '#0F172A' : '#334155',
                                }}
                              >
                                {fmt(v || 0)}
                              </td>
                            );
                          })}
                          <td className="text-center font-bold text-textprimary px-2 py-1.5 tabular-nums bg-slate-100 rounded-lg">{fmt(rowTotal)}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td className="font-bold text-textprimary px-2 py-1.5">Total</td>
                      {heat.voltage_levels.map((_, ci) => {
                        const colTotal = heat.z.reduce((s, r) => s + (r[ci] || 0), 0);
                        return <td key={ci} className="text-center font-bold text-textprimary px-2 py-1.5 tabular-nums bg-slate-100 rounded-lg">{fmt(colTotal)}</td>;
                      })}
                      <td className="text-center font-extrabold text-textprimary px-2 py-1.5 tabular-nums bg-slate-200 rounded-lg">
                        {fmt(heat.z.flat().reduce((s, v) => s + (v || 0), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-textsecondary">No data available</div>
            )}
          </ChartCard>
        </div>

        {/* Treemap — squarified ECharts treemap with click-to-drill (no overlap) */}
        <ChartCard title="Sales Treemap — Plant Type › Plant" loading={treemapLoading} height={440}>
          {treeBuckets.length ? (
            <EnergyTreemapECharts buckets={treeBuckets} unit="MU" digits={3} grandTotal={treeTotal} height={430} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-textsecondary">No data available</div>
          )}
        </ChartCard>

        {/* ROW 3 — Block Sankey (65%) | Executive insights (35%) */}
        <div className="grid grid-cols-1 xl:grid-cols-[65fr_35fr] gap-4">
          <ChartCard title="Sales Flow — Plant Type › Voltage Level › PPA Type" loading={sankeyLoading || heatLoading} height={440}>
            {sankeyModel.nodes.length ? (
              <BlockSankey nodes={sankeyModel.nodes} links={sankeyModel.links} height={430} unit="MU" digits={3} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-textsecondary">No data available</div>
            )}
          </ChartCard>

          <div className="card p-5 flex flex-col">
            <div className="text-xs font-bold text-textprimary uppercase tracking-wide mb-3">Executive Insights</div>
            {insightsLoading || kpisLoading ? (
              <div className="space-y-3">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-14 w-full rounded-xl" />)}</div>
            ) : (
              <div className="space-y-2.5 overflow-y-auto pr-1" style={{ maxHeight: 420 }}>
                {insightCards.map((ins, i) => (
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
                      <div className="text-[12.5px] text-textprimary leading-snug mt-0.5">{ins.text}</div>
                    </div>
                  </div>
                ))}
                {(insights || []).slice(0, 2).map((line: string, i: number) => (
                  <div key={`b-${i}`} className="rounded-xl border border-border p-3 flex items-start gap-3 bg-slate-50/70">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-200 text-slate-600">
                      <Activity size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Network</div>
                      <div className="text-[12.5px] text-textprimary leading-snug mt-0.5">{line}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Plant-level detail — sticky header, sortable, paginated, CSV export */}
        <div className="card p-4">
          <div className="text-xs font-bold text-textprimary uppercase tracking-wide mb-3">
            Plant-Wise Detail Data
          </div>
          <DataTable
            rows={tableData?.rows || []}
            total={tableData?.total || 0}
            page={page}
            pageSize={25}
            onPageChange={setPage}
            loading={tableLoading}
            exportFilename="prosumer-sales"
          />
        </div>

        <div className="text-[11px] text-textsecondary px-1">
          * MU = Million Units (Energy) · All values are rounded · Source: Prosumer Sales Energy data
        </div>
      </div>
    </div>
  );
}
