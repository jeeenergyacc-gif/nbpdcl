"""
Financial-year helpers (Indian FY: April -> March).

BSPHCL/NBPDCL accounting runs on the financial year, so when a user picks
"FY 2026-27" the dashboards must return April-2026 through March-2027 — NOT the
Jan-Dec calendar year. Every analytics service filters through these helpers so
the behaviour is identical everywhere.

The `year` filter value is the FY START year as a string, e.g. "2026" == FY
2026-27. Quarters are financial quarters:
    Q1 = Apr, May, Jun
    Q2 = Jul, Aug, Sep
    Q3 = Oct, Nov, Dec
    Q4 = Jan, Feb, Mar   (falls in the NEXT calendar year)
"""
from typing import Optional

# Financial quarter -> calendar month numbers (as zero-padded strings)
FY_QUARTERS = {
    "Q1": {"04", "05", "06"},
    "Q2": {"07", "08", "09"},
    "Q3": {"10", "11", "12"},
    "Q4": {"01", "02", "03"},
}


def fy_start_year(year_month: str) -> Optional[str]:
    """Return the FY start year for a YYYY-MM(-DD) string. Apr-Dec -> same year;
    Jan-Mar -> previous year. e.g. '2026-05' -> '2026', '2027-02' -> '2026'."""
    ym = str(year_month or "")
    if len(ym) < 7:
        return None
    try:
        y = int(ym[:4])
        m = int(ym[5:7])
    except ValueError:
        return None
    return str(y if m >= 4 else y - 1)


def in_fy(year_month: str, fy_year: str) -> bool:
    """True if the date falls inside financial year `fy_year` (Apr fy_year -> Mar fy_year+1)."""
    return fy_start_year(year_month) == str(fy_year)


def in_fy_quarter(year_month: str, quarter: str) -> bool:
    """True if the date's calendar month is in the given financial quarter."""
    ym = str(year_month or "")
    if len(ym) < 7:
        return False
    return ym[5:7] in FY_QUARTERS.get(str(quarter).upper(), set())


def fy_label(fy_year: str) -> str:
    """'2026' -> 'FY 2026-27'."""
    try:
        y = int(fy_year)
    except (ValueError, TypeError):
        return str(fy_year)
    return f"FY {y}-{str((y + 1) % 100).zfill(2)}"


def fy_years_from(dates) -> list:
    """Distinct FY start-years present in an iterable of YYYY-MM(-DD) strings, sorted."""
    out = set()
    for d in dates:
        fy = fy_start_year(d)
        if fy:
            out.add(fy)
    return sorted(out)
