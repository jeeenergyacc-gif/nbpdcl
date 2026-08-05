"""
Bihar UI Deviation Dashboard - Analytics Engine
Computes KPIs, chart-ready datasets, and executive insights
from master_ui_deviation_bihar sheet data.
"""
from collections import defaultdict
from statistics import mean
from typing import Any, Dict, List, Optional

from app.services.sheets_service import get_sheet_data, coerce_float
from app.core.sharing import allocation_factor, scale_rows
from app.core.fy import in_fy, in_fy_quarter, fy_years_from, fy_label
from app.core.config import get_settings

settings = get_settings()


def _apply_filters(rows: List[Dict[str, Any]], filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    result = rows
    if filters.get("year"):
        result = [r for r in result if in_fy(str(r.get("entry_date", "")), filters["year"])]
    if filters.get("month"):
        result = [r for r in result if str(r.get("entry_date", ""))[5:7] == filters["month"].zfill(2)]
    if filters.get("quarter"):
        result = [r for r in result if in_fy_quarter(str(r.get("entry_date", "")), filters["quarter"])]
    if filters.get("range"):
        sorted_dates = sorted({str(r.get("entry_date", "")) for r in result if r.get("entry_date")})
        if sorted_dates:
            last_date = sorted_dates[-1]
            rng = filters["range"]
            if rng == "last7":
                cutoff_idx = max(0, len(sorted_dates) - 7)
                cutoff = sorted_dates[cutoff_idx]
                result = [r for r in result if str(r.get("entry_date", "")) >= cutoff]
            elif rng == "last30":
                cutoff_idx = max(0, len(sorted_dates) - 30)
                cutoff = sorted_dates[cutoff_idx]
                result = [r for r in result if str(r.get("entry_date", "")) >= cutoff]
            elif rng == "currentMonth":
                ym = last_date[:7]
                result = [r for r in result if str(r.get("entry_date", "")).startswith(ym)]
            elif rng == "currentYear":
                yr = last_date[:4]
                result = [r for r in result if str(r.get("entry_date", "")).startswith(yr)]
    return sorted(result, key=lambda r: str(r.get("entry_date", "")))


def _has_measurement(row: Dict[str, Any]) -> bool:
    """True only when the row actually carries a reading.

    The sheet is pre-populated with future dates ahead of reporting: of 565 rows
    on file only 68 hold real readings. The rest are placeholders — some blank,
    some pre-filled with zeros (actual = schedule = deviation = 0). A day on
    which the state drew, scheduled and deviated by exactly zero is not a real
    reported day; those rows carry no information.

    Letting them through made `rows[-1]` an empty placeholder (KPIs read 0 MU),
    stretched the trend and cumulative lines flat to the end of the sheet,
    flooded the histogram's zero-bin, painted the calendar heatmap as one solid
    block, and made "best-performing day" report a 0.00 MU non-day.

    Filtering here fixes every downstream consumer at once. No API shape, field
    name, or formula changes — rows without a reading are simply not treated as
    reported days.
    """
    for key in ("actual_drawal_bihar", "total_schedule_bihar", "deviation_energy"):
        value = row.get(key)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        try:
            if float(value) != 0.0:
                return True
        except (TypeError, ValueError):
            continue
    return False


async def get_raw_data() -> List[Dict[str, Any]]:
    rows = await get_sheet_data(settings.SHEET_UI_DEVIATION)
    return [r for r in rows if _has_measurement(r)]

_ALLOC_FIELDS = ["actual_drawal_bihar", "total_schedule_bihar", "deviation_energy"]


async def _load(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    """Fetch -> allocate (sharing ratio) -> caller aggregates. BSPHCL => holding."""
    rows = _apply_filters(await get_raw_data(), filters)
    factor = await allocation_factor(filters)
    return scale_rows(rows, factor, _ALLOC_FIELDS)


async def get_filter_options() -> Dict[str, List[str]]:
    rows = await get_raw_data()
    years = fy_years_from(str(r.get("entry_date", "")) for r in rows if r.get("entry_date"))
    return {"years": years, "quarters": ["Q1", "Q2", "Q3", "Q4"], "discoms": ["BSPHCL", "NBPDCL", "SBPDCL"]}


async def get_kpis(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    """
    KPIs reflect the SELECTED period. If the user picks a month/quarter/year, the
    cards aggregate that window. If nothing is selected, they default to the
    latest month present in the sheet (not merely the last row), so the dashboard
    always opens on real, current data.
    """
    all_rows = await _load(filters)
    if not all_rows:
        return {"today_actual": 0, "today_schedule": 0, "today_deviation": 0,
                "monthly_avg_deviation": 0, "latest_date": None, "period_label": None,
                "period_actual": 0, "period_schedule": 0, "period_deviation": 0, "reported_days": 0}

    # When no explicit month filter is set, narrow to the latest month available
    # so the default view shows the most recent complete month, not all-time.
    explicit_period = bool(filters.get("month") or filters.get("quarter"))
    rows = all_rows
    if not explicit_period:
        latest_month = max(str(r.get("entry_date", ""))[:7] for r in all_rows if r.get("entry_date"))
        rows = [r for r in all_rows if str(r.get("entry_date", ""))[:7] == latest_month]

    actuals = [coerce_float(r, "actual_drawal_bihar") for r in rows]
    schedules = [coerce_float(r, "total_schedule_bihar") for r in rows]
    deviations = [coerce_float(r, "deviation_energy") for r in rows]

    period_actual = round(sum(actuals), 3)
    period_schedule = round(sum(schedules), 3)
    period_deviation = round(period_actual - period_schedule, 3)

    # period bounds for the label
    dates = sorted(str(r.get("entry_date", ""))[:10] for r in rows if r.get("entry_date"))
    period_label = dates[0] if dates and dates[0] == dates[-1] else (f"{dates[0]} - {dates[-1]}" if dates else None)

    latest = rows[-1]
    return {
        # backward-compatible keys (kept as period totals now, not a single day)
        "today_actual": period_actual,
        "today_schedule": period_schedule,
        "today_deviation": period_deviation,
        "monthly_avg_deviation": round(mean(deviations), 3) if deviations else 0,
        "latest_date": latest.get("entry_date"),
        # new, explicit period fields
        "period_actual": period_actual,
        "period_schedule": period_schedule,
        "period_deviation": period_deviation,
        "period_label": period_label,
        "reported_days": len(rows),
    }


async def get_trend(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    return [
        {
            "entry_date": r.get("entry_date"),
            "actual_drawal_bihar": coerce_float(r, "actual_drawal_bihar"),
            "total_schedule_bihar": coerce_float(r, "total_schedule_bihar"),
            "deviation_energy": coerce_float(r, "deviation_energy"),
        }
        for r in rows
    ]


async def get_cumulative(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    trend = await get_trend(filters)
    result = []
    running = 0.0
    for point in trend:
        running += point["deviation_energy"]
        result.append({"entry_date": point["entry_date"], "cumulative": round(running, 3)})
    return result


async def get_heatmap(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    """Calendar heatmap: rows = ISO week, columns = weekday."""
    trend = await get_trend(filters)
    weeks: List[str] = []
    weekday_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    cell_map: Dict[str, Dict[int, float]] = {}

    for point in trend:
        date_str = point["entry_date"]
        if not date_str:
            continue
        try:
            from datetime import date as _date
            y, m, d = [int(x) for x in date_str[:10].split("-")]
            dt = _date(y, m, d)
        except Exception:
            continue
        iso_year, iso_week, iso_weekday = dt.isocalendar()
        week_key = f"{iso_year}-W{iso_week:02d}"
        if week_key not in cell_map:
            cell_map[week_key] = {}
            weeks.append(week_key)
        cell_map[week_key][iso_weekday] = point["deviation_energy"]

    z = [[cell_map[w].get(wd, None) for wd in range(1, 8)] for w in weeks]
    return {"weeks": weeks, "weekdays": weekday_labels, "z": z}


async def get_distribution(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    trend = await get_trend(filters)
    values = [t["deviation_energy"] for t in trend]
    if not values:
        return {"bins": [], "counts": []}
    lo, hi = min(values), max(values)
    span = hi - lo if hi != lo else 1
    bin_count = 10
    bin_size = span / bin_count
    bins = [round(lo + i * bin_size, 2) for i in range(bin_count + 1)]
    counts = [0] * bin_count
    for v in values:
        idx = min(int((v - lo) / bin_size) if bin_size else 0, bin_count - 1)
        counts[idx] += 1
    labels = [f"{bins[i]} to {bins[i+1]}" for i in range(bin_count)]
    return {"bins": labels, "counts": counts}


async def get_insights(filters: Dict[str, Optional[str]]) -> List[str]:
    trend = await get_trend(filters)
    if not trend:
        return ["No data available for the selected filters."]

    max_pos = max(trend, key=lambda t: t["deviation_energy"])
    max_neg = min(trend, key=lambda t: t["deviation_energy"])
    avg_dev = mean([t["deviation_energy"] for t in trend])
    best_day = min(trend, key=lambda t: abs(t["deviation_energy"]))
    worst_day = max(trend, key=lambda t: abs(t["deviation_energy"]))

    risk = "Low"
    if abs(avg_dev) > 2:
        risk = "Critical"
    elif abs(avg_dev) > 1:
        risk = "Medium"

    insights = [
        f"Maximum positive deviation of {max_pos['deviation_energy']:,.2f} MU occurred on {max_pos['entry_date']}.",
        f"Maximum negative deviation of {max_neg['deviation_energy']:,.2f} MU occurred on {max_neg['entry_date']}.",
        f"Average deviation across the selected period is {avg_dev:,.2f} MU.",
        f"Best-performing day was {best_day['entry_date']} with the smallest deviation of {best_day['deviation_energy']:,.2f} MU.",
        f"Worst-performing day was {worst_day['entry_date']} with a deviation of {worst_day['deviation_energy']:,.2f} MU.",
        f"Overall deviation risk level is assessed as {risk} based on the average deviation magnitude.",
    ]
    return insights


async def get_table_data(filters: Dict[str, Optional[str]], page: int = 1, page_size: int = 50) -> Dict[str, Any]:
    rows = await _load(filters)
    total = len(rows)
    start = (page - 1) * page_size
    end = start + page_size
    return {"rows": rows[start:end], "total": total, "page": page, "page_size": page_size}
