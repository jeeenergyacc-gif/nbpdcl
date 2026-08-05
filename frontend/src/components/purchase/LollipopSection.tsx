import PremiumCard from './PremiumCard';
import EChartBase from './EChartBase';
import { TEXT_MUTED, CHART_FONT } from './theme';

interface Top10Row {
  plant_name: string;
  energy_quantum: number;
}

const STEM_COLORS = ['#E85D3C', '#E5578F', '#F2C13D', '#3DA6F2', '#F2A23D', '#3DBB6B', '#8B6BE0', '#7B5BD6', '#3DC6D9', '#3D7DF2'];

// Wrap a plant name onto max 2 lines so long names never overlap neighbours.
function wrapName(name: string): string {
  if (name.length <= 12) return name;
  const words = name.split(' ');
  if (words.length === 1) return name;
  const mid = Math.ceil(words.length / 2);
  return words.slice(0, mid).join(' ') + '\n' + words.slice(mid).join(' ');
}

// Stem + foot disc (flat base) + radial-gradient sphere on top.
function renderLollipop(colors: string[]) {
  return (params: any, api: any) => {
    const idx = params.dataIndex;
    const color = colors[idx % colors.length];
    const x = api.coord([idx, 0])[0];
    const zeroY = api.coord([idx, 0])[1];
    const valueY = api.coord([idx, api.value(1)])[1];
    const stemWidth = 6;
    const ballR = 15;

    const value = Number(api.value(1));

    return {
      type: 'group',
      children: [
        // flat foot disc at the base
        {
          type: 'ellipse',
          shape: { cx: x, cy: zeroY, rx: 16, ry: 5 },
          style: { fill: color, opacity: 0.55, shadowColor: 'rgba(0,0,0,0.4)', shadowBlur: 5, shadowOffsetY: 2 },
        },
        // stem
        {
          type: 'rect',
          shape: { x: x - stemWidth / 2, y: valueY, width: stemWidth, height: zeroY - valueY },
          style: { fill: color, opacity: 0.92 },
        },
        // sphere
        {
          type: 'circle',
          shape: { cx: x, cy: valueY, r: ballR },
          style: {
            fill: {
              type: 'radial', x: 0.3, y: 0.3, r: 0.8,
              colorStops: [
                { offset: 0, color: '#ffffff' },
                { offset: 0.25, color },
                { offset: 1, color },
              ],
            },
            shadowColor: 'rgba(0,0,0,0.5)', shadowBlur: 6, shadowOffsetY: 3,
          },
        },
        // value label above the sphere — drawn here because a `custom` series
        // ignores the series-level `label` config (that only applies to built-in
        // series types), which is why the values were previously invisible.
        {
          type: 'text',
          style: {
            x,
            y: valueY - ballR - 9,
            text: value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            textAlign: 'center',
            textVerticalAlign: 'bottom',
            fill: '#fff',
            fontFamily: CHART_FONT,
            fontWeight: 700,
            fontSize: 13,
            textShadowColor: 'rgba(0,0,0,0.65)',
            textShadowBlur: 4,
          },
        },
      ],
    };
  };
}

export default function LollipopSection({ data, loading }: { data: Top10Row[] | undefined; loading: boolean }) {
  const rows = data || [];
  const names = rows.map((r) => r.plant_name);
  const values = rows.map((r) => r.energy_quantum);
  const maxVal = Math.max(1, ...values);

  const option = {
    textStyle: { fontFamily: CHART_FONT },
    grid: { left: 64, right: 24, top: 56, bottom: 70 },
    xAxis: {
      type: 'category',
      data: names,
      axisLine: { lineStyle: { color: 'rgba(143,163,199,0.4)' } },
      axisLabel: {
        color: '#E8EEFB', fontSize: 11, fontWeight: 600, interval: 0,
        formatter: (v: string) => wrapName(v),
        lineHeight: 14,
      },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'Energy (MU)',
      min: 0,
      max: Math.ceil((maxVal * 1.18) / 100) * 100, // headroom for the ball + label
      nameTextStyle: { color: TEXT_MUTED },
      splitLine: { lineStyle: { color: 'rgba(143,163,199,0.15)' } },
      axisLabel: { color: TEXT_MUTED },
    },
    tooltip: {
      backgroundColor: '#001B48',
      borderColor: 'rgba(242,179,61,0.3)',
      textStyle: { color: '#E8EEFB' },
      formatter: (p: any) => `<b>${p.name}</b><br/>${Number(p.value[1]).toLocaleString('en-IN', { maximumFractionDigits: 2 })} MU`,
    },
    series: [
      {
        type: 'custom',
        renderItem: renderLollipop(STEM_COLORS),
        // Labels are drawn inside renderItem (see above) — a `custom` series does
        // not honour the series-level `label` option.
        encode: { x: 0, y: 1 },
        data: values.map((v, i) => [i, v]),
        z: 5,
      },
    ],
  };

  return (
    <PremiumCard title="Top 10 Plants by Energy — 3D Lollipop" height={440} loading={loading}>
      {rows.length ? <EChartBase option={option as any} /> : (
        <div className="flex items-center justify-center h-full text-sm" style={{ color: TEXT_MUTED }}>No data available</div>
      )}
    </PremiumCard>
  );
}
