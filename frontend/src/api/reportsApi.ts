import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';

/**
 * Shared period filter for the Reports page.
 *
 * FY SEMANTICS — these match app/core/fy.py and are NOT calendar semantics:
 *   `year`    is the FY START year. "2026" means FY 2026-27 (Apr 2026 - Mar 2027).
 *   `quarter` is a FINANCIAL quarter: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar.
 *   `month`   is a plain calendar month number, "01".."12".
 *
 * Q4 therefore falls in the NEXT calendar year, which is why "January" under
 * FY 2026-27 resolves to Jan 2027. The backend already handles this: `in_fy`
 * restricts rows to the financial year first, then the month filter picks within
 * it, so year+month can never resolve to the wrong calendar year.
 */

export interface ReportPeriod {
  year: string;
  quarter: string;
  month: string;
}

export const EMPTY_PERIOD: ReportPeriod = { year: '', quarter: '', month: '' };

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** Financial quarter -> calendar month numbers, mirroring FY_QUARTERS in fy.py. */
export const FY_QUARTERS: Record<string, string[]> = {
  Q1: ['04', '05', '06'],
  Q2: ['07', '08', '09'],
  Q3: ['10', '11', '12'],
  Q4: ['01', '02', '03'],
};

/** "2026" -> "FY 2026-27" */
export const fyLabel = (y: string) => {
  const n = Number(y);
  return Number.isFinite(n) ? `FY ${n}-${String((n + 1) % 100).padStart(2, '0')}` : y;
};

/** Months selectable for the chosen quarter, in financial-year order (Apr first). */
export const monthsForQuarter = (quarter: string): string[] => {
  if (quarter && FY_QUARTERS[quarter]) return FY_QUARTERS[quarter];
  return ['04', '05', '06', '07', '08', '09', '10', '11', '12', '01', '02', '03'];
};

/** Short suffix for export filenames, e.g. "FY2026-27_Q3_November". */
export const periodSuffix = (p: ReportPeriod): string => {
  const parts: string[] = [];
  if (p.year) parts.push(`FY${p.year}-${String((Number(p.year) + 1) % 100).padStart(2, '0')}`);
  if (p.quarter) parts.push(p.quarter);
  if (p.month) parts.push(MONTH_NAMES[Number(p.month) - 1]);
  return parts.length ? parts.join('_') : 'all_periods';
};

/** Only send params that are actually set, so an unfiltered export behaves exactly
 *  as it did before this filter existed. */
export const periodParams = (p: ReportPeriod): Record<string, string> => {
  const out: Record<string, string> = {};
  if (p.year) out.year = p.year;
  if (p.quarter) out.quarter = p.quarter;
  if (p.month) out.month = p.month;
  return out;
};

const FILTER_ENDPOINTS = [
  '/purchase/filters',
  '/deviation/filters',
  '/input-energy/filters',
  '/railway/filters',
  '/prosumer/filters',
];

/**
 * Union of the financial years present across every module.
 *
 * A union rather than one module's list: the sheets are not filled in lockstep,
 * so purchase may already have a year that input_energy does not. Offering the
 * union means a year is never hidden; an export that has no rows for it simply
 * comes back empty, which is the honest outcome.
 *
 * Five requests, but they are cached for the session and each one is a small
 * response the dashboards already fetch anyway.
 */
export const useReportYears = () =>
  useQuery<string[]>({
    queryKey: ['reports', 'years'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const results = await Promise.allSettled(
        FILTER_ENDPOINTS.map((url) => apiClient.get(url))
      );
      const years = new Set<string>();
      results.forEach((r) => {
        if (r.status === 'fulfilled') {
          (r.value.data?.years || []).forEach((y: string) => years.add(String(y)));
        }
      });
      return Array.from(years).sort().reverse();
    },
  });
