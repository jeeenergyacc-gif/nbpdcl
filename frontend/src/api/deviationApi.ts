import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface DeviationFilters {
  year: string; quarter: string; month: string; range: string;
  discom?: string;
}

function qs(filters: DeviationFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  return params.toString();
}

const REFRESH_MS = 60_000;

function useEndpoint<T>(path: string, filters: DeviationFilters) {
  return useQuery<T>({
    queryKey: ['deviation', path, filters],
    queryFn: async () => (await apiClient.get(`/deviation/${path}?${qs(filters)}`)).data,
    refetchInterval: REFRESH_MS,
  });
}

export const useDeviationFilterOptions = () =>
  useQuery({ queryKey: ['deviation', 'filters'], queryFn: async () => (await apiClient.get('/deviation/filters')).data, staleTime: 5 * 60_000 });

export const useDeviationKpis = (f: DeviationFilters) => useEndpoint<any>('kpis', f);
export const useDeviationTrend = (f: DeviationFilters) => useEndpoint<any[]>('trend', f);
export const useDeviationCumulative = (f: DeviationFilters) => useEndpoint<any[]>('cumulative', f);
export const useDeviationHeatmap = (f: DeviationFilters) => useEndpoint<any>('heatmap', f);
export const useDeviationDistribution = (f: DeviationFilters) => useEndpoint<any>('distribution', f);
export const useDeviationInsights = (f: DeviationFilters) => useEndpoint<string[]>('insights', f);

export function useDeviationTable(f: DeviationFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: ['deviation', 'table', f, page, pageSize],
    queryFn: async () => (await apiClient.get(`/deviation/table?${qs(f)}&page=${page}&page_size=${pageSize}`)).data,
  });
}
