import Plot from 'react-plotly.js';

interface GaugeChartProps {
  value: number;
  min?: number;
  max?: number;
  title?: string;
  suffix?: string;
  zones?: { range: [number, number]; color: string }[];
}

const PLOT_CONFIG = { displayModeBar: false, responsive: true };
const PLOT_FONT = { family: 'Inter, sans-serif', size: 11, color: '#111827' };

/**
 * Enterprise gauge: analog needle, graded colour zones, large centred value.
 * Shows the deviation value and its unit only — no "Safe Zone" caption.
 */
export default function GaugeChart({ value, min = -5, max = 5, suffix = ' MU', zones }: GaugeChartProps) {
  const span = max - min || 1;

  // Green (on target) → yellow → orange → red (severe), symmetric about zero.
  const defaultZones = zones || [
    { range: [min, min + span * 0.15] as [number, number], color: '#EF4444' },
    { range: [min + span * 0.15, min + span * 0.3] as [number, number], color: '#F97316' },
    { range: [min + span * 0.3, min + span * 0.42] as [number, number], color: '#FACC15' },
    { range: [min + span * 0.42, min + span * 0.58] as [number, number], color: '#22C55E' },
    { range: [min + span * 0.58, min + span * 0.7] as [number, number], color: '#FACC15' },
    { range: [min + span * 0.7, min + span * 0.85] as [number, number], color: '#F97316' },
    { range: [min + span * 0.85, max] as [number, number], color: '#EF4444' },
  ];

  // Needle: the gauge sweeps 180° (min at left, max at right).
  const clamped = Math.max(min, Math.min(max, value));
  const angle = Math.PI * (1 - (clamped - min) / span);
  const cx = 0.5;
  const cy = 0.26; // pivot sits on the gauge baseline
  const len = 0.30;
  const nx = cx + len * Math.cos(angle) * 0.62; // x compressed to the plot's aspect
  const ny = cy + len * Math.sin(angle);

  const needleColor = '#0F172A';

  return (
    <Plot
      data={[{
        type: 'indicator',
        mode: 'gauge+number',
        value,
        number: {
          suffix,
          font: { size: 30, family: 'Inter, sans-serif', color: '#0F172A' },
          valueformat: '.2f',
        },
        gauge: {
          axis: {
            range: [min, max],
            tickwidth: 1,
            tickcolor: '#94A3B8',
            tickfont: { size: 10, color: '#64748B' },
            nticks: 6,
          },
          bar: { color: 'rgba(0,0,0,0)', thickness: 0 }, // needle replaces the bar
          bgcolor: 'rgba(0,0,0,0)',
          borderwidth: 0,
          steps: defaultZones.map((z) => ({ range: z.range, color: z.color })),
        },
        domain: { x: [0, 1], y: [0, 1] },
      } as any]}
      layout={{
        margin: { t: 24, r: 26, b: 8, l: 26 },
        font: PLOT_FONT,
        paper_bgcolor: 'rgba(0,0,0,0)',
        transition: { duration: 600, easing: 'cubic-in-out' } as any,
        shapes: [
          // needle
          {
            type: 'line',
            xref: 'paper', yref: 'paper',
            x0: cx, y0: cy, x1: nx, y1: ny,
            line: { color: needleColor, width: 3 },
          },
          // hub
          {
            type: 'circle',
            xref: 'paper', yref: 'paper',
            x0: cx - 0.022, y0: cy - 0.035, x1: cx + 0.022, y1: cy + 0.035,
            fillcolor: needleColor,
            line: { color: '#FFFFFF', width: 1.5 },
          },
        ] as any,
      }}
      config={PLOT_CONFIG}
      useResizeHandler
      style={{ width: '100%', height: '100%' }}
    />
  );
}
