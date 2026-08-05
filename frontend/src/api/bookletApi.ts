import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';

export interface BookletCheck {
  check: string;
  computed: number;
  expected: number;
  difference: number;
  status: 'PASS' | 'REVIEW';
  note: string;
}

export interface BookletValidation {
  period: string;
  period_label: string;
  discom: string;
  ok: boolean;
  checks: BookletCheck[];
}

export interface BookletPeriods {
  months: string[];
  default: string | null;
  discoms: string[];
}

export const useBookletPeriods = () =>
  useQuery<BookletPeriods>({
    queryKey: ['booklet', 'periods'],
    queryFn: async () => (await apiClient.get('/booklet/periods')).data,
    staleTime: 5 * 60 * 1000,
  });

/**
 * Pre-flight reconciliation. Runs with include_detail=false so it stays fast
 * (it skips the thousands of feeder rows) — enough to catch a bad month before
 * anyone waits on a full render.
 */
export const useBookletValidation = (month: string, discom: string, enabled = true) =>
  useQuery<BookletValidation>({
    queryKey: ['booklet', 'validate', month, discom],
    queryFn: async () =>
      (await apiClient.get('/booklet/validate', { params: { month, discom } })).data,
    enabled: enabled && Boolean(month),
  });

/**
 * Download the .docx. Uses a blob response so the JWT interceptor still applies
 * — a plain window.open() would drop the Authorization header and 401.
 */
export async function downloadBooklet(opts: {
  month?: string;
  discom?: string;
  includeDetail?: boolean;
  allocate?: boolean;
}): Promise<{ filename: string; reconciliation: string }> {
  const res = await apiClient.get('/booklet/generate', {
    params: {
      month: opts.month || undefined,
      discom: opts.discom || 'NBPDCL',
      include_detail: opts.includeDetail ?? true,
      allocate: opts.allocate ?? false,
    },
    responseType: 'blob',
    // A full booklet with feeder detail can take well over the client default.
    timeout: 180000,
  });

  const disposition = String(res.headers['content-disposition'] || '');
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : 'Energy_Accounting_Booklet.docx';

  const url = URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return {
    filename,
    reconciliation: String(res.headers['x-booklet-reconciliation'] || 'pass'),
  };
}
