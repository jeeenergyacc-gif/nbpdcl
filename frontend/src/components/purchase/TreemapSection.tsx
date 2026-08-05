import PremiumCard from './PremiumCard';
import BlockTreemap, { BlockTreemapBucket } from '@/components/charts/BlockTreemap';
import { TEXT_MUTED } from './theme';

interface SunburstRow {
  ppa_category: string;
  plant_type: string;
  plant_name: string;
  energy_quantum: number;
}

// Category palette (blue / green / gold) — blocks are coloured by their PARENT
// CATEGORY, not by plant type.
const CATEGORY_COLORS: Record<string, string> = {
  conventional: '#2F6FE0',
  renewable: '#2E9E6C',
  small: '#C79A34',
  other: '#5B7BA6',
};
function categoryColor(cat: string): string {
  const c = cat.toLowerCase();
  if (/small/.test(c)) return CATEGORY_COLORS.small;
  if (/renewable/.test(c)) return CATEGORY_COLORS.renewable;
  if (/conventional/.test(c)) return CATEGORY_COLORS.conventional;
  return CATEGORY_COLORS.other;
}

export default function TreemapSection({ data, loading }: { data: SunburstRow[] | undefined; loading: boolean }) {
  // PPA Category › Plant Type. Sale/negative rows excluded: a procurement treemap
  // shows energy bought, not sold.
  const rows = (data || []).filter((r) => r.energy_quantum > 0);

  const map = new Map<string, { total: number; items: Map<string, number> }>();
  rows.forEach((r) => {
    const cat = r.ppa_category || 'Unknown';
    const type = r.plant_type || 'Unknown';
    const b = map.get(cat) || { total: 0, items: new Map<string, number>() };
    b.total += r.energy_quantum;
    b.items.set(type, (b.items.get(type) || 0) + r.energy_quantum);
    map.set(cat, b);
  });

  const buckets: BlockTreemapBucket[] = Array.from(map.entries()).map(([name, b]) => ({
    name,
    total: b.total,
    color: categoryColor(name),
    items: Array.from(b.items.entries()).map(([n, v]) => ({ name: n, value: v })),
  }));
  const grandTotal = buckets.reduce((s, b) => s + b.total, 0);

  return (
    <PremiumCard title="Energy Treemap — PPA Category › Plant Type" height={440} loading={loading}>
      {buckets.length ? (
        <BlockTreemap buckets={buckets} unit="MU" digits={2} grandTotal={grandTotal} height={430} />
      ) : (
        <div className="flex items-center justify-center h-full text-sm" style={{ color: TEXT_MUTED }}>No data available</div>
      )}
    </PremiumCard>
  );
}
