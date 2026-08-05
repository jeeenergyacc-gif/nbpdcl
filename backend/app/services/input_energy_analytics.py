"""
Input Energy Dashboard - Analytics Engine
Computes KPIs, chart-ready datasets, hierarchical drill-down data,
and executive insights from the input_energy sheet.
"""
from collections import defaultdict
from typing import Any, Dict, List, Optional

from app.services.sheets_service import get_sheet_data, coerce_float
from app.core.fy import in_fy, in_fy_quarter, fy_years_from, fy_label
from app.core.config import get_settings

settings = get_settings()


def _is_gss(substation: str) -> bool:
    s = (substation or "").strip()
    return s.startswith("132") or s.startswith("220")


def _is_feeder_33kv(feeder: str) -> bool:
    return (feeder or "").strip().startswith("33 KV") or (feeder or "").strip().startswith("33KV")


def _apply_filters(rows: List[Dict[str, Any]], filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    result = rows
    if filters.get("year"):
        result = [r for r in result if in_fy(str(r.get("year_month", "")), filters["year"])]
    if filters.get("month"):
        result = [r for r in result if str(r.get("year_month", ""))[5:7] == filters["month"].zfill(2)]
    if filters.get("quarter"):
        result = [r for r in result if in_fy_quarter(str(r.get("year_month", "")), filters["quarter"])]
    # DISCOM handling: BSPHCL is the holding level (= NBPDCL + SBPDCL), so it
    # applies NO discom filter and the units sum naturally. NBPDCL / SBPDCL filter
    # to that DISCOM's actual rows. (Input Energy is a spec exception — actual
    # values only, never sharing-ratio allocated.)
    discom = (filters.get("discom_name") or filters.get("discom") or "").strip()
    if discom and discom.upper() != "BSPHCL":
        result = [r for r in result if (r.get("discom_name") or "").lower() == discom.lower()]

    for key in ("circle", "division", "substation", "feeder_name", "feeder_type"):
        if filters.get(key):
            result = [r for r in result if (r.get(key) or "").lower() == filters[key].lower()]
    if filters.get("search"):
        term = filters["search"].lower()
        result = [r for r in result if term in (r.get("feeder_name") or "").lower()]
    return result


async def get_raw_data() -> List[Dict[str, Any]]:
    return await get_sheet_data(settings.SHEET_INPUT_ENERGY)


async def get_filter_options() -> Dict[str, List[str]]:
    rows = await get_raw_data()

    def uniq(key: str) -> List[str]:
        return sorted({str(r.get(key)) for r in rows if r.get(key) not in (None, "")})

    years = fy_years_from(str(r.get("year_month", "")) for r in rows if r.get("year_month"))
    return {
        "years": years, "quarters": ["Q1", "Q2", "Q3", "Q4"],
        "discoms": ["BSPHCL"] + [d for d in uniq("discom_name") if d.upper() != "BSPHCL"],
        "circles": uniq("circle"), "divisions": uniq("division"),
        "substations": uniq("substation"), "feeders": uniq("feeder_name"),
        "feeder_types": uniq("feeder_type"),
    }


async def get_kpis(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    rows = _apply_filters(await get_raw_data(), filters)
    if not rows:
        return {k: 0 for k in [
            "total_energy_mu", "total_circles", "total_divisions", "total_gss",
            "total_feeders", "import_energy", "export_energy", "average_monthly_energy",
        ]}

    total = sum(coerce_float(r, "energy_quantum") for r in rows)
    circles = {r.get("circle") for r in rows if r.get("circle")}
    divisions = {r.get("division") for r in rows if r.get("division")}
    gss = {r.get("substation") for r in rows if _is_gss(r.get("substation", ""))}
    feeders = {r.get("feeder_name") for r in rows if r.get("feeder_name")}

    import_total = sum(coerce_float(r, "energy_quantum") for r in rows if (r.get("feeder_type") or "").lower() == "import")
    export_total = sum(coerce_float(r, "energy_quantum") for r in rows if (r.get("feeder_type") or "").lower() == "export")

    months = {str(r.get("year_month", ""))[:7] for r in rows if r.get("year_month")}

    return {
        "total_energy_mu": round(total, 3),
        "total_circles": len(circles),
        "total_divisions": len(divisions),
        "total_gss": len(gss),
        "total_feeders": len(feeders),
        "import_energy": round(import_total, 3),
        "export_energy": round(export_total, 3),
        "average_monthly_energy": round(total / len(months), 3) if months else round(total, 3),
    }


async def get_monthly_trend(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = _apply_filters(await get_raw_data(), filters)
    agg: Dict[str, float] = defaultdict(float)
    for r in rows:
        ym = str(r.get("year_month", ""))[:7]
        if ym:
            agg[ym] += coerce_float(r, "energy_quantum")
    return [{"year_month": k, "energy_quantum": round(v, 3)} for k, v in sorted(agg.items())]


async def get_discom_share(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = _apply_filters(await get_raw_data(), filters)
    agg: Dict[str, float] = defaultdict(float)
    for r in rows:
        agg[r.get("discom_name") or "Unknown"] += coerce_float(r, "energy_quantum")
    return [{"discom_name": k, "energy_quantum": round(v, 3)} for k, v in sorted(agg.items(), key=lambda x: -x[1])]


async def _ranking(rows: List[Dict[str, Any]], key: str, top_n: Optional[int] = None, ascending: bool = False) -> List[Dict[str, Any]]:
    agg: Dict[str, float] = defaultdict(float)
    for r in rows:
        agg[r.get(key) or "Unknown"] += coerce_float(r, "energy_quantum")
    items = sorted(agg.items(), key=lambda x: x[1], reverse=not ascending)
    if top_n:
        items = items[:top_n]
    return [{key: k, "energy_quantum": round(v, 3)} for k, v in items]


async def get_circle_ranking(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    return await _ranking(_apply_filters(await get_raw_data(), filters), "circle")


async def get_division_ranking(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    return await _ranking(_apply_filters(await get_raw_data(), filters), "division")


async def get_circle_heatmap(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    rows = _apply_filters(await get_raw_data(), filters)
    agg: Dict[tuple, float] = defaultdict(float)
    circles, months = set(), set()
    for r in rows:
        c = r.get("circle") or "Unknown"
        m = str(r.get("year_month", ""))[:7]
        if not m:
            continue
        agg[(c, m)] += coerce_float(r, "energy_quantum")
        circles.add(c)
        months.add(m)
    circles, months = sorted(circles), sorted(months)
    z = [[round(agg.get((c, m), 0.0), 3) for m in months] for c in circles]
    return {"circles": circles, "months": months, "z": z}


async def get_division_heatmap(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    rows = _apply_filters(await get_raw_data(), filters)
    agg: Dict[tuple, float] = defaultdict(float)
    divisions, months = set(), set()
    for r in rows:
        d = r.get("division") or "Unknown"
        m = str(r.get("year_month", ""))[:7]
        if not m:
            continue
        agg[(d, m)] += coerce_float(r, "energy_quantum")
        divisions.add(d)
        months.add(m)
    divisions, months = sorted(divisions), sorted(months)
    z = [[round(agg.get((d, m), 0.0), 3) for m in months] for d in divisions]
    return {"divisions": divisions, "months": months, "z": z}


async def get_treemap(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = _apply_filters(await get_raw_data(), filters)
    agg: Dict[tuple, float] = defaultdict(float)
    for r in rows:
        key = (r.get("circle") or "Unknown", r.get("division") or "Unknown")
        agg[key] += coerce_float(r, "energy_quantum")
    return [{"circle": k[0], "division": k[1], "energy_quantum": round(v, 3)} for k, v in agg.items()]


async def get_sunburst(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = _apply_filters(await get_raw_data(), filters)
    agg: Dict[tuple, float] = defaultdict(float)
    for r in rows:
        key = (r.get("circle") or "Unknown", r.get("division") or "Unknown", r.get("substation") or "Unknown")
        agg[key] += coerce_float(r, "energy_quantum")
    return [{"circle": k[0], "division": k[1], "substation": k[2], "energy_quantum": round(v, 3)} for k, v in agg.items()]


async def get_sankey(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    rows = _apply_filters(await get_raw_data(), filters)
    flows: Dict[tuple, float] = defaultdict(float)
    for r in rows:
        circle = r.get("circle") or "Unknown"
        division = r.get("division") or "Unknown"
        val = coerce_float(r, "energy_quantum")
        flows[("DISCOM", circle)] += val
        flows[(circle, f"{circle} / {division}")] += val

    nodes = sorted({n for pair in flows for n in pair})
    node_index = {n: i for i, n in enumerate(nodes)}
    links = [{"source": node_index[a], "target": node_index[b], "value": round(v, 3)} for (a, b), v in flows.items() if v > 0]
    return {"nodes": nodes, "links": links}


async def get_top_feeders(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    return await _ranking(_apply_filters(await get_raw_data(), filters), "feeder_name", top_n=10)


async def get_bottom_feeders(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    return await _ranking(_apply_filters(await get_raw_data(), filters), "feeder_name", top_n=10, ascending=True)


async def get_bubble(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = _apply_filters(await get_raw_data(), filters)
    agg: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        name = r.get("feeder_name") or "Unknown"
        if name not in agg:
            agg[name] = {"feeder_name": name, "division": r.get("division") or "Unknown", "total": 0.0, "count": 0}
        agg[name]["total"] += coerce_float(r, "energy_quantum")
        agg[name]["count"] += 1
    result = [
        {"feeder_name": v["feeder_name"], "division": v["division"], "total_energy": round(v["total"], 3), "entries": v["count"]}
        for v in agg.values()
    ]
    return sorted(result, key=lambda x: -x["total_energy"])[:60]


async def get_scatter(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = _apply_filters(await get_raw_data(), filters)
    return [
        {
            "feeder_name": r.get("feeder_name"),
            "sharing_percentage": coerce_float(r, "sharing_percentage"),
            "energy_quantum": coerce_float(r, "energy_quantum"),
            "feeder_type": r.get("feeder_type") or "Unknown",
        }
        for r in rows
    ][:500]


async def get_pareto(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    ranking = await _ranking(_apply_filters(await get_raw_data(), filters), "feeder_name")
    total = sum(r["energy_quantum"] for r in ranking) or 1
    cumulative = 0.0
    result = []
    for r in ranking[:30]:
        cumulative += r["energy_quantum"]
        result.append({
            "feeder_name": r["feeder_name"],
            "energy_quantum": r["energy_quantum"],
            "cumulative_pct": round((cumulative / total) * 100, 2),
        })
    return result


async def get_waterfall(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    trend = await get_monthly_trend(filters)
    result, prev = [], None
    for point in trend:
        delta = point["energy_quantum"] if prev is None else round(point["energy_quantum"] - prev, 3)
        result.append({"year_month": point["year_month"], "value": point["energy_quantum"], "delta": delta})
        prev = point["energy_quantum"]
    return result


async def get_gauge(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    rows = _apply_filters(await get_raw_data(), filters)
    if not rows:
        return {"import_pct": 0, "export_pct": 0}
    total = sum(coerce_float(r, "energy_quantum") for r in rows) or 1
    import_total = sum(coerce_float(r, "energy_quantum") for r in rows if (r.get("feeder_type") or "").lower() == "import")
    return {"import_pct": round((import_total / total) * 100, 2), "export_pct": round(100 - (import_total / total) * 100, 2)}


async def get_insights(filters: Dict[str, Optional[str]]) -> List[str]:
    kpis = await get_kpis(filters)
    discom = await get_discom_share(filters)
    circles = await get_circle_ranking(filters)
    top_feeders = await get_top_feeders(filters)

    insights = []
    if kpis["total_energy_mu"]:
        insights.append(f"Total input energy across the network is {kpis['total_energy_mu']:,.2f} MU spanning {kpis['total_circles']} circles and {kpis['total_divisions']} divisions.")
    if discom:
        insights.append(f"{discom[0]['discom_name']} contributes the largest DISCOM share at {discom[0]['energy_quantum']:,.2f} MU.")
    if circles:
        insights.append(f"{circles[0]['circle']} circle leads energy input at {circles[0]['energy_quantum']:,.2f} MU.")
    if top_feeders:
        insights.append(f"{top_feeders[0]['feeder_name']} is the highest-consuming feeder with {top_feeders[0]['energy_quantum']:,.2f} MU.")
    if kpis["import_energy"] or kpis["export_energy"]:
        insights.append(f"Import energy stands at {kpis['import_energy']:,.2f} MU versus export energy of {kpis['export_energy']:,.2f} MU.")
    insights.append(f"The network operates {kpis['total_gss']} grid substations (GSS) and {kpis['total_feeders']} feeders under monitoring.")
    return insights


async def get_table_data(filters: Dict[str, Optional[str]], page: int = 1, page_size: int = 50) -> Dict[str, Any]:
    rows = _apply_filters(await get_raw_data(), filters)
    total = len(rows)
    start = (page - 1) * page_size
    return {"rows": rows[start:start + page_size], "total": total, "page": page, "page_size": page_size}
