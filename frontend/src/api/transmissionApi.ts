import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface TransmissionFilters {
  year: string; quarter: string; month: string;
  discom?: string;
}

function qs(filters: TransmissionFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  return params.toString();
}

const REFRESH_MS = 60_000;

function useEndpoint<T>(path: string, filters: TransmissionFilters) {
  return useQuery<T>({
    queryKey: ['transmission', path, filters],
    queryFn: async () => (await apiClient.get(`/transmission/${path}?${qs(filters)}`)).data,
    refetchInterval: REFRESH_MS,
  });
}

export interface TransmissionKpis {
  central_power: number; boundary_schedule: number; stoa_schedule: number; railway_schedule: number;
  schedule_nb_sb_nepal: number; ui_energy: number; actual_drawal_boundary: number;
  ctl: number; renewable_central: number; ctl_pct: number;
  intrastate_purchase: number; total_power_bsptcl: number; nbpdcl_drawal: number; sbpdcl_drawal: number;
  embedded_generation: number; discom_drawal: number; prosumer_sale: number; railway_overdrawal: number;
  total_drawal_bsptcl: number; stl: number; stl_pct: number;
  nepal_schedule: number; nepal_drawal: number; nepal_active: boolean;
  total_loss: number; total_loss_pct: number;
  period: string | null; months_covered: number;
}

export interface BalanceRow {
  band: string; sl: number; particulars: string; formula: string;
  mu: number; pct: number; subtotal?: boolean; loss?: boolean;
}
export interface ValidationRow { rule: string; expected: number; actual: number; pass: boolean; }

export const useTransmissionFilterOptions = () =>
  useQuery({ queryKey: ['transmission', 'filters'], queryFn: async () => (await apiClient.get('/transmission/filters')).data, staleTime: 5 * 60_000 });

/** One request that returns every section for the page (kpis, waterfalls, sankeys,
 *  trend, balance table, validation, insights). Replaces nine separate calls. */
export const useTransmissionDashboard = (f: TransmissionFilters) => useEndpoint<any>('dashboard', f);

export const useTransmissionKpis = (f: TransmissionFilters) => useEndpoint<TransmissionKpis>('kpis', f);
export const useTransmissionCtlWaterfall = (f: TransmissionFilters) => useEndpoint<any>('ctl-waterfall', f);
export const useTransmissionStlWaterfall = (f: TransmissionFilters) => useEndpoint<any>('stl-waterfall', f);
export const useTransmissionCtlSankey = (f: TransmissionFilters) => useEndpoint<any>('ctl-sankey', f);
export const useTransmissionStlSankey = (f: TransmissionFilters) => useEndpoint<any>('stl-sankey', f);
export const useTransmissionTrend = (f: TransmissionFilters) => useEndpoint<any[]>('trend', f);
export const useTransmissionBalanceTable = (f: TransmissionFilters) => useEndpoint<{ period: string; rows: BalanceRow[]; nepal_active: boolean; nepal_power: number }>('balance-table', f);
export const useTransmissionValidation = (f: TransmissionFilters) => useEndpoint<ValidationRow[]>('validation', f);
export const useTransmissionInsights = (f: TransmissionFilters) => useEndpoint<string[]>('insights', f);
