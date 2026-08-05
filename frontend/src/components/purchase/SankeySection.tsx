import PremiumCard from './PremiumCard';
import BlockSankey, { BlockSankeyNode, BlockSankeyLink } from '@/components/charts/BlockSankey';
import { plantColor, PLANT_TYPE_ORDER, TEXT_MUTED } from './theme';

interface SankeyPayload {
  nodes: string[];
  links: { source: number; target: number; value: number }[];
  node_values?: Record<string, number>;
}

// Colour governance: a node's colour is also its flow's colour.
function nodeColor(name: string): string {
  const n = name.trim().toLowerCase();
  if (n === 'central') return '#2F6FE0';
  if (n === 'intra') return '#1F8C8C';
  if (n.includes('sale')) return '#C0392B';
  if (/renewable/.test(n)) return '#2E9E6C';
  if (/small/.test(n)) return '#C79A34';
  if (/conventional/.test(n)) return '#2F6FE0';
  const hit = PLANT_TYPE_ORDER.find((t) => t.toLowerCase() === n);
  if (hit) return plantColor(hit);
  return '#5B7BA6';
}

export default function SankeySection({ data, loading }: { data: SankeyPayload | undefined; loading: boolean }) {
  const names = data?.nodes || [];
  const rawLinks = (data?.links || []).filter((l) => l.value > 0);
  const nodeValues = data?.node_values || {};

  const links: BlockSankeyLink[] = rawLinks.map((l) => ({
    source: names[l.source],
    target: names[l.target],
    value: l.value,
  }));

  // Column assignment: source-only = 0, target-only = 2, everything else = middle.
  const hasIn = new Set(links.map((l) => l.target));
  const hasOut = new Set(links.map((l) => l.source));
  const nodes: BlockSankeyNode[] = names.map((n) => ({
    name: n,
    value: nodeValues[n] ?? 0,
    column: !hasIn.has(n) ? 0 : !hasOut.has(n) ? 2 : 1,
    color: nodeColor(n),
  }));

  return (
    <PremiumCard title="Energy Sankey — PPA Category › Plant Type › PPA Type" height={470} loading={loading}>
      {nodes.length ? (
        <BlockSankey nodes={nodes} links={links} height={460} unit="MU" digits={2} />
      ) : (
        <div className="flex items-center justify-center h-full text-sm" style={{ color: TEXT_MUTED }}>No data available</div>
      )}
    </PremiumCard>
  );
}
