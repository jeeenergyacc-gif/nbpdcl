import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface RailwayFilters {
  year: string; quarter: string; month: string; metric: string;
  discom?: string;
}

function qs(filters: RailwayFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  return params.toString();
}

const REFRESH_MS = 60_000;

function useEndpoint<T>(path: string, filters: RailwayFilters) {
  return useQuery<T>({
    queryKey: ['railway', path, filters],
    queryFn: async () => (await apiClient.get(`/railway/${path}?${qs(filters)}`)).data,
    refetchInterval: REFRESH_MS,
  });
}

export const useRailwayFilterOptions = () =>
  useQuery({ queryKey: ['railway', 'filters'], queryFn: async () => (await apiClient.get('/railway/filters')).data, staleTime: 5 * 60_000 });

export const useRailwayKpis = (f: RailwayFilters) => useEndpoint<any>('kpis', f);
export const useRailwayScheduleTrend = (f: RailwayFilters) => useEndpoint<any[]>('schedule-trend', f);
export const useRailwayScheduleVsDrawal = (f: RailwayFilters) => useEndpoint<any[]>('schedule-vs-drawal', f);
export const useRailwayOverdrawal = (f: RailwayFilters) => useEndpoint<any[]>('overdrawal', f);
export const useRailwayMonthlyComparison = (f: RailwayFilters) => useEndpoint<any[]>('monthly-comparison', f);
export const useRailwayDistribution = (f: RailwayFilters) => useEndpoint<any[]>('distribution', f);
export const useRailwayGauge = (f: RailwayFilters) => useEndpoint<any>('gauge', f);
export const useRailwayWaterfall = (f: RailwayFilters) => useEndpoint<any[]>('waterfall', f);
export const useRailwaySankey = (f: RailwayFilters) => useEndpoint<any>('sankey', f);
export const useRailwayInsights = (f: RailwayFilters) => useEndpoint<string[]>('insights', f);

export function useRailwayTable(f: RailwayFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: ['railway', 'table', f, page, pageSize],
    queryFn: async () => (await apiClient.get(`/railway/table?${qs(f)}&page=${page}&page_size=${pageSize}`)).data,
  });
}
