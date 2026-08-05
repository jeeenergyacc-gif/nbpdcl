import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface InputEnergyFilters {
  year: string; quarter: string; month: string;
  discom_name: string; circle: string; division: string; substation: string;
  feeder_name: string; feeder_type: string; search: string;
}

function qs(filters: InputEnergyFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  return params.toString();
}

const REFRESH_MS = 60_000;

function useEndpoint<T>(path: string, filters: InputEnergyFilters) {
  return useQuery<T>({
    queryKey: ['input-energy', path, filters],
    queryFn: async () => (await apiClient.get(`/input-energy/${path}?${qs(filters)}`)).data,
    refetchInterval: REFRESH_MS,
  });
}

export const useInputEnergyFilterOptions = () =>
  useQuery({ queryKey: ['input-energy', 'filters'], queryFn: async () => (await apiClient.get('/input-energy/filters')).data, staleTime: 5 * 60_000 });

export const useInputEnergyKpis = (f: InputEnergyFilters) => useEndpoint<any>('kpis', f);
export const useInputEnergyTrend = (f: InputEnergyFilters) => useEndpoint<any[]>('trend', f);
export const useInputEnergyDiscomShare = (f: InputEnergyFilters) => useEndpoint<any[]>('discom-share', f);
export const useInputEnergyCircleRanking = (f: InputEnergyFilters) => useEndpoint<any[]>('circle-ranking', f);
export const useInputEnergyDivisionRanking = (f: InputEnergyFilters) => useEndpoint<any[]>('division-ranking', f);
export const useInputEnergyCircleHeatmap = (f: InputEnergyFilters) => useEndpoint<any>('circle-heatmap', f);
export const useInputEnergyDivisionHeatmap = (f: InputEnergyFilters) => useEndpoint<any>('division-heatmap', f);
export const useInputEnergyTreemap = (f: InputEnergyFilters) => useEndpoint<any[]>('treemap', f);
export const useInputEnergySunburst = (f: InputEnergyFilters) => useEndpoint<any[]>('sunburst', f);
export const useInputEnergySankey = (f: InputEnergyFilters) => useEndpoint<any>('sankey', f);
export const useInputEnergyTopFeeders = (f: InputEnergyFilters) => useEndpoint<any[]>('top-feeders', f);
export const useInputEnergyBottomFeeders = (f: InputEnergyFilters) => useEndpoint<any[]>('bottom-feeders', f);
export const useInputEnergyBubble = (f: InputEnergyFilters) => useEndpoint<any[]>('bubble', f);
export const useInputEnergyScatter = (f: InputEnergyFilters) => useEndpoint<any[]>('scatter', f);
export const useInputEnergyPareto = (f: InputEnergyFilters) => useEndpoint<any[]>('pareto', f);
export const useInputEnergyWaterfall = (f: InputEnergyFilters) => useEndpoint<any[]>('waterfall', f);
export const useInputEnergyGauge = (f: InputEnergyFilters) => useEndpoint<any>('gauge', f);
export const useInputEnergyInsights = (f: InputEnergyFilters) => useEndpoint<string[]>('insights', f);

export function useInputEnergyTable(f: InputEnergyFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: ['input-energy', 'table', f, page, pageSize],
    queryFn: async () => (await apiClient.get(`/input-energy/table?${qs(f)}&page=${page}&page_size=${pageSize}`)).data,
  });
}
