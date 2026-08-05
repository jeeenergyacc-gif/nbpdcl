import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

/** Period selector shared by every allocatable dashboard. */
export interface SharingPeriod {
  discom?: string;
  year?: string;
  quarter?: string;
  month?: string;
}

export interface SharingRatio {
  discom: string;
  factor: number;
  nbpdcl_pct: number | null;
  sbpdcl_pct: number | null;
  period_type: string;
  period_key: string;
  resolved: boolean;
  holding: boolean;
}

export interface SharingSplit {
  period_type: string;
  period_key: string;
  nbpdcl_mu: number;
  sbpdcl_mu: number;
  total_mu: number;
  nbpdcl_pct: number | null;
  sbpdcl_pct: number | null;
  resolved: boolean;
}

function qs(p: SharingPeriod) {
  const params = new URLSearchParams();
  if (p.discom) params.set('discom', p.discom);
  if (p.year) params.set('year', p.year);
  if (p.quarter) params.set('quarter', p.quarter);
  if (p.month) params.set('month', p.month);
  return params.toString();
}

const REFRESH_MS = 60_000;

/** Resolved NBPDCL/SBPDCL sharing ratio for the selected period. */
export function useSharingRatio(p: SharingPeriod, opts?: { enabled?: boolean }) {
  const discom = (p.discom || 'BSPHCL').toUpperCase();
  return useQuery<SharingRatio>({
    queryKey: ['sharing', 'ratio', discom, p.year, p.quarter, p.month],
    queryFn: async () => (await apiClient.get(`/sharing/ratio?${qs({ ...p, discom })}`)).data,
    // BSPHCL is always holding (100%) — no need to hit the network. Callers that
    // already have the resolved pct (e.g. the transmission balance payload) pass
    // { enabled: false } so the whole page reads one single source of truth.
    enabled: (opts?.enabled ?? true) && (discom === 'NBPDCL' || discom === 'SBPDCL'),
    refetchInterval: REFRESH_MS,
    staleTime: 30_000,
  });
}

/** NBPDCL/SBPDCL split as MU + % — powers the DISCOM Sharing Percentage chart. */
export function useSharingSplit(p: Omit<SharingPeriod, 'discom'>) {
  return useQuery<SharingSplit>({
    queryKey: ['sharing', 'split', p.year, p.quarter, p.month],
    queryFn: async () => (await apiClient.get(`/sharing/split?${qs(p)}`)).data,
    refetchInterval: REFRESH_MS,
    staleTime: 30_000,
  });
}

/** "48.00" -> "48", "48.50" -> "48.5", "48.25" -> "48.25". Never shows trailing zeros. */
export function formatPct(pct: number | null | undefined): string | null {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return null;
  return `${parseFloat(pct.toFixed(2))}%`;
}
