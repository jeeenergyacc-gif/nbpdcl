"""
Railway Power Dashboard - Analytics Engine
railway_power sheet is in LONG format: metric_id, reporting_month, metric_name, energy_quantum.
Requires pivoting by metric_name.
"""
from collections import defaultdict
from typing import Any, Dict, List, Optional

from app.services.sheets_service import get_sheet_data, coerce_float
from app.core.sharing import allocation_factor, scale_rows
from app.core.fy import in_fy, in_fy_quarter, fy_years_from, fy_label
from app.core.config import get_settings

settings = get_settings()

METRIC_SCHEDULE_BIHAR = "railway_schedule_bihar_boundary"
METRIC_SCHEDULE_BSPTCL = "railway_schedule_bsptcl"
METRIC_DRAWAL = "railway_drawal"
# The sheet spells this metric "railway_overdrawal"; the original constant read
# "railway_overdraw", so it never matched a single row and every overdrawal
# figure (KPI, gauge, waterfall, insights) reported 0.00 MU. Both spellings are
# now accepted so the metric resolves whichever form the sheet uses. Response
# keys and field names are unchanged.
METRIC_OVERDRAW = "railway_overdraw"
METRIC_OVERDRAW_ALIASES = ("railway_overdraw", "railway_overdrawal")


def _norm(name: str) -> str:
    return (name or "").strip().lower().replace(" ", "_")


def _apply_filters(rows: List[Dict[str, Any]], filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    result = rows
    if filters.get("year"):
        result = [r for r in result if in_fy(str(r.get("reporting_month", "")), filters["year"])]
    if filters.get("month"):
        result = [r for r in result if str(r.get("reporting_month", ""))[5:7] == filters["month"].zfill(2)]
    if filters.get("quarter"):
        result = [r for r in result if in_fy_quarter(str(r.get("reporting_month", "")), filters["quarter"])]
    if filters.get("metric"):
        result = [r for r in result if _norm(r.get("metric_name")) == _norm(filters["metric"])]
    return result


async def get_raw_data() -> List[Dict[str, Any]]:
    return await get_sheet_data(settings.SHEET_RAILWAY_POWER)


_ALLOC_FIELDS = ["energy_quantum"]


async def _load(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    """Fetch -> allocate -> aggregate. Railway overdrawal is an allocatable dataset."""
    rows = _apply_filters(await get_raw_data(), filters)
    factor = await allocation_factor(filters)
    return scale_rows(rows, factor, _ALLOC_FIELDS)


async def get_filter_options() -> Dict[str, List[str]]:
    rows = await get_raw_data()
    years = fy_years_from(str(r.get("reporting_month", "")) for r in rows if r.get("reporting_month"))
    metrics = sorted({r.get("metric_name") for r in rows if r.get("metric_name")})
    return {"years": years, "quarters": ["Q1", "Q2", "Q3", "Q4"],
        "discoms": ["BSPHCL", "NBPDCL", "SBPDCL"], "metrics": metrics}


def _sum_metric(rows: List[Dict[str, Any]], metric: str) -> float:
    # Overdrawal is matched against its known spellings (see METRIC_OVERDRAW above).
    targets = METRIC_OVERDRAW_ALIASES if metric in METRIC_OVERDRAW_ALIASES else (metric,)
    return sum(coerce_float(r, "energy_quantum") for r in rows if _norm(r.get("metric_name")) in targets)


async def get_kpis(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    rows = await _load(filters)
    if not rows:
        return {k: 0 for k in ["schedule_bihar_boundary", "schedule_bsptcl", "railway_drawal", "railway_overdraw", "total_energy", "monthly_average"]}

    total = sum(coerce_float(r, "energy_quantum") for r in rows)
    months = {str(r.get("reporting_month", ""))[:7] for r in rows if r.get("reporting_month")}

    return {
        "schedule_bihar_boundary": round(_sum_metric(rows, METRIC_SCHEDULE_BIHAR), 3),
        "schedule_bsptcl": round(_sum_metric(rows, METRIC_SCHEDULE_BSPTCL), 3),
        "railway_drawal": round(_sum_metric(rows, METRIC_DRAWAL), 3),
        "railway_overdraw": round(_sum_metric(rows, METRIC_OVERDRAW), 3),
        "total_energy": round(total, 3),
        "monthly_average": round(total / len(months), 3) if months else round(total, 3),
    }


async def get_schedule_trend(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    months = sorted({str(r.get("reporting_month", ""))[:7] for r in rows if r.get("reporting_month")})
    bihar_by_month = defaultdict(float)
    bsptcl_by_month = defaultdict(float)
    for r in rows:
        m = str(r.get("reporting_month", ""))[:7]
        if _norm(r.get("metric_name")) == METRIC_SCHEDULE_BIHAR:
            bihar_by_month[m] += coerce_float(r, "energy_quantum")
        elif _norm(r.get("metric_name")) == METRIC_SCHEDULE_BSPTCL:
            bsptcl_by_month[m] += coerce_float(r, "energy_quantum")
    return [
        {"month": m, "bihar_boundary": round(bihar_by_month.get(m, 0), 3), "bsptcl": round(bsptcl_by_month.get(m, 0), 3)}
        for m in months
    ]


async def get_schedule_vs_drawal(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    months = sorted({str(r.get("reporting_month", ""))[:7] for r in rows if r.get("reporting_month")})
    schedule_by_month = defaultdict(float)
    drawal_by_month = defaultdict(float)
    for r in rows:
        m = str(r.get("reporting_month", ""))[:7]
        if _norm(r.get("metric_name")) == METRIC_SCHEDULE_BIHAR:
            schedule_by_month[m] += coerce_float(r, "energy_quantum")
        elif _norm(r.get("metric_name")) == METRIC_DRAWAL:
            drawal_by_month[m] += coerce_float(r, "energy_quantum")
    return [
        {"month": m, "schedule": round(schedule_by_month.get(m, 0), 3), "drawal": round(drawal_by_month.get(m, 0), 3)}
        for m in months
    ]


async def get_overdrawal_analysis(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    agg = defaultdict(float)
    for r in rows:
        if _norm(r.get("metric_name")) in METRIC_OVERDRAW_ALIASES:
            m = str(r.get("reporting_month", ""))[:7]
            agg[m] += coerce_float(r, "energy_quantum")
    return [{"month": k, "overdrawal": round(v, 3)} for k, v in sorted(agg.items())]


async def get_monthly_comparison(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    agg: Dict[tuple, float] = defaultdict(float)
    for r in rows:
        m = str(r.get("reporting_month", ""))[:7]
        metric = r.get("metric_name") or "Unknown"
        agg[(m, metric)] += coerce_float(r, "energy_quantum")
    months = sorted({m for m, _ in agg})
    metrics = sorted({metric for _, metric in agg})
    return [{"month": m, **{metric: round(agg.get((m, metric), 0), 3) for metric in metrics}} for m in months]


async def get_energy_distribution(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    labels = {
        METRIC_SCHEDULE_BIHAR: "Schedule (Bihar Boundary)",
        METRIC_DRAWAL: "Drawal",
        METRIC_OVERDRAW: "Overdrawal",
    }
    result = []
    for metric_key, label in labels.items():
        total = _sum_metric(rows, metric_key)
        result.append({"label": label, "value": round(abs(total), 3)})
    return result


async def get_gauge(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    rows = await _load(filters)
    drawal = _sum_metric(rows, METRIC_DRAWAL)
    schedule = _sum_metric(rows, METRIC_SCHEDULE_BIHAR)
    pct = round((drawal / schedule) * 100, 2) if schedule else 0
    return {"drawal_vs_schedule_pct": pct}


async def get_waterfall(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    months = sorted({str(r.get("reporting_month", ""))[:7] for r in rows if r.get("reporting_month")})
    totals = []
    for m in months:
        month_rows = [r for r in rows if str(r.get("reporting_month", ""))[:7] == m]
        totals.append({"month": m, "value": round(sum(coerce_float(r, "energy_quantum") for r in month_rows), 3)})
    result, prev = [], None
    for t in totals:
        delta = t["value"] if prev is None else round(t["value"] - prev, 3)
        result.append({"month": t["month"], "value": t["value"], "delta": delta})
        prev = t["value"]
    return result


async def get_sankey(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    rows = await _load(filters)
    schedule = _sum_metric(rows, METRIC_SCHEDULE_BIHAR)
    drawal = _sum_metric(rows, METRIC_DRAWAL)
    overdraw = abs(_sum_metric(rows, METRIC_OVERDRAW))

    nodes = ["Schedule (Bihar Boundary)", "Railway Drawal", "Overdrawal"]
    links = [
        {"source": 0, "target": 1, "value": round(min(schedule, drawal), 3)},
        {"source": 1, "target": 2, "value": round(overdraw, 3)},
    ]
    return {"nodes": nodes, "links": [l for l in links if l["value"] > 0]}


async def get_insights(filters: Dict[str, Optional[str]]) -> List[str]:
    kpis = await get_kpis(filters)
    overdrawal = await get_overdrawal_analysis(filters)

    insights = [
        f"Total railway energy handled is {kpis['total_energy']:,.2f} MU with a monthly average of {kpis['monthly_average']:,.2f} MU.",
        f"Railway schedule at the Bihar boundary stands at {kpis['schedule_bihar_boundary']:,.2f} MU versus {kpis['schedule_bsptcl']:,.2f} MU at BSPTCL.",
        f"Actual railway drawal recorded is {kpis['railway_drawal']:,.2f} MU.",
    ]
    if overdrawal:
        worst = max(overdrawal, key=lambda o: abs(o["overdrawal"]))
        insights.append(f"Peak overdrawal of {worst['overdrawal']:,.2f} MU was recorded in {worst['month']}.")
    insights.append(f"Cumulative railway overdrawal across the selected period is {kpis['railway_overdraw']:,.2f} MU.")
    return insights


async def get_table_data(filters: Dict[str, Optional[str]], page: int = 1, page_size: int = 50) -> Dict[str, Any]:
    rows = await _load(filters)
    total = len(rows)
    start = (page - 1) * page_size
    return {"rows": rows[start:start + page_size], "total": total, "page": page, "page_size": page_size}
