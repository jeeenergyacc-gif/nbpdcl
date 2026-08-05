"""
DISCOM Sharing-Ratio Allocation Engine
======================================

Holding-level (BSPHCL) energy/financial datasets are split between NBPDCL and
SBPDCL using a sharing ratio that is derived LIVE from the `input_energy` sheet
for the SELECTED PERIOD — no separate ratio sheet is maintained.

    NBPDCL ratio = NBPDCL input energy / (NBPDCL + SBPDCL input energy)
    SBPDCL ratio = 1 − NBPDCL ratio

The ratio is computed on the same period the dashboard is showing (FY year /
quarter / month), so April's allocation uses April's actual DISCOM split. All
other sheets are BSPHCL-level (e.g. power purchase is procured at holding level);
selecting NBPDCL/SBPDCL scales them by this period ratio.

Rules:
  * BSPHCL  -> factor 1.0 (holding level, no allocation)
  * NBPDCL  -> nbpdcl_ratio            (percentage rounded to 2 dp, used everywhere)
  * SBPDCL  -> sbpdcl_ratio = 100 − nbpdcl_ratio  (so the two always sum to 100.00
               and NBPDCL_alloc + SBPDCL_alloc == BSPHCL holding exactly)
  * If the period has no NBPDCL/SBPDCL input energy, the ratio is unresolved and
    holding values are returned (no invented number).

Exceptions (handled by callers, not here):
  * Input Energy  -> already DISCOM-level, use actual values.
  * Nepal Sale    -> belongs to NBPDCL entirely (NBPDCL full, SBPDCL zero).
  * Count metrics -> never allocated.
"""
from typing import Any, Dict, List, Optional, Tuple

from app.services.sheets_service import get_sheet_data
from app.core.config import get_settings
from app.core.fy import in_fy, in_fy_quarter

settings = get_settings()

VALID_DISCOMS = ("BSPHCL", "NBPDCL", "SBPDCL")


def _norm(v: Any) -> str:
    return (str(v) if v is not None else "").strip().lower()


def _to_float(v: Any) -> float:
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return 0.0


def _period_of(filters: Dict[str, Optional[str]]) -> Tuple[str, str]:
    """Human (period_type, period_key) for reporting, using FY conventions."""
    year, quarter, month = filters.get("year"), filters.get("quarter"), filters.get("month")
    if month and year:
        return "monthly", f"{year}-{str(month).zfill(2)}"
    if quarter and year:
        return "quarterly", f"{year}-{str(quarter).upper()}"
    if year:
        return "yearly", str(year)
    return "all", "all"


def _in_period(year_month: str, filters: Dict[str, Optional[str]]) -> bool:
    """Match a YYYY-MM(-DD) date against the selected FY period filters."""
    ym = str(year_month or "")
    if filters.get("year") and not in_fy(ym, filters["year"]):
        return False
    if filters.get("month") and ym[5:7] != str(filters["month"]).zfill(2):
        return False
    if filters.get("quarter") and not in_fy_quarter(ym, filters["quarter"]):
        return False
    return True


async def _discom_split(filters: Dict[str, Optional[str]]) -> Tuple[float, float]:
    """Sum NBPDCL and SBPDCL input energy for the selected period."""
    try:
        rows = await get_sheet_data(settings.SHEET_INPUT_ENERGY)
    except Exception:
        return 0.0, 0.0
    nb = sb = 0.0
    for r in rows:
        if not _in_period(r.get("year_month", ""), filters):
            continue
        d = _norm(r.get("discom_name"))
        q = _to_float(r.get("energy_quantum"))
        if d == "nbpdcl":
            nb += q
        elif d == "sbpdcl":
            sb += q
    return nb, sb


async def resolve_ratio(discom: str, filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    """
    Returns:
        { discom, factor, nbpdcl_pct, sbpdcl_pct, period_type, period_key, resolved, holding }
    `factor` multiplies holding values. Percentages are rounded to 2 dp and the
    factor derives from the rounded percentage, so every surface (KPI/chart/
    table/tooltip/export) shows one consistent allocated figure.
    """
    d = (discom or "BSPHCL").upper()
    if d not in VALID_DISCOMS:
        d = "BSPHCL"

    period_type, period_key = _period_of(filters)

    if d == "BSPHCL":
        return {"discom": "BSPHCL", "factor": 1.0, "nbpdcl_pct": None, "sbpdcl_pct": None,
                "period_type": period_type, "period_key": period_key, "resolved": True, "holding": True}

    nb, sb = await _discom_split(filters)
    total = nb + sb
    if total <= 0:
        # No DISCOM split available for this period — report holding, flag it.
        return {"discom": d, "factor": 1.0, "nbpdcl_pct": None, "sbpdcl_pct": None,
                "period_type": period_type, "period_key": period_key, "resolved": False, "holding": True}

    nbpdcl_pct = round(nb / total * 100, 2)
    sbpdcl_pct = round(100.0 - nbpdcl_pct, 2)  # complement → always sums to 100.00
    factor = (nbpdcl_pct if d == "NBPDCL" else sbpdcl_pct) / 100.0

    return {"discom": d, "factor": factor, "nbpdcl_pct": nbpdcl_pct, "sbpdcl_pct": sbpdcl_pct,
            "period_type": period_type, "period_key": period_key, "resolved": True, "holding": False}


async def resolve_split(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    """
    Period DISCOM split as both energy (MU) and percentage — additive helper used
    by the "DISCOM Sharing Percentage" visualisation. Reuses the exact same
    `_discom_split` (input-energy driven) that the ratio engine uses, so the bar
    chart can never disagree with the allocation applied to every other dataset.

    Returns { period_type, period_key, nbpdcl_mu, sbpdcl_mu, total_mu,
              nbpdcl_pct, sbpdcl_pct, resolved }.
    """
    period_type, period_key = _period_of(filters)
    nb, sb = await _discom_split(filters)
    total = nb + sb
    if total <= 0:
        return {"period_type": period_type, "period_key": period_key,
                "nbpdcl_mu": 0.0, "sbpdcl_mu": 0.0, "total_mu": 0.0,
                "nbpdcl_pct": None, "sbpdcl_pct": None, "resolved": False}
    nbpdcl_pct = round(nb / total * 100, 2)
    sbpdcl_pct = round(100.0 - nbpdcl_pct, 2)
    return {"period_type": period_type, "period_key": period_key,
            "nbpdcl_mu": round(nb, 3), "sbpdcl_mu": round(sb, 3), "total_mu": round(total, 3),
            "nbpdcl_pct": nbpdcl_pct, "sbpdcl_pct": sbpdcl_pct, "resolved": True}


async def allocation_factor(filters: Dict[str, Optional[str]]) -> float:
    """Convenience: just the multiplier for the discom in `filters` (default 1.0)."""
    info = await resolve_ratio(filters.get("discom") or "BSPHCL", filters)
    return info["factor"]


def nepal_factor(discom: str) -> float:
    """Nepal Sale belongs to NBPDCL entirely: NBPDCL=1, SBPDCL=0, BSPHCL=1 (holding)."""
    d = (discom or "BSPHCL").upper()
    if d == "SBPDCL":
        return 0.0
    return 1.0


# Numeric energy/financial columns that MAY be allocated. Count-type columns are
# deliberately excluded and listed below so they are never scaled.
_COUNT_HINTS = ("count", "_nos", "num_", "no_of", "meter", "consumer", "feeder_count",
                "plant_count", "generator", "circle_count", "division")


def _is_count_field(name: str) -> bool:
    n = _norm(name)
    return any(h in n for h in _COUNT_HINTS)


def scale_rows(rows: List[Dict[str, Any]], factor: float, energy_fields: List[str]) -> List[Dict[str, Any]]:
    """
    Apply the allocation factor to the given energy/financial fields at the RAW
    row level (spec: fetch -> allocate -> aggregate -> render). Count fields are
    never scaled. factor == 1.0 is a no-op fast path (BSPHCL / unresolved).
    """
    if factor == 1.0:
        return rows
    out = []
    for r in rows:
        nr = dict(r)
        for f in energy_fields:
            if f in nr and not _is_count_field(f):
                nr[f] = _to_float(nr[f]) * factor
        out.append(nr)
    return out
