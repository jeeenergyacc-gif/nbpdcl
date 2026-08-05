import { useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';

import FilterBar, { PurchaseFilters } from '@/components/filters/FilterBar';
import {
  usePurchaseFilterOptions,
  usePurchaseKpis,
  usePurchaseDistribution,
  usePurchaseSunburst,
  usePurchaseTreemap,
  usePurchaseSankey,
  usePurchaseTop10,
  usePurchaseBubble,
  usePurchaseHeatmap,
  usePurchasePolar,
} from '@/api/purchaseApi';

import PowerProcurementHero from '@/components/purchase/PowerProcurementHero';
import AllocationChip from '@/components/filters/AllocationChip';
import TreemapSection from '@/components/purchase/TreemapSection';
import SankeySection from '@/components/purchase/SankeySection';
import LollipopSection from '@/components/purchase/LollipopSection';
import BubbleSection from '@/components/purchase/BubbleSection';
import HeatmapSection from '@/components/purchase/HeatmapSection';
import RidgelineSection from '@/components/purchase/RidgelineSection';
import WaterfallSection from '@/components/purchase/WaterfallSection';
import { NAVY_DEEPEST, GOLD, TEXT_MUTED } from '@/components/purchase/theme';

const EMPTY_FILTERS: PurchaseFilters = {
  year: '', quarter: '', month: '', plant_type: '', plant_name: '',
  voltage_level: '', ppa_category: '', ppa_type: '', search: '', discom: 'BSPHCL',
};

export default function PowerPurchaseDashboard() {
  const [filters, setFilters] = useState<PurchaseFilters>(EMPTY_FILTERS);

  const { data: options } = usePurchaseFilterOptions();
  const { data: kpis, isLoading: kpisLoading, refetch, isFetching } = usePurchaseKpis(filters);
  const { data: distribution, isLoading: distLoading } = usePurchaseDistribution(filters);
  const { data: sunburst, isLoading: sunburstLoading } = usePurchaseSunburst(filters);
  const { data: treemap, isLoading: treemapLoading } = usePurchaseTreemap(filters);
  const { data: sankey, isLoading: sankeyLoading } = usePurchaseSankey(filters);
  const { data: top10, isLoading: top10Loading } = usePurchaseTop10(filters);
  const { data: bubble, isLoading: bubbleLoading } = usePurchaseBubble(filters);
  const { data: heatmap, isLoading: heatmapLoading } = usePurchaseHeatmap(filters);
  const { data: polar } = usePurchasePolar(filters);

  const handleChange = (key: keyof PurchaseFilters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const handleReset = () => setFilters(EMPTY_FILTERS);

  const dataMonth = kpis?.selected_month && kpis.selected_month !== 'All' ? kpis.selected_month : undefined;

  return (
    <div className="flex-1 min-w-0" style={{ background: NAVY_DEEPEST, minHeight: '100vh' }}>
      {/* Fixed dark header — inherits the login page's navy language rather than the generic light Header */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-6 py-4"
        style={{ background: NAVY_DEEPEST, borderBottom: '1px solid rgba(242,179,61,0.15)' }}
      >
        <h1 className="text-xl font-black tracking-wide" style={{ color: '#fff' }}>
          POWER PROCUREMENT DASHBOARD
        </h1>
        <div className="flex items-center gap-3">
          {dataMonth && (
            <div
              className="hidden sm:flex items-center gap-2 text-xs font-semibold rounded-lg px-3 py-2"
              style={{ color: '#fff', background: 'rgba(242,179,61,0.1)', border: '1px solid rgba(242,179,61,0.3)' }}
            >
              <CalendarDays size={14} color={GOLD} />
              Data Month <span style={{ color: GOLD }}>{dataMonth}</span>
            </div>
          )}
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg transition"
            style={{ border: '1px solid rgba(242,179,61,0.3)', color: TEXT_MUTED }}
            title="Refresh data"
          >
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <div className="p-6 space-y-5">
        <FilterBar filters={filters} options={options} onChange={handleChange} onReset={handleReset} />

        {/* Allocation status chip — holding vs sharing-ratio allocated */}
        <AllocationChip discom={filters.discom} year={filters.year} quarter={filters.quarter} month={filters.month} />

        {/* 1. KPI strip + 3D donut */}
        <PowerProcurementHero
          kpis={kpis}
          kpisLoading={kpisLoading}
          distribution={distribution}
          distLoading={distLoading}
          sunburst={sunburst}
          polar={polar}
        />

        {/* 2. Treemap */}
        <TreemapSection data={sunburst} loading={sunburstLoading} />

        {/* 3. Sankey */}
        <SankeySection data={sankey} loading={sankeyLoading} />

        {/* 5. Top 10 plants — 3D lollipop */}
        <LollipopSection data={top10} loading={top10Loading} />

        {/* 6. Plant-wise 3D bubble */}
        <BubbleSection data={bubble} loading={bubbleLoading} />

        {/* 7. Monthly heatmap */}
        <HeatmapSection data={heatmap} loading={heatmapLoading} />

        {/* 8. Ridgeline area chart (derived from the same heatmap payload) */}
        <RidgelineSection data={heatmap} loading={heatmapLoading} />

        {/* 9. Procurement waterfall */}
        <WaterfallSection kpis={kpis} loading={kpisLoading} />
      </div>
    </div>
  );
}
