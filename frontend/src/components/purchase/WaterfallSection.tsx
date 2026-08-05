import PremiumCard from './PremiumCard';
import EChartBase from './EChartBase';
import { TEXT_MUTED, CHART_FONT } from './theme';

interface KpiPayload {
  total_purchase_mu?: number;
  // additive backend fields (get_kpis) — all traceable to Plant_Purchase_Master
  gross_purchase_mu?: number;
  sale_energy_mu?: number; // signed (negative in sheet)
  ui_energy_mu?: number;   // signed (negative in sheet)
  net_purchase_mu?: number;
}

interface WaterfallStep {
  label: string;
  value: number; // signed delta relative to previous step; first step is the opening value
  kind: 'increase' | 'decrease' | 'total';
}

function buildSteps(kpis: KpiPayload | undefined): WaterfallStep[] {
  // Backend sends sale/ui already signed (negative). Gross falls back to the
  // legacy total when the additive fields aren't present (older backend), so the
  // chart never breaks on a schema drift — it just degrades to a single bar.
  const gross = kpis?.gross_purchase_mu ?? kpis?.total_purchase_mu ?? 0;
  const sale = kpis?.sale_energy_mu ?? 0; // e.g. -389.85
  const ui = kpis?.ui_energy_mu ?? 0;     // e.g. -18.72
  const net = kpis?.net_purchase_mu ?? gross + sale + ui;
  return [
    { label: 'Gross Purchase\n(excl. Sale/UI)', value: gross, kind: 'total' },
    { label: 'Sale Energy\n(PMC + PTC)', value: sale, kind: 'decrease' },
    { label: 'UI Energy\n(Reconciliation)', value: ui, kind: 'decrease' },
    { label: 'Net Purchase\n(Gross + Sale + UI)', value: net, kind: 'total' },
  ];
}

export default function WaterfallSection({ kpis, loading }: { kpis: KpiPayload | undefined; loading: boolean }) {
  const steps = buildSteps(kpis);

  // Running base (invisible support bar) + visible bar per step.
  let running = 0;
  const bases: number[] = [];
  const bars: number[] = [];
  const colors: string[] = [];
  steps.forEach((s, i) => {
    if (i === 0 || i === steps.length - 1) {
      bases.push(0);
      bars.push(Math.abs(s.value));
      colors.push(i === 0 ? '#2563eb' : '#65a30d');
    } else {
      const start = running;
      const end = running + s.value;
      bases.push(Math.min(start, end));
      bars.push(Math.abs(s.value));
      colors.push('#dc2626');
      running = end;
    }
    if (i === 0) running = s.value;
  });

  const option = {
    textStyle: { fontFamily: CHART_FONT },
    grid: { left: 70, right: 24, top: 30, bottom: 60 },
    xAxis: {
      type: 'category',
      data: steps.map((s) => s.label),
      axisLabel: { color: '#E8EEFB', fontWeight: 600, fontSize: 11 },
      axisLine: { lineStyle: { color: 'rgba(143,163,199,0.3)' } },
    },
    yAxis: {
      type: 'value',
      name: 'Energy (MU)',
      nameTextStyle: { color: TEXT_MUTED },
      splitLine: { lineStyle: { color: 'rgba(143,163,199,0.12)' } },
      axisLabel: { color: TEXT_MUTED },
    },
    tooltip: {
      backgroundColor: '#001B48',
      borderColor: 'rgba(242,179,61,0.3)',
      textStyle: { color: '#E8EEFB' },
    },
    series: [
      { type: 'bar', stack: 'wf', itemStyle: { color: 'transparent' }, data: bases, silent: true },
      {
        type: 'bar',
        stack: 'wf',
        data: bars.map((v, i) => ({ value: v, itemStyle: { color: colors[i] } })),
        barWidth: '55%',
        label: {
          show: true,
          position: 'top',
          color: '#fff',
          fontWeight: 700,
          formatter: (p: any) => steps[p.dataIndex].value.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        },
      },
    ],
  };

  return (
    <PremiumCard title="Power Procurement Waterfall" height={420} loading={loading}>
      <EChartBase option={option as any} />
    </PremiumCard>
  );
}
