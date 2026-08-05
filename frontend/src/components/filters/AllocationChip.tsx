import { useSharingRatio, formatPct } from '@/api/sharingApi';

/**
 * DISCOM allocation status chip — shared by every allocatable dashboard so the
 * wording and the dynamic sharing percentage stay identical everywhere.
 *
 *   BSPHCL           -> "BSPHCL · Showing combined values (100%)"
 *   NBPDCL / SBPDCL  -> "<discom> · Allocated using selected sharing ratio (XX%)"
 *
 * The percentage is read live from the resolved sharing ratio for the SELECTED
 * period. Pages that already resolve the pct themselves (e.g. the Transmission
 * dashboard, whose balance table allocates on the month-wise R18/R19 split) pass
 * `pctOverride` so the chip and the on-page table read ONE single source and can
 * never disagree; otherwise the chip fetches the ratio itself. Display only — no
 * calculation, API or filter is touched here.
 */
interface AllocationChipProps {
  discom?: string;
  year?: string;
  quarter?: string;
  month?: string;
  /** Already-resolved sharing % for the selected DISCOM (skips the fetch). */
  pctOverride?: number | null;
}

export default function AllocationChip({ discom, year, quarter, month, pctOverride }: AllocationChipProps) {
  const d = (discom || 'BSPHCL').toUpperCase();
  const holding = d === 'BSPHCL';
  const hasOverride = pctOverride !== undefined && pctOverride !== null;

  const { data: ratio } = useSharingRatio({ discom: d, year, quarter, month }, { enabled: !hasOverride });

  // Prefer the caller-supplied pct; else the value fetched for this DISCOM.
  const pctValue = hasOverride
    ? pctOverride
    : d === 'NBPDCL' ? ratio?.nbpdcl_pct : d === 'SBPDCL' ? ratio?.sbpdcl_pct : 100;
  const pct = formatPct(pctValue);

  if (holding) {
    return (
      <div className="flex items-center gap-2 -mt-1">
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(37,99,235,0.10)', color: '#1D4ED8' }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#1D4ED8' }} />
          BSPHCL · Showing combined values (100%)
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 -mt-1">
      <span
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
        style={{ background: 'rgba(245,158,11,0.12)', color: '#B45309' }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#F59E0B' }} />
        {d} · Allocated using selected sharing ratio{pct ? ` (${pct})` : ''}
      </span>
    </div>
  );
}
