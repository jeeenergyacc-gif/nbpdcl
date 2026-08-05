import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { PurchaseFilters } from '@/components/filters/FilterBar';

function qs(filters: PurchaseFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  return params.toString();
}

const REFRESH_MS = 60_000;

export function usePurchaseFilterOptions() {
  return useQuery({
    queryKey: ['purchase', 'filters'],
    queryFn: async () => (await apiClient.get('/purchase/filters')).data,
    staleTime: 5 * 60_000,
  });
}

function useEndpoint<T>(path: string, filters: PurchaseFilters) {
  return useQuery<T>({
    queryKey: ['purchase', path, filters],
    queryFn: async () => (await apiClient.get(`/purchase/${path}?${qs(filters)}`)).data,
    refetchInterval: REFRESH_MS,
  });
}

export const usePurchaseKpis = (f: PurchaseFilters) => useEndpoint<any>('kpis', f);
export const usePurchaseTrend = (f: PurchaseFilters) => useEndpoint<any[]>('trend', f);
export const usePurchaseDistribution = (f: PurchaseFilters) => useEndpoint<any[]>('plant-type-distribution', f);
export const usePurchaseTreemap = (f: PurchaseFilters) => useEndpoint<any[]>('treemap', f);
export const usePurchaseSunburst = (f: PurchaseFilters) => useEndpoint<any[]>('sunburst', f);
export const usePurchaseSankey = (f: PurchaseFilters) => useEndpoint<any>('sankey', f);
export const usePurchaseBubble = (f: PurchaseFilters) => useEndpoint<any[]>('bubble', f);
export const usePurchaseTop10 = (f: PurchaseFilters) => useEndpoint<any[]>('top10', f);
export const usePurchaseWaterfall = (f: PurchaseFilters) => useEndpoint<any[]>('waterfall', f);
export const usePurchaseHeatmap = (f: PurchaseFilters) => useEndpoint<any>('heatmap', f);
export const usePurchasePolar = (f: PurchaseFilters) => useEndpoint<any[]>('polar', f);
export const usePurchaseInsights = (f: PurchaseFilters) => useEndpoint<string[]>('insights', f);
