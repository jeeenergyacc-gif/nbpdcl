import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  color?: string;
  loading?: boolean;
  /** Optional mini sparkline series. Purely presentational — values come from
   *  the backend trend payload; nothing is recomputed or invented here. */
  sparkline?: number[];
  /** Optional secondary line under the value (e.g. "Daily Avg: 120.401 MU"). */
  sub?: string;
}

/** Renders the sparkline as a smooth SVG path scaled to the series' own range. */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null;
  const W = 120;
  const H = 30;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = W / (points.length - 1);
  const coords = points.map((v, i) => [i * step, H - ((v - min) / span) * (H - 4) - 2] as const);

  // Catmull-Rom → cubic bezier for a smooth curve without extra deps.
  let d = `M ${coords[0][0]} ${coords[0][1]}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? 0 : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2 < coords.length ? i + 2 : i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  const area = `${d} L ${W} ${H} L 0 ${H} Z`;
  const gid = `spark-${color.replace('#', '')}`;

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2 block">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function KpiCard({ label, value, unit, icon: Icon, color = '#1565C0', loading, sparkline, sub }: KpiCardProps) {
  if (loading) {
    return (
      <div className="card p-4 h-full">
        <div className="skeleton h-4 w-24 mb-3" />
        <div className="skeleton h-7 w-20 mb-3" />
        <div className="skeleton h-6 w-full" />
      </div>
    );
  }

  return (
    <div className="card p-4 h-full flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-textsecondary uppercase tracking-wide truncate">{label}</div>
          <div className="kpi-value text-2xl font-extrabold text-textprimary mt-1 truncate">
            {value}
            {unit && <span className="text-xs font-medium text-textsecondary ml-1">{unit}</span>}
          </div>
          {sub && <div className="text-[11px] text-textsecondary mt-0.5 truncate">{sub}</div>}
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}1A`, color }}
        >
          <Icon size={20} />
        </div>
      </div>
      {sparkline && sparkline.length > 1 && (
        <div className="mt-auto">
          <Sparkline points={sparkline} color={color} />
        </div>
      )}
    </div>
  );
}
