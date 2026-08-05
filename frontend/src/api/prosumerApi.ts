import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface ProsumerFilters {
  year: string; quarter: string; month: string;
  plant_type: string; voltage_level: string; ppa_type: string; plant_name: string;
  search: string; min_sales: string; max_sales: string;
  discom?: string;
}

function qs(filters: ProsumerFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  return params.toString();
}

const REFRESH_MS = 60_000;

function useEndpoint<T>(path: string, filters: ProsumerFilters) {
  return useQuery<T>({
    queryKey: ['prosumer', path, filters],
    queryFn: async () => (await apiClient.get(`/prosumer/${path}?${qs(filters)}`)).data,
    refetchInterval: REFRESH_MS,
  });
}

export const useProsumerFilterOptions = () =>
  useQuery({ queryKey: ['prosumer', 'filters'], queryFn: async () => (await apiClient.get('/prosumer/filters')).data, staleTime: 5 * 60_000 });

export const useProsumerKpis = (f: ProsumerFilters) => useEndpoint<any>('kpis', f);
export const useProsumerTrend = (f: ProsumerFilters) => useEndpoint<any[]>('trend', f);
export const useProsumerPlantTypeContribution = (f: ProsumerFilters) => useEndpoint<any[]>('plant-type-contribution', f);
export const useProsumerTop10 = (f: ProsumerFilters) => useEndpoint<any[]>('top10', f);
export const useProsumerVoltageSales = (f: ProsumerFilters) => useEndpoint<any[]>('voltage-sales', f);
export const useProsumerTypeVoltageHeatmap = (f: ProsumerFilters) => useEndpoint<any>('type-voltage-heatmap', f);
export const useProsumerTreemap = (f: ProsumerFilters) => useEndpoint<any[]>('treemap', f);
export const useProsumerBubble = (f: ProsumerFilters) => useEndpoint<any[]>('bubble', f);
export const useProsumerMonthlyHeatmap = (f: ProsumerFilters) => useEndpoint<any>('monthly-heatmap', f);
export const useProsumerWaterfall = (f: ProsumerFilters) => useEndpoint<any[]>('waterfall', f);
export const useProsumerSankey = (f: ProsumerFilters) => useEndpoint<any>('sankey', f);
export const useProsumerInsights = (f: ProsumerFilters) => useEndpoint<string[]>('insights', f);

export function useProsumerTable(f: ProsumerFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: ['prosumer', 'table', f, page, pageSize],
    queryFn: async () => (await apiClient.get(`/prosumer/table?${qs(f)}&page=${page}&page_size=${pageSize}`)).data,
  });
}
