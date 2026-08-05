"""
Prosumer Sales Dashboard - Analytics Engine
Computes KPIs, chart-ready datasets, and executive insights
from the prosumer_energy_sales sheet.
"""
from collections import defaultdict
from typing import Any, Dict, List, Optional

from app.services.sheets_service import get_sheet_data, coerce_float
from app.core.sharing import allocation_factor, scale_rows
from app.core.fy import in_fy, in_fy_quarter, fy_years_from, fy_label
from app.core.config import get_settings

settings = get_settings()


def _apply_filters(rows: List[Dict[str, Any]], filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    result = rows
    if filters.get("year"):
        result = [r for r in result if in_fy(str(r.get("year_month", "")), filters["year"])]
    if filters.get("month"):
        result = [r for r in result if str(r.get("year_month", ""))[5:7] == filters["month"].zfill(2)]
    if filters.get("quarter"):
        result = [r for r in result if in_fy_quarter(str(r.get("year_month", "")), filters["quarter"])]
    for key in ("plant_type", "voltage_level", "ppa_type", "plant_name"):
        if filters.get(key):
            result = [r for r in result if (r.get(key) or "").lower() == filters[key].lower()]
    if filters.get("search"):
        term = filters["search"].lower()
        result = [r for r in result if term in (r.get("plant_name") or "").lower()]
    if filters.get("min_sales"):
        try:
            min_v = float(filters["min_sales"])
            result = [r for r in result if coerce_float(r, "sales_unit") >= min_v]
        except ValueError:
            pass
    if filters.get("max_sales"):
        try:
            max_v = float(filters["max_sales"])
            result = [r for r in result if coerce_float(r, "sales_unit") <= max_v]
        except ValueError:
            pass
    return result


async def get_raw_data() -> List[Dict[str, Any]]:
    return await get_sheet_data(settings.SHEET_PROSUMER_SALES)


_ALLOC_FIELDS = ["sales_unit"]


async def _load(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    """Fetch -> allocate -> aggregate. Prosumer export/sale is allocatable."""
    rows = _apply_filters(await get_raw_data(), filters)
    factor = await allocation_factor(filters)
    return scale_rows(rows, factor, _ALLOC_FIELDS)


async def get_filter_options() -> Dict[str, List[str]]:
    rows = await get_raw_data()

    def uniq(key: str) -> List[str]:
        return sorted({str(r.get(key)) for r in rows if r.get(key) not in (None, "")})

    years = fy_years_from(str(r.get("year_month", "")) for r in rows if r.get("year_month"))
    sales_values = [coerce_float(r, "sales_unit") for r in rows]
    return {
        "years": years, "quarters": ["Q1", "Q2", "Q3", "Q4"],
        "discoms": ["BSPHCL", "NBPDCL", "SBPDCL"],
        "plant_types": uniq("plant_type"), "voltage_levels": uniq("voltage_level"),
        "ppa_types": uniq("ppa_type"), "plant_names": uniq("plant_name"),
        "min_sales": round(min(sales_values), 3) if sales_values else 0,
        "max_sales": round(max(sales_values), 3) if sales_values else 0,
    }


async def get_kpis(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    rows = await _load(filters)
    if not rows:
        return {"total_sales": 0, "active_plants": 0, "total_plants": 0, "zero_sales_plants": 0, "zero_sales_pct": 0, "average_sales_per_plant": 0}

    total = sum(coerce_float(r, "sales_unit") for r in rows)
    plants = {r.get("plant_name") for r in rows if r.get("plant_name")}

    plant_totals: Dict[str, float] = defaultdict(float)
    for r in rows:
        plant_totals[r.get("plant_name") or "Unknown"] += coerce_float(r, "sales_unit")

    active_plants = sum(1 for v in plant_totals.values() if v > 0)
    zero_plants = sum(1 for v in plant_totals.values() if v == 0)

    return {
        "total_sales": round(total, 3),
        "active_plants": active_plants,
        "total_plants": len(plants),
        "zero_sales_plants": zero_plants,
        "zero_sales_pct": round((zero_plants / len(plants)) * 100, 2) if plants else 0,
        "average_sales_per_plant": round(total / len(plants), 3) if plants else 0,
    }


async def get_monthly_trend(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    agg: Dict[str, float] = defaultdict(float)
    for r in rows:
        ym = str(r.get("year_month", ""))[:7]
        if ym:
            agg[ym] += coerce_float(r, "sales_unit")
    return [{"year_month": k, "sales_unit": round(v, 3)} for k, v in sorted(agg.items())]


async def get_plant_type_contribution(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    agg: Dict[str, float] = defaultdict(float)
    for r in rows:
        agg[r.get("plant_type") or "Unknown"] += coerce_float(r, "sales_unit")
    return [{"plant_type": k, "sales_unit": round(v, 3)} for k, v in sorted(agg.items(), key=lambda x: -x[1])]


async def get_top10_plants(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    agg: Dict[str, float] = defaultdict(float)
    for r in rows:
        agg[r.get("plant_name") or "Unknown"] += coerce_float(r, "sales_unit")
    top = sorted(agg.items(), key=lambda x: -x[1])[:10]
    return [{"plant_name": k, "sales_unit": round(v, 3)} for k, v in top]


async def get_voltage_wise_sales(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    agg: Dict[str, float] = defaultdict(float)
    for r in rows:
        agg[r.get("voltage_level") or "Unknown"] += coerce_float(r, "sales_unit")
    return [{"voltage_level": k, "sales_unit": round(v, 3)} for k, v in sorted(agg.items(), key=lambda x: -x[1])]


async def get_type_voltage_heatmap(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    rows = await _load(filters)
    agg: Dict[tuple, float] = defaultdict(float)
    types, voltages = set(), set()
    for r in rows:
        t = r.get("plant_type") or "Unknown"
        v = r.get("voltage_level") or "Unknown"
        agg[(t, v)] += coerce_float(r, "sales_unit")
        types.add(t)
        voltages.add(v)
    types, voltages = sorted(types), sorted(voltages)
    z = [[round(agg.get((t, v), 0.0), 3) for v in voltages] for t in types]
    return {"plant_types": types, "voltage_levels": voltages, "z": z}


async def get_treemap(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    agg: Dict[tuple, float] = defaultdict(float)
    for r in rows:
        key = (r.get("plant_type") or "Unknown", r.get("plant_name") or "Unknown")
        agg[key] += coerce_float(r, "sales_unit")
    return [{"plant_type": k[0], "plant_name": k[1], "sales_unit": round(v, 3)} for k, v in agg.items()]


async def get_bubble(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    agg: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        name = r.get("plant_name") or "Unknown"
        if name not in agg:
            agg[name] = {"plant_name": name, "plant_type": r.get("plant_type") or "Unknown", "total": 0.0, "count": 0}
        agg[name]["total"] += coerce_float(r, "sales_unit")
        agg[name]["count"] += 1
    result = [{"plant_name": v["plant_name"], "plant_type": v["plant_type"], "total_sales": round(v["total"], 3)} for v in agg.values()]
    return sorted(result, key=lambda x: -x["total_sales"])


async def get_monthly_heatmap(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    rows = await _load(filters)
    agg: Dict[tuple, float] = defaultdict(float)
    types, months = set(), set()
    for r in rows:
        t = r.get("plant_type") or "Unknown"
        m = str(r.get("year_month", ""))[:7]
        if not m:
            continue
        agg[(t, m)] += coerce_float(r, "sales_unit")
        types.add(t)
        months.add(m)
    types, months = sorted(types), sorted(months)
    z = [[round(agg.get((t, m), 0.0), 3) for m in months] for t in types]
    return {"plant_types": types, "months": months, "z": z}


async def get_waterfall(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    trend = await get_monthly_trend(filters)
    result, prev = [], None
    for point in trend:
        delta = point["sales_unit"] if prev is None else round(point["sales_unit"] - prev, 3)
        result.append({"year_month": point["year_month"], "value": point["sales_unit"], "delta": delta})
        prev = point["sales_unit"]
    return result


async def get_sankey(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    rows = await _load(filters)
    flows: Dict[tuple, float] = defaultdict(float)
    for r in rows:
        ppa = r.get("ppa_type") or "Unknown"
        ptype = r.get("plant_type") or "Unknown"
        val = coerce_float(r, "sales_unit")
        flows[(ppa, ptype)] += val
        flows[(ptype, "Total Sales")] += val
    nodes = sorted({n for pair in flows for n in pair})
    node_index = {n: i for i, n in enumerate(nodes)}
    links = [{"source": node_index[a], "target": node_index[b], "value": round(v, 3)} for (a, b), v in flows.items() if v > 0]
    return {"nodes": nodes, "links": links}


async def get_insights(filters: Dict[str, Optional[str]]) -> List[str]:
    kpis = await get_kpis(filters)
    contribution = await get_plant_type_contribution(filters)
    top10 = await get_top10_plants(filters)

    insights = [
        f"Total prosumer sales stand at {kpis['total_sales']:,.2f} MU across {kpis['total_plants']} registered plants.",
        f"{kpis['active_plants']} plants are actively generating sales, while {kpis['zero_sales_plants']} plants ({kpis['zero_sales_pct']}%) recorded zero sales.",
    ]
    if contribution:
        insights.append(f"{contribution[0]['plant_type']} leads plant-type contribution with {contribution[0]['sales_unit']:,.2f} MU in sales.")
    if top10:
        insights.append(f"{top10[0]['plant_name']} is the top-selling plant at {top10[0]['sales_unit']:,.2f} MU.")
    insights.append(f"Average sales per plant across the network is {kpis['average_sales_per_plant']:,.2f} MU.")
    return insights


async def get_table_data(filters: Dict[str, Optional[str]], page: int = 1, page_size: int = 50) -> Dict[str, Any]:
    rows = await _load(filters)
    total = len(rows)
    start = (page - 1) * page_size
    return {"rows": rows[start:start + page_size], "total": total, "page": page, "page_size": page_size}
