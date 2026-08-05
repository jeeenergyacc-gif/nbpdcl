import { Zap, Factory, Flame, Leaf, Landmark, Users, TrendingDown, LucideIcon } from 'lucide-react';
import PremiumCard from './PremiumCard';
import DonutChart3DFixed from './DonutChart3DFixed';
import { GOLD, NAVY_CARD, NAVY_ACCENT, TEXT_MUTED, PLANT_TYPE_ORDER } from './theme';

function fmt(v?: number) {
  if (v === undefined || v === null) return '—';
  return v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

interface KpiTileProps {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  icon: LucideIcon;
  iconColor?: string;
  loading?: boolean;
}

function KpiTile({ label, value, unit, sub, icon: Icon, iconColor = GOLD, loading }: KpiTileProps) {
  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-3"
      style={{
        background: `linear-gradient(180deg, ${NAVY_CARD} 0%, ${NAVY_ACCENT} 100%)`,
        border: '1px solid rgba(242,179,61,0.16)',
      }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${iconColor}26`, color: iconColor }}
      >
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide truncate" style={{ color: TEXT_MUTED }}>
          {label}
        </div>
        <div className="text-lg font-extrabold truncate" style={{ color: '#fff' }}>
          {loading ? '—' : value}
          {unit && <span className="text-[10px] font-medium ml-1" style={{ color: TEXT_MUTED }}>{unit}</span>}
        </div>
        {sub && <div className="text-[10px]" style={{ color: TEXT_MUTED }}>{sub}</div>}
      </div>
    </div>
  );
}

interface PowerProcurementHeroProps {
  kpis: any;
  kpisLoading: boolean;
  distribution: any[] | undefined;
  distLoading: boolean;
  sunburst: any[] | undefined;
  polar: any[] | undefined;
}

export default function PowerProcurementHero({ kpis, kpisLoading, distribution, distLoading, sunburst, polar }: PowerProcurementHeroProps) {
  const donutData = PLANT_TYPE_ORDER.map((name) => {
    const row = (distribution || []).find((d: any) => (d.plant_type || '').toLowerCase() === name.toLowerCase());
    return { name, value: row ? row.energy_quantum : 0 };
  }).filter((d) => d.value > 0);

  const total = kpis?.total_purchase_mu ?? 0;

  // Category totals derived from the sunburst dataset (ppa_category rollup) —
  // no new backend field required, just re-aggregated on the client.
  const categoryTotals = (sunburst || []).reduce<Record<string, number>>((acc, r) => {
    const cat = r.ppa_category || 'Unknown';
    acc[cat] = (acc[cat] || 0) + (r.energy_quantum || 0);
    return acc;
  }, {});
  const conventional = Object.entries(categoryTotals).find(([c]) => /conventional/i.test(c))?.[1];
  const renewable = Object.entries(categoryTotals)
    .filter(([c]) => !/conventional/i.test(c))
    .reduce((s, [, v]) => s + v, 0) || undefined;

  // Central / Intra share — now sourced directly from the backend KPI payload
  // (derived from ppa_type, the established rule — NOT voltage_level). Percentages
  // are taken against procurement (central + intra), matching the reference cards.
  const central = kpis?.central_share_mu;
  const intra = kpis?.intra_share_mu;
  const ciBase = (central ?? 0) + (intra ?? 0);

  // Sale energy is signed-negative in the sheet; the card shows it in red.
  const sale = kpis?.sale_energy_mu;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Total Energy Quantum" value={fmt(total)} unit="MU" icon={Zap} iconColor="#3DA6F2" loading={kpisLoading} />
        <KpiTile label="Total Plants" value={String(kpis?.total_plants ?? '—')} unit="Nos." icon={Factory} iconColor="#2E9E6C" loading={kpisLoading} />
        <KpiTile
          label="Conventional Generation"
          value={conventional !== undefined ? fmt(conventional) : '—'}
          unit="MU"
          sub={conventional !== undefined && total ? `${((conventional / total) * 100).toFixed(1)}%` : undefined}
          icon={Flame}
          iconColor="#E85D3C"
          loading={distLoading}
        />
        <KpiTile
          label="Renewable Generation"
          value={renewable !== undefined ? fmt(renewable) : '—'}
          unit="MU"
          sub={renewable !== undefined && total ? `${((renewable / total) * 100).toFixed(1)}%` : undefined}
          icon={Leaf}
          iconColor="#2E9E6C"
          loading={distLoading}
        />
        <KpiTile
          label="Central Share"
          value={central !== undefined ? fmt(central) : '—'}
          unit="MU"
          sub={central !== undefined && ciBase ? `${((central / ciBase) * 100).toFixed(1)}%` : undefined}
          icon={Landmark}
          iconColor="#8B5CF6"
          loading={kpisLoading}
        />
        <KpiTile
          label="Intra Share"
          value={intra !== undefined ? fmt(intra) : '—'}
          unit="MU"
          sub={intra !== undefined && ciBase ? `${((intra / ciBase) * 100).toFixed(1)}%` : undefined}
          icon={Users}
          iconColor="#3DA6F2"
          loading={kpisLoading}
        />
        <KpiTile
          label="Sale Energy (Negative)"
          value={sale !== undefined ? fmt(sale) : '—'}
          unit="MU"
          icon={TrendingDown}
          iconColor="#E05252"
          loading={kpisLoading}
        />
      </div>

      <PremiumCard title="Energy by Plant Type — 3D Donut" height={510} loading={distLoading}>
        <DonutChart3DFixed data={donutData} />
      </PremiumCard>
    </div>
  );
}
