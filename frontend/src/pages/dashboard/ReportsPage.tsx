import { useEffect, useMemo, useState } from 'react';
import { FileBarChart, Download, Loader2, BookOpen, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react';
import Header from '@/components/layout/Header';
import { apiClient } from '@/api/client';
import { downloadCsv } from '@/utils/csvExport';
import { useBookletPeriods, useBookletValidation, downloadBooklet } from '@/api/bookletApi';
import {
  useReportYears, fyLabel, monthsForQuarter, periodParams, periodSuffix,
  MONTH_NAMES, EMPTY_PERIOD, type ReportPeriod,
} from '@/api/reportsApi';

/**
 * `shape` distinguishes the two response contracts these endpoints return:
 *
 *   'table'   — the five paginated `/table` endpoints: a flat row list behind
 *               { rows, total }, driven by page/page_size. Filtered by the
 *               shared period control.
 *
 *   'balance' — the losses dashboard's `/transmission/balance-table`: a single
 *               banded A/B/C/D audit table, { rows:[{band,sl,particulars,
 *               formula,mu,pct,...}] }. No pagination, and it resolves to exactly
 *               ONE month, so it ignores year/quarter and takes only `month`
 *               (mirroring the Transmission dashboard's own behaviour — see the
 *               note in handleExport). Reused as-is from the existing endpoint;
 *               no backend change.
 */
const REPORT_TYPES = [
  { key: 'purchase', endpoint: '/purchase/table', name: 'Power Purchase Summary', desc: 'Monthly plant-wise energy purchase report', shape: 'table' as const },
  { key: 'deviation', endpoint: '/deviation/table', name: 'Bihar UI Deviation Report', desc: 'Daily drawal vs schedule deviation analysis', shape: 'table' as const },
  { key: 'input-energy', endpoint: '/input-energy/table', name: 'Input Energy Hierarchy Report', desc: 'Circle > Division > Substation > Feeder breakdown', shape: 'table' as const },
  { key: 'railway', endpoint: '/railway/table', name: 'Railway Power Report', desc: 'Railway traction load metrics', shape: 'table' as const },
  { key: 'prosumer', endpoint: '/prosumer/table', name: 'Prosumer Sales Report', desc: 'Plant-wise prosumer energy sales', shape: 'table' as const },
  { key: 'balance-table', endpoint: '/transmission/balance-table', name: 'Energy Balance Table (Losses)', desc: 'Banded A/B/C/D boundary-to-DISCOM balance with CTL & STL', shape: 'balance' as const },
];

const bookletMonthLabel = (ym: string) =>
  (!ym || ym.length < 7) ? ym : `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

const selectCls =
  'mt-1 w-full rounded-lg border border-border bg-bgapp px-3 py-2 text-sm text-textprimary disabled:opacity-50';

/* --------------------------------------------------------- period filter */

function PeriodFilter({
  period, onChange, years, loading,
}: {
  period: ReportPeriod;
  onChange: (p: ReportPeriod) => void;
  years: string[];
  loading: boolean;
}) {
  const months = useMemo(() => monthsForQuarter(period.quarter), [period.quarter]);

  // Changing the quarter can strand a month that no longer belongs to it
  // (Q1 + January is not a real period). Clear it rather than silently sending
  // a contradictory pair the backend would resolve to zero rows.
  const handleQuarter = (quarter: string) => {
    const stillValid = !quarter || monthsForQuarter(quarter).includes(period.month);
    onChange({ ...period, quarter, month: stillValid ? period.month : '' });
  };

  const active = Boolean(period.year || period.quarter || period.month);

  return (
    <div className="card p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold text-textsecondary uppercase tracking-wide">
          Period filter — applies to every CSV export below
        </div>
        {active && (
          <button
            onClick={() => onChange(EMPTY_PERIOD)}
            className="inline-flex items-center gap-1.5 text-xs text-textsecondary hover:text-textprimary"
          >
            <RotateCcw size={12} /> Reset
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-xs text-textsecondary">
          Financial year
          <select
            value={period.year}
            onChange={(e) => onChange({ ...period, year: e.target.value })}
            disabled={loading}
            className={selectCls}
          >
            <option value="">All years</option>
            {years.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
          </select>
        </label>

        <label className="text-xs text-textsecondary">
          Quarter
          <select value={period.quarter} onChange={(e) => handleQuarter(e.target.value)} className={selectCls}>
            <option value="">All quarters</option>
            <option value="Q1">Q1 — Apr, May, Jun</option>
            <option value="Q2">Q2 — Jul, Aug, Sep</option>
            <option value="Q3">Q3 — Oct, Nov, Dec</option>
            <option value="Q4">Q4 — Jan, Feb, Mar</option>
          </select>
        </label>

        <label className="text-xs text-textsecondary">
          Month
          <select
            value={period.month}
            onChange={(e) => onChange({ ...period, month: e.target.value })}
            className={selectCls}
          >
            <option value="">All months</option>
            {months.map((m) => <option key={m} value={m}>{MONTH_NAMES[Number(m) - 1]}</option>)}
          </select>
        </label>
      </div>

      <p className="text-[11px] text-textsecondary mt-3">
        Financial year runs April–March, so {period.year ? fyLabel(period.year) : 'FY 2026-27'} covers
        Apr {period.year || '2026'} – Mar {period.year ? Number(period.year) + 1 : '2027'}. Q4 (Jan–Mar)
        falls in the following calendar year.
        {!period.year && (period.quarter || period.month) && (
          <span className="text-amber-600">
            {' '}Without a year selected, this matches that period across every year in the sheet.
          </span>
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ booklet */

function BookletPanel() {
  const { data: periods, isLoading: periodsLoading } = useBookletPeriods();
  const [month, setMonth] = useState('');
  const [discom, setDiscom] = useState('NBPDCL');
  // Default OFF. The summary booklet renders quickly even on a constrained host
  // (e.g. a 0.1-CPU free tier); the full feeder-level Section 9 is thousands of
  // rows and is slow there. Users who want the full detail tick the box
  // deliberately and accept the wait — the common case shouldn't pay for it.
  const [includeDetail, setIncludeDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!month && periods?.default) setMonth(periods.default);
  }, [periods, month]);

  const { data: validation, isFetching: validating } = useBookletValidation(month, discom, Boolean(month));
  const failedChecks = (validation?.checks || []).filter((c) => c.status !== 'PASS');

  const handleGenerate = async () => {
    setBusy(true);
    setResult(null);
    try {
      const { filename, reconciliation } = await downloadBooklet({ month, discom, includeDetail });
      setResult({
        ok: reconciliation === 'pass',
        msg: reconciliation === 'pass'
          ? `${filename} downloaded — all reconciliation checks passed.`
          : `${filename} downloaded, but one or more reconciliation checks need review.`,
      });
    } catch {
      setResult({ ok: false, msg: 'Booklet generation failed. Check that the backend is reachable and the month has data.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <BookOpen size={18} />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm text-textprimary">Energy Accounting Booklet</div>
          <div className="text-xs text-textsecondary">
            The full monthly Word booklet, computed live from the source sheets. This is a
            single-month document, so it keeps its own month picker — the period filter below
            applies only to the CSV exports.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <label className="text-xs text-textsecondary">
          Billing month
          <select value={month} onChange={(e) => setMonth(e.target.value)} disabled={periodsLoading} className={selectCls}>
            {(periods?.months || []).map((m) => (
              <option key={m} value={m}>{bookletMonthLabel(m)}</option>
            ))}
          </select>
        </label>

        <label className="text-xs text-textsecondary">
          Circle / division detail for
          <select value={discom} onChange={(e) => setDiscom(e.target.value)} className={selectCls}>
            {(periods?.discoms || ['NBPDCL', 'SBPDCL']).filter((d) => d !== 'BSPHCL').map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>

        <label className="flex items-end gap-2 text-xs text-textsecondary pb-2">
          <input type="checkbox" checked={includeDetail} onChange={(e) => setIncludeDetail(e.target.checked)} className="accent-primary" />
          Include feeder-level Section 9
        </label>
      </div>

      {month && (
        <div className="rounded-lg border border-border bg-bgapp p-3 mb-4">
          <div className="text-xs font-semibold text-textprimary mb-2 flex items-center gap-2">
            {validating ? (
              <><Loader2 size={13} className="animate-spin" /> Reconciling {bookletMonthLabel(month)}…</>
            ) : validation?.ok ? (
              <><CheckCircle2 size={13} className="text-emerald-500" /> All reconciliation checks passed for {validation.period_label}</>
            ) : (
              <><AlertTriangle size={13} className="text-amber-500" /> {failedChecks.length} check(s) need review</>
            )}
          </div>
          {!validating && failedChecks.length > 0 && (
            <ul className="text-[11px] text-textsecondary space-y-1">
              {failedChecks.map((c) => (
                <li key={c.check}>
                  <span className="font-medium">{c.check}</span> — computed {c.computed.toLocaleString()} vs
                  expected {c.expected.toLocaleString()} (Δ {c.difference.toLocaleString()})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleGenerate}
          disabled={busy || !month}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          {busy ? 'Building booklet…' : 'Generate booklet (.docx)'}
        </button>
        {includeDetail && (
          <span className="text-[11px] text-textsecondary">
            Feeder detail can take up to a couple of minutes on a cold cache.
          </span>
        )}
      </div>

      {result && (
        <p className={`text-xs mt-3 ${result.ok ? 'text-emerald-600' : 'text-amber-600'}`}>{result.msg}</p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- page */

export default function ReportsPage() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [period, setPeriod] = useState<ReportPeriod>(EMPTY_PERIOD);
  const { data: years = [], isLoading: yearsLoading } = useReportYears();

  const handleExport = async (report: typeof REPORT_TYPES[number]) => {
    setDownloading(report.key);
    try {
      if (report.shape === 'balance') {
        // The balance table is a single banded snapshot, not a paginated list.
        // It resolves to one month: the backend's _month_filter takes year+MM,
        // so year and month are passed but quarter is meaningless here and is
        // dropped. With no month selected it falls back to the latest month —
        // the same default the Transmission dashboard shows — which is the right
        // behaviour for a losses snapshot, unlike the booklet where a wrong
        // month had to fail loudly.
        const res = await apiClient.get(report.endpoint, {
          params: {
            ...(period.year ? { year: period.year } : {}),
            ...(period.month ? { month: period.month } : {}),
          },
        });
        // Flatten to CSV-friendly columns; keep the sign convention and the RN
        // references from the dashboard so the export reconciles line-for-line
        // against it.
        const rows = (res.data?.rows || []).map((r: {
          band: string; sl: number; particulars: string; formula: string; mu: number; pct: number;
        }) => ({
          Band: r.band,
          'R#': r.sl || '',
          Particulars: r.particulars,
          Formula: r.formula || '',
          MU: r.mu,
          '% of Boundary': r.pct,
        }));
        const suffix = period.month
          ? `${period.year || 'FY'}_${MONTH_NAMES[Number(period.month) - 1]}`
          : (res.data?.period || 'latest');
        downloadCsv(`energy_balance_table_${suffix}.csv`, rows);
        return;
      }

      const res = await apiClient.get(report.endpoint, {
        params: { page: 1, page_size: 5000, ...periodParams(period) },
      });
      const rows = res.data?.rows || [];
      // Input Energy export: append "Sale to Nepal" beneath the NBPDCL feeder
      // rows. The backend sends the period's value as nepal_sale_mu metadata
      // (NBPDCL/BSPHCL only, 0 for SBPDCL); we mirror the feeder row keys so the
      // CSV columns stay aligned, blanking the hierarchy and tagging it as an
      // export line. Only added when there is a value and at least one data row.
      if (report.key === 'input-energy' && rows.length > 0 && Number(res.data?.nepal_sale_mu) > 0) {
        const nepalRow: Record<string, any> = {};
        for (const k of Object.keys(rows[0])) nepalRow[k] = '';
        if ('year_month' in nepalRow) nepalRow.year_month = rows[0].year_month ?? '';
        if ('discom_name' in nepalRow) nepalRow.discom_name = 'NBPDCL';
        if ('feeder_name' in nepalRow) nepalRow.feeder_name = 'Sale to Nepal';
        if ('feeder_type' in nepalRow) nepalRow.feeder_type = 'Export';
        if ('sharing_percentage' in nepalRow) nepalRow.sharing_percentage = 100;
        if ('energy_quantum' in nepalRow) nepalRow.energy_quantum = res.data.nepal_sale_mu;
        rows.push(nepalRow);
      }
      // downloadCsv already alerts on an empty set, which is the right signal
      // that the chosen period has no data for this module.
      downloadCsv(`${report.key}_report_${periodSuffix(period)}.csv`, rows);
    } catch {
      alert('Export failed. Please ensure the backend is reachable and try again.');
    } finally {
      setDownloading(null);
    }
  };

  const filtered = Boolean(period.year || period.quarter || period.month);

  return (
    <div className="flex-1 min-w-0">
      <Header title="Reports" subtitle="Generate the monthly booklet or export live dashboard data" />
      <div className="p-6">
        <BookletPanel />

        <div className="text-xs font-semibold text-textsecondary uppercase tracking-wide mb-3">
          CSV exports
        </div>

        <PeriodFilter period={period} onChange={setPeriod} years={years} loading={yearsLoading} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {REPORT_TYPES.map((r) => (
            <div key={r.key} className="card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <FileBarChart size={18} />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-textprimary truncate">{r.name}</div>
                  <div className="text-xs text-textsecondary truncate">
                    {r.desc}
                    {r.shape === 'balance' && (
                      <span className="text-amber-600"> · single month{period.quarter ? ' (quarter ignored)' : ''}</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleExport(r)}
                disabled={downloading === r.key}
                className="p-2 rounded-lg border border-border hover:bg-bgapp text-textsecondary shrink-0 disabled:opacity-50"
                title={
                  r.shape === 'balance'
                    ? `Download energy balance table — ${period.month ? MONTH_NAMES[Number(period.month) - 1] : 'latest month'}`
                    : filtered ? `Download CSV — ${periodSuffix(period).replace(/_/g, ' ')}` : 'Download CSV'
                }
              >
                {downloading === r.key ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              </button>
            </div>
          ))}
        </div>

        <p className="text-xs text-textsecondary mt-4">
          Each export pulls up to 5,000 live rows directly from the corresponding Google Sheet via the
          backend API{filtered ? ', filtered to the selected period' : ''}. The period is written into
          the filename so downloaded files stay self-describing.
        </p>
      </div>
    </div>
  );
}
