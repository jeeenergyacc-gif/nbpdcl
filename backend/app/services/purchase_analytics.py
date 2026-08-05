"""
Power Purchase Dashboard - Analytics Engine
Computes KPIs, chart-ready datasets, and executive insights
from Plant_Purchase_Master sheet data.
"""
from collections import defaultdict
from typing import Any, Dict, List, Optional

from app.services.sheets_service import get_sheet_data, coerce_float
from app.core.sharing import allocation_factor, scale_rows
from app.core.fy import in_fy, in_fy_quarter, fy_years_from, fy_label
from app.core.config import get_settings

settings = get_settings()

RENEWABLE_TYPES = {"solar", "wind", "hydro", "biomass", "renewable"}


def _apply_filters(rows: List[Dict[str, Any]], filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    result = rows
    if filters.get("year"):
        result = [r for r in result if in_fy(str(r.get("year_month", "")), filters["year"])]
    if filters.get("month"):
        result = [r for r in result if str(r.get("year_month", ""))[5:7] == filters["month"].zfill(2)]
    if filters.get("quarter"):
        result = [r for r in result if in_fy_quarter(str(r.get("year_month", "")), filters["quarter"])]
    if filters.get("plant_type"):
        result = [r for r in result if (r.get("plant_type") or "").lower() == filters["plant_type"].lower()]
    if filters.get("plant_name"):
        result = [r for r in result if (r.get("plant_name") or "").lower() == filters["plant_name"].lower()]
    if filters.get("voltage_level"):
        result = [r for r in result if (r.get("voltage_level") or "").lower() == filters["voltage_level"].lower()]
    if filters.get("ppa_category"):
        result = [r for r in result if (r.get("ppa_category") or "").lower() == filters["ppa_category"].lower()]
    if filters.get("ppa_type"):
        result = [r for r in result if (r.get("ppa_type") or "").lower() == filters["ppa_type"].lower()]
    if filters.get("search"):
        term = filters["search"].lower()
        result = [r for r in result if term in (r.get("plant_name") or "").lower()]
    return result


async def get_raw_data() -> List[Dict[str, Any]]:
    return await get_sheet_data(settings.SHEET_POWER_PURCHASE)


# Energy/financial fields eligible for DISCOM sharing-ratio allocation.
_ALLOC_FIELDS = ["energy_quantum"]


async def _load(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    """
    Fetch -> Allocate -> (caller aggregates). The sharing-ratio factor for the
    selected DISCOM + period is applied at the raw-row level BEFORE any
    aggregation, so KPIs, charts, tables and every export share one consistent
    allocated figure. BSPHCL (or unresolved ratio) => factor 1.0 => holding data.
    """
    rows = _apply_filters(await get_raw_data(), filters)
    factor = await allocation_factor(filters)
    return scale_rows(rows, factor, _ALLOC_FIELDS)


async def _deviation_ui_energy(months: set) -> float:
    """Authoritative UI (DSM) energy, sourced from master_ui_deviation_bihar and
    matched to the purchase scope by month (YYYY-MM). Daily deviation_energy rows
    are summed per matching month, so this scales cleanly from 1 month to 12+:
    when the purchase sheet grows to a full year, every month in scope is summed
    automatically with no code change. Resilient by design — if the deviation
    sheet is unavailable the waterfall simply drops the UI step (returns 0)
    instead of breaking the KPI response.
    """
    if not months:
        return 0.0
    try:
        dev_rows = await get_sheet_data(settings.SHEET_UI_DEVIATION)
    except Exception:  # noqa: BLE001 — API resilience: never break KPIs on a dependency
        return 0.0
    total = 0.0
    for r in dev_rows:
        ym = str(r.get("entry_date", ""))[:7]  # 'YYYY-MM'
        if ym in months:
            total += coerce_float(r, "deviation_energy")
    return round(total, 3)


async def get_filter_options() -> Dict[str, List[str]]:
    rows = await get_raw_data()

    def uniq(key: str) -> List[str]:
        vals = sorted({str(r.get(key)) for r in rows if r.get(key) not in (None, "")})
        return vals

    years = fy_years_from(str(r.get("year_month", "")) for r in rows if r.get("year_month"))
    return {
        "years": years,
        "quarters": ["Q1", "Q2", "Q3", "Q4"],
        "discoms": ["BSPHCL", "NBPDCL", "SBPDCL"],
        "plant_types": uniq("plant_type"),
        "plant_names": uniq("plant_name"),
        "voltage_levels": uniq("voltage_level"),
        "ppa_categories": uniq("ppa_category"),
        "ppa_types": uniq("ppa_type"),
    }


async def get_kpis(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    rows = await _load(filters)
    if not rows:
        return {
            "total_purchase_mu": 0, "total_plants": 0, "average_purchase": 0,
            "max_generation": 0, "min_generation": 0, "renewable_pct": 0,
            "thermal_pct": 0, "selected_month": filters.get("month") or "All",
            # --- additive (do not remove existing keys above) ---
            "gross_purchase_mu": 0, "sale_energy_mu": 0,
            "ui_energy_mu": 0, "net_purchase_mu": 0,
            "central_share_mu": 0, "intra_share_mu": 0,
        }

    values = [coerce_float(r, "energy_quantum") for r in rows]
    total = sum(values)
    plants = {r.get("plant_name") for r in rows if r.get("plant_name")}

    renewable_total = sum(
        coerce_float(r, "energy_quantum") for r in rows
        if (r.get("plant_type") or "").lower() in RENEWABLE_TYPES
    )
    thermal_total = sum(
        coerce_float(r, "energy_quantum") for r in rows
        if (r.get("plant_type") or "").lower() == "thermal"
    )

    # --- Procurement waterfall components (additive) ---------------------------
    # All values trace directly to Plant_Purchase_Master rows in the current
    # filter scope. Sale rows carry ppa_type == "SALE" (IEX PMC / PTC) and are
    # already negative in the sheet; the UI reconciliation row carries
    # plant_name == "UI" and is likewise negative. Kept negative (signed) so the
    # frontend waterfall can render them as reductions without re-deriving sign.
    sale_energy = sum(
        coerce_float(r, "energy_quantum") for r in rows
        if (r.get("ppa_type") or "").strip().upper() == "SALE"
    )
    # Legacy UI placeholder line inside the purchase sheet (plant_name == "UI").
    # It is excluded from Gross so it can't double-count against the authoritative
    # deviation-sheet UI figure below.
    legacy_ui_row = sum(
        coerce_float(r, "energy_quantum") for r in rows
        if (r.get("plant_name") or "").strip().upper() == "UI"
    )
    # Gross = pure procurement: everything that is neither a sale nor the legacy UI line.
    gross_purchase = total - sale_energy - legacy_ui_row

    # Authoritative UI (DSM) from master_ui_deviation_bihar, month-matched to the
    # purchase scope. Wrapped so a deviation-sheet hiccup can never zero the KPIs.
    months_in_scope = {str(r.get("year_month", ""))[:7] for r in rows if r.get("year_month")}
    try:
        ui_energy = await _deviation_ui_energy(months_in_scope)
    except Exception:  # noqa: BLE001
        ui_energy = 0.0

    net_purchase = gross_purchase + sale_energy + ui_energy

    # Central vs Intra split — derived from ppa_type (the established rule: NOT
    # voltage_level). "Central" is exact; anything containing "intra" (covers
    # both plain intra and "Intra Renewable Generation Connected to DISCOM
    # Network") is intra-state. SALE rows are excluded from both.
    central_share = sum(
        coerce_float(r, "energy_quantum") for r in rows
        if (r.get("ppa_type") or "").strip().lower() == "central"
    )
    intra_share = sum(
        coerce_float(r, "energy_quantum") for r in rows
        if "intra" in (r.get("ppa_type") or "").strip().lower()
    )

    return {
        "total_purchase_mu": round(total, 3),
        "total_plants": len(plants),
        "average_purchase": round(total / len(rows), 3) if rows else 0,
        "max_generation": round(max(values), 3) if values else 0,
        "min_generation": round(min(values), 3) if values else 0,
        "renewable_pct": round((renewable_total / total) * 100, 2) if total else 0,
        "thermal_pct": round((thermal_total / total) * 100, 2) if total else 0,
        "selected_month": filters.get("month") or "All",
        # --- additive keys (existing contract above is unchanged) ---
        "gross_purchase_mu": round(gross_purchase, 3),
        "sale_energy_mu": round(sale_energy, 3),
        "ui_energy_mu": round(ui_energy, 3),
        "net_purchase_mu": round(net_purchase, 3),
        "central_share_mu": round(central_share, 3),
        "intra_share_mu": round(intra_share, 3),
    }


async def get_monthly_trend(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    agg: Dict[str, float] = defaultdict(float)
    for r in rows:
        ym = str(r.get("year_month", ""))[:7]
        if ym:
            agg[ym] += coerce_float(r, "energy_quantum")
    return [{"year_month": k, "energy_quantum": round(v, 3)} for k, v in sorted(agg.items())]


async def get_plant_type_distribution(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    agg: Dict[str, float] = defaultdict(float)
    for r in rows:
        key = r.get("plant_type") or "Unknown"
        agg[key] += coerce_float(r, "energy_quantum")
    return [{"plant_type": k, "energy_quantum": round(v, 3)} for k, v in sorted(agg.items(), key=lambda x: -x[1])]


async def get_treemap_data(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    agg: Dict[tuple, float] = defaultdict(float)
    for r in rows:
        key = (r.get("plant_type") or "Unknown", r.get("plant_name") or "Unknown")
        agg[key] += coerce_float(r, "energy_quantum")
    return [
        {"plant_type": k[0], "plant_name": k[1], "energy_quantum": round(v, 3)}
        for k, v in agg.items()
    ]


async def get_sunburst_data(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    agg: Dict[tuple, float] = defaultdict(float)
    for r in rows:
        key = (r.get("ppa_category") or "Unknown", r.get("plant_type") or "Unknown", r.get("plant_name") or "Unknown")
        agg[key] += coerce_float(r, "energy_quantum")
    return [
        {"ppa_category": k[0], "plant_type": k[1], "plant_name": k[2], "energy_quantum": round(v, 3)}
        for k, v in agg.items()
    ]


async def get_sankey_data(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    rows = await _load(filters)
    # Three columns: PPA Category  ->  Plant Type  ->  PPA Type bucket.
    # Sale rows (negative) are routed only to the "Sale (Negative)" bucket so the
    # procurement columns stay positive (matching the reference). Link widths use
    # magnitude (ECharts needs positive values); signed per-node totals are
    # returned separately in `node_values` for the labels.
    flows: Dict[tuple, float] = defaultdict(float)
    node_signed: Dict[str, float] = defaultdict(float)

    def classify(ppa_type: str) -> str:
        t = (ppa_type or "").strip().lower()
        if t == "central":
            return "Central"
        if "intra" in t:
            return "Intra"
        if t == "sale":
            return "Sale (Negative)"
        return "Other"

    for r in rows:
        cat = r.get("ppa_category") or "Unknown"
        ptype = r.get("plant_type") or "Unknown"
        val = coerce_float(r, "energy_quantum")
        bucket = classify(r.get("ppa_type") or "")

        if bucket == "Sale (Negative)":
            flows[(ptype, bucket)] += abs(val)
            node_signed[ptype] += val
            node_signed[bucket] += val
        else:
            flows[(cat, ptype)] += val
            flows[(ptype, bucket)] += val
            node_signed[cat] += val
            node_signed[ptype] += val
            node_signed[bucket] += val

    nodes = sorted({n for pair in flows for n in pair})
    node_index = {n: i for i, n in enumerate(nodes)}
    links = [
        {"source": node_index[a], "target": node_index[b], "value": round(v, 3)}
        for (a, b), v in flows.items() if v > 0
    ]
    return {
        "nodes": nodes,
        "links": links,
        # additive: signed totals for label rendering (Sale stays negative)
        "node_values": {k: round(v, 3) for k, v in node_signed.items()},
    }


async def get_bubble_data(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    agg: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        name = r.get("plant_name") or "Unknown"
        if name not in agg:
            agg[name] = {"plant_name": name, "plant_type": r.get("plant_type") or "Unknown", "total": 0.0, "count": 0}
        agg[name]["total"] += coerce_float(r, "energy_quantum")
        agg[name]["count"] += 1
    result = []
    for v in agg.values():
        result.append({
            "plant_name": v["plant_name"],
            "plant_type": v["plant_type"],
            "total_energy": round(v["total"], 3),
            "avg_energy": round(v["total"] / v["count"], 3) if v["count"] else 0,
            "entries": v["count"],
        })
    return sorted(result, key=lambda x: -x["total_energy"])


async def get_top10_plants(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    agg: Dict[str, float] = defaultdict(float)
    for r in rows:
        agg[r.get("plant_name") or "Unknown"] += coerce_float(r, "energy_quantum")
    top = sorted(agg.items(), key=lambda x: -x[1])[:10]
    return [{"plant_name": k, "energy_quantum": round(v, 3)} for k, v in top]


async def get_waterfall_data(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    trend = await get_monthly_trend(filters)
    result = []
    prev = None
    for point in trend:
        delta = point["energy_quantum"] if prev is None else round(point["energy_quantum"] - prev, 3)
        result.append({"year_month": point["year_month"], "value": point["energy_quantum"], "delta": delta})
        prev = point["energy_quantum"]
    return result


async def get_heatmap_data(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    rows = await _load(filters)
    agg: Dict[tuple, float] = defaultdict(float)
    plant_types = set()
    months = set()
    for r in rows:
        ptype = r.get("plant_type") or "Unknown"
        ym = str(r.get("year_month", ""))[:7]
        if not ym:
            continue
        agg[(ptype, ym)] += coerce_float(r, "energy_quantum")
        plant_types.add(ptype)
        months.add(ym)

    plant_types = sorted(plant_types)
    months = sorted(months)
    z = [[round(agg.get((pt, m), 0.0), 3) for m in months] for pt in plant_types]
    return {"plant_types": plant_types, "months": months, "z": z}


async def get_polar_data(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    rows = await _load(filters)
    agg: Dict[str, float] = defaultdict(float)
    for r in rows:
        agg[r.get("voltage_level") or "Unknown"] += coerce_float(r, "energy_quantum")
    return [{"voltage_level": k, "energy_quantum": round(v, 3)} for k, v in agg.items()]


async def get_executive_insights(filters: Dict[str, Optional[str]]) -> List[str]:
    kpis = await get_kpis(filters)
    trend = await get_monthly_trend(filters)
    dist = await get_plant_type_distribution(filters)
    top10 = await get_top10_plants(filters)

    insights = []
    if kpis["total_purchase_mu"]:
        insights.append(
            f"Total power purchase stands at {kpis['total_purchase_mu']:,.2f} MU across {kpis['total_plants']} plants."
        )
    if dist:
        leader = dist[0]
        insights.append(
            f"{leader['plant_type']} contributes the largest share at {leader['energy_quantum']:,.2f} MU."
        )
    if kpis["renewable_pct"]:
        insights.append(f"Renewable sources account for {kpis['renewable_pct']}% of total purchase.")
    if len(trend) >= 2:
        change = trend[-1]["energy_quantum"] - trend[-2]["energy_quantum"]
        direction = "increased" if change >= 0 else "decreased"
        insights.append(
            f"Purchase {direction} by {abs(change):,.2f} MU in {trend[-1]['year_month']} versus the prior month."
        )
    if top10:
        insights.append(f"{top10[0]['plant_name']} is the top contributing plant with {top10[0]['energy_quantum']:,.2f} MU.")
    return insights


async def get_table_data(filters: Dict[str, Optional[str]], page: int = 1, page_size: int = 50) -> Dict[str, Any]:
    rows = await _load(filters)
    total = len(rows)
    start = (page - 1) * page_size
    end = start + page_size
    paginated = rows[start:end]
    return {"rows": paginated, "total": total, "page": page, "page_size": page_size}
