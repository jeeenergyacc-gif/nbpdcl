"""
Transmission Losses (CTL / STL) - BSPHCL Energy-Accounting Engine
================================================================

Implements the workbook "LOSS logic" methodology EXACTLY, computed on the
backend from the existing operational sheets (raw data in -> losses out).
Nothing is hardcoded; every figure traces to a sheet row.

Row numbers below match the workbook's "Sl. No." column.

CTL side
--------
  R2   Power From Central Sector incl Central Renewable incl Sale
         = Plant_Purchase_Master where ppa_type IN (Central, SALE)   [SALE is negative]
  R3   Total Schedule At Bihar Boundary (NB+SB+Railway+STOA+Nepal)
         = master_ui_deviation_bihar.total_schedule_bihar            [Nepal already inside]
  R4   STOA Schedule                 = railway_power.stoa_schedule
  R5   Railway Schedule (before STL) = railway_power.railway_schedule_bihar_boundary
  R9   Schedule (NB+SB+Nepal)        = R3 - R4 - R5
  R10  UI                            = master_ui_deviation_bihar.deviation_energy
  R11  Total Actual Drawal @Boundary = R9 + R10
  R12  CTL (Loss Energy)             = R2 - R11
  R13  Renewable Central             = Plant_Purchase_Master ppa_type=Central & renewable category
  R14  CTL %                         = R12 / (R2 - R13) * 100

STL side
--------
  R16  Intrastate Purchase           = Plant_Purchase_Master where ppa_type = intra
  R17  Total Power At BSPTCL          = R11 + R16
  R18  NBPDCL Total Drawal            = input_energy where discom_name = NBPDCL
  R19  SBPDCL Total Drawal            = input_energy where discom_name = SBPDCL
  R20  Embedded Generation            = Plant_Purchase_Master where
                                        ppa_type = "Intra Renewable Generation Connected to DISCOM Network"
  R21  DISCOMs (NB+SB) Drawal         = R18 + R19 - R20
  R22  Sale to Prosumers              = prosumer_energy_sales.sales_unit
  R23  Railway Overdrawal             = railway_power.railway_overdrawal
  R24  Total Drawal from BSPTCL       = R21 + R22 + R23
  R25  STL                            = R17 - R24
  R26  STL %                          = R25 / R17 * 100
  R27  Nepal Power                    = nepal_energy.nepal_schedule (optional, COALESCE 0)

All additions are additive: no existing sheet, endpoint, field or response key
is modified. Values are full-precision internally, rounded for display.
"""
from typing import Any, Dict, List, Optional

from app.services.sheets_service import get_sheet_data, coerce_float
from app.core.config import get_settings
from app.core.fy import in_fy, in_fy_quarter, fy_years_from, fy_label

settings = get_settings()

EMBEDDED_PPA = "intra renewable generation connected to discom network"


def _norm(v: Any) -> str:
    return (str(v) if v is not None else "").strip().lower()


def _ym(v: Any) -> str:
    return str(v)[:7] if v else ""


def r2(v: float) -> float:
    return round(v, 3)


def _safe_div(a: float, b: float) -> float:
    return (a / b) if b else 0.0


# --------------------------------------------------------------- data loading

async def _load() -> Dict[str, List[Dict[str, Any]]]:
    return {
        "pp": await get_sheet_data(settings.SHEET_POWER_PURCHASE),
        "ui": await get_sheet_data(settings.SHEET_UI_DEVIATION),
        "rail": await get_sheet_data(settings.SHEET_RAILWAY_POWER),
        "ie": await get_sheet_data(settings.SHEET_INPUT_ENERGY),
        "pros": await get_sheet_data(settings.SHEET_PROSUMER_SALES),
        "nepal": await _load_optional(settings.SHEET_NEPAL_ENERGY),
    }


async def _load_optional(sheet: str) -> List[Dict[str, Any]]:
    """Nepal is an optional tab — absence must degrade gracefully to zero."""
    try:
        return await get_sheet_data(sheet)
    except Exception:
        return []


def _months(data: Dict[str, List[Dict[str, Any]]]) -> List[str]:
    """
    Months eligible for a CTL/STL computation. CTL/STL is purchase-driven (Row 2
    is central purchase), so a month without purchase energy produces a
    meaningless negative loss. We therefore key off months that actually have
    Plant_Purchase_Master energy, ignoring placeholder future-dated UI rows and
    deviation-only months (e.g. a partially-entered current month).
    """
    months = set()
    for x in data["pp"]:
        ym = _ym(x.get("year_month"))
        if ym and _to_num(x.get("energy_quantum")) != 0:
            months.add(ym)
    return sorted(months)


def _to_num(v: Any) -> float:
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return 0.0


# ------------------------------------------------------------- the engine

def _compute_month(
    data: Dict[str, List[Dict[str, Any]]],
    month: Optional[str] = None,
    months_set: Optional[set] = None,
) -> Dict[str, float]:
    """Compute the full 27-row balance for a period.

    Period selection:
        - month=None, months_set=None  -> every month in the data (all-time)
        - month="YYYY-MM"              -> that single month
        - months_set={"2026-04",...}   -> those months summed (a quarter or an FY)

    Why summing "just works": every raw metric below is a sum-over-rows of the
    rows whose date matches the period. Widen the period from one month to a set
    and each raw volume becomes the period total automatically. The entire derived
    R-chain — CTL, STL, and their percentages — is then rebuilt from those summed
    volumes, so percentages come out correctly re-derived (total-loss-MU over
    total-input-MU across the period), NOT averaged month-to-month. Averaging
    percentages would be wrong; this avoids it by construction.
    """
    def match_month(value: Any) -> bool:
        if months_set is not None:
            return _ym(value) in months_set
        return month is None or _ym(value) == month

    # ---- Plant_Purchase_Master aggregations
    def pp_sum(ppa_types: set) -> float:
        return sum(
            coerce_float(x, "energy_quantum")
            for x in data["pp"]
            if _norm(x.get("ppa_type")) in ppa_types and match_month(x.get("year_month"))
        )

    r2_central = pp_sum({"central", "sale"})                          # R2
    purchase_excl_sale = pp_sum({"central"})                          # Total Purchase (excl Sale)
    sale_energy = pp_sum({"sale"})                                    # SALE (negative)
    intrastate = pp_sum({"intra"})                                    # R16
    embedded = pp_sum({EMBEDDED_PPA})                                 # R20
    renewable_central = sum(                                          # R13
        coerce_float(x, "energy_quantum")
        for x in data["pp"]
        if _norm(x.get("ppa_type")) == "central"
        and "renewable" in _norm(x.get("ppa_category"))
        and match_month(x.get("year_month"))
    )

    # ---- master_ui_deviation_bihar (schedule / drawal / UI)
    r3_boundary_sch = sum(coerce_float(x, "total_schedule_bihar") for x in data["ui"] if match_month(x.get("entry_date")))  # R3
    r10_ui = sum(coerce_float(x, "deviation_energy") for x in data["ui"] if match_month(x.get("entry_date")))              # R10

    # ---- railway_power (long format: metric_name / energy_quantum)
    def rail_metric(metric: str) -> float:
        return sum(
            coerce_float(x, "energy_quantum")
            for x in data["rail"]
            if _norm(x.get("metric_name")) == metric and match_month(x.get("reporting_month"))
        )

    r4_stoa = rail_metric("stoa_schedule")                            # R4
    r5_rail_sched = rail_metric("railway_schedule_bihar_boundary")    # R5
    r23_rail_over = rail_metric("railway_overdrawal")                 # R23

    # ---- input_energy (DISCOM-wise drawal)
    def ie_discom(name: str) -> float:
        return sum(
            coerce_float(x, "energy_quantum")
            for x in data["ie"]
            if _norm(x.get("discom_name")) == name and match_month(x.get("year_month"))
        )

    r18_nbpdcl = ie_discom("nbpdcl")                                  # R18
    r19_sbpdcl = ie_discom("sbpdcl")                                  # R19

    # ---- prosumer sales (R22)
    r22_prosumer = sum(coerce_float(x, "sales_unit") for x in data["pros"] if match_month(x.get("year_month")))

    # ---- nepal (optional, COALESCE 0)
    def nepal_metric(metric: str) -> float:
        return sum(
            coerce_float(x, "energy_quantum")
            for x in data["nepal"]
            if _norm(x.get("metric_name")) == metric and match_month(x.get("reporting_month"))
        )

    nepal_schedule = nepal_metric("nepal_schedule")                  # R27
    nepal_drawal = nepal_metric("nepal_drawal")

    # ================= DERIVED CHAIN =================
    r9_schedule = r3_boundary_sch - r4_stoa - r5_rail_sched          # R9
    r11_actual_drawal = r9_schedule + r10_ui                          # R11
    r12_ctl = r2_central - r11_actual_drawal                          # R12
    ctl_pct = _safe_div(r12_ctl, r2_central - renewable_central) * 100  # R14

    r17_total_bsptcl = r11_actual_drawal + intrastate                # R17
    r21_discom_drawal = r18_nbpdcl + r19_sbpdcl - embedded           # R21
    # R24 Total Drawal from BSPTCL = DISCOM drawal + Sale to Prosumers + Railway
    # Overdrawal + Sale to Nepal. Nepal drawal is energy BSPTCL supplied that NBPDCL
    # bills to Nepal (a sale through the North-Bihar periphery), so — like the other
    # sales — it is accounted as drawal, not loss. It comes from the nepal_energy
    # sheet's nepal_drawal metric, so a month with no Nepal sale adds 0.
    r24_total_drawal = r21_discom_drawal + r22_prosumer + r23_rail_over + nepal_drawal  # R24
    r25_stl = r17_total_bsptcl - r24_total_drawal                    # R25
    stl_pct = _safe_div(r25_stl, r17_total_bsptcl) * 100             # R26

    total_loss = r12_ctl + r25_stl
    total_loss_pct = _safe_div(total_loss, r2_central) * 100

    return {
        # CTL side
        "central_power": r2_central,             # R2
        "purchase_excl_sale": purchase_excl_sale,  # Total Purchase (excl Sale)
        "sale_energy": sale_energy,              # SALE (negative)
        "boundary_schedule": r3_boundary_sch,    # R3
        "stoa_schedule": r4_stoa,                # R4
        "railway_schedule": r5_rail_sched,       # R5
        "schedule_nb_sb_nepal": r9_schedule,     # R9
        "ui_energy": r10_ui,                     # R10
        "actual_drawal_boundary": r11_actual_drawal,  # R11
        "ctl": r12_ctl,                          # R12
        "renewable_central": renewable_central,  # R13
        "ctl_pct": ctl_pct,                      # R14
        # STL side
        "intrastate_purchase": intrastate,       # R16
        "total_power_bsptcl": r17_total_bsptcl,  # R17
        "nbpdcl_drawal": r18_nbpdcl,             # R18
        "sbpdcl_drawal": r19_sbpdcl,             # R19
        "embedded_generation": embedded,         # R20
        "discom_drawal": r21_discom_drawal,      # R21
        "prosumer_sale": r22_prosumer,           # R22
        "railway_overdrawal": r23_rail_over,     # R23
        "total_drawal_bsptcl": r24_total_drawal,  # R24
        "stl": r25_stl,                          # R25
        "stl_pct": stl_pct,                      # R26
        # Nepal + totals
        "nepal_schedule": nepal_schedule,        # R27
        "nepal_drawal": nepal_drawal,
        "nepal_active": (nepal_schedule != 0 or nepal_drawal != 0),
        "total_loss": total_loss,
        "total_loss_pct": total_loss_pct,
    }


def _disc(filters: Dict[str, Optional[str]]) -> str:
    return (filters.get("discom") or "BSPHCL").strip().upper() or "BSPHCL"


def _allocate(c: Dict[str, float], discom: Optional[str]) -> Dict[str, float]:
    """
    DISCOM-allocated view of the holding-level balance (ADDITIVE — BSPHCL is
    returned untouched, so the default page is byte-for-byte unchanged).

    Month-wise sharing ratio is taken from the SAME input-energy split the sheet
    already carries (R18 / R19), so it can never disagree with the numbers on the
    table:
        NBPDCL % = R18 / (R18 + R19) · 100
        SBPDCL % = R19 / (R18 + R19) · 100

    Allocation rule (as specified):
        BSPHCL  -> holding values (factor 1.0)
        NBPDCL  -> every quantum × NBPDCL %; R18 stays original, R19 becomes 0
        SBPDCL  -> every quantum × SBPDCL %; R19 stays original, R18 becomes 0
    All dependent rows (R9, R11, R12/CTL, R17, R21, R24, R25/STL, losses, %s) are
    RE-DERIVED from the allocated inputs, so every subtotal and identity still
    balances. Because the factor is exactly R18/(R18+R19), keeping R18 while
    scaling the rest reproduces the scaled DISCOM drawal precisely.
    """
    r18 = c["nbpdcl_drawal"]
    r19 = c["sbpdcl_drawal"]
    denom = r18 + r19
    nb_pct = _safe_div(r18, denom) * 100 if denom else 0.0
    sb_pct = (100.0 - nb_pct) if denom else 0.0

    d = (discom or "BSPHCL").strip().upper() or "BSPHCL"

    if d not in ("NBPDCL", "SBPDCL"):
        out = dict(c)
        out["allocation_discom"] = "BSPHCL"
        out["allocation_factor"] = 1.0
        out["nbpdcl_pct"] = r2(nb_pct)
        out["sbpdcl_pct"] = r2(sb_pct)
        return out

    factor = (nb_pct if d == "NBPDCL" else sb_pct) / 100.0

    # ---- scale every independent (sheet-sourced) quantum by the factor
    central = c["central_power"] * factor
    purchase_excl_sale = c["purchase_excl_sale"] * factor
    sale_energy = c["sale_energy"] * factor
    intrastate = c["intrastate_purchase"] * factor
    embedded = c["embedded_generation"] * factor
    renewable_central = c["renewable_central"] * factor
    ui = c["ui_energy"] * factor
    stoa = c["stoa_schedule"] * factor
    rail_sched = c["railway_schedule"] * factor
    rail_over = c["railway_overdrawal"] * factor
    prosumer = c["prosumer_sale"] * factor

    # ---- Nepal belongs 100% to NBPDCL (0% to SBPDCL). Nepal is baked inside the
    # boundary schedule (R3), so peel it out before scaling, then add the FULL
    # Nepal back only for the NBPDCL view. NBPDCL % + SBPDCL % = 100, so the two
    # views still sum exactly to the BSPHCL holding.
    nepal_sch_full = c["nepal_schedule"]
    nepal_drw_full = c["nepal_drawal"]
    boundary_ex_nepal = (c["boundary_schedule"] - nepal_sch_full) * factor
    if d == "NBPDCL":
        boundary_sch = boundary_ex_nepal + nepal_sch_full
        nepal_schedule = nepal_sch_full
        nepal_drawal = nepal_drw_full
    else:  # SBPDCL
        boundary_sch = boundary_ex_nepal
        nepal_schedule = 0.0
        nepal_drawal = 0.0

    # ---- R18 / R19 override (the two DISCOM-specific inputs)
    if d == "NBPDCL":
        r18a, r19a = r18, 0.0
    else:
        r18a, r19a = 0.0, r19

    # ---- re-derive the full chain from the allocated inputs
    r9 = boundary_sch - stoa - rail_sched
    r11 = r9 + ui
    r12_ctl = central - r11
    ctl_pct = _safe_div(r12_ctl, central - renewable_central) * 100
    r17 = r11 + intrastate
    r21 = r18a + r19a - embedded
    # Sale to Nepal (nepal_drawal) — already 0 for the SBPDCL view and full for
    # NBPDCL (set in the Nepal block above), so Nepal attaches 100% to NBPDCL and
    # the two DISCOM views still sum to the BSPHCL holding.
    r24 = r21 + prosumer + rail_over + nepal_drawal
    r25_stl = r17 - r24
    stl_pct = _safe_div(r25_stl, r17) * 100
    total_loss = r12_ctl + r25_stl
    total_loss_pct = _safe_div(total_loss, central) * 100

    return {
        "central_power": central,
        "purchase_excl_sale": purchase_excl_sale,
        "sale_energy": sale_energy,
        "boundary_schedule": boundary_sch,
        "stoa_schedule": stoa,
        "railway_schedule": rail_sched,
        "schedule_nb_sb_nepal": r9,
        "ui_energy": ui,
        "actual_drawal_boundary": r11,
        "ctl": r12_ctl,
        "renewable_central": renewable_central,
        "ctl_pct": ctl_pct,
        "intrastate_purchase": intrastate,
        "total_power_bsptcl": r17,
        "nbpdcl_drawal": r18a,
        "sbpdcl_drawal": r19a,
        "embedded_generation": embedded,
        "discom_drawal": r21,
        "prosumer_sale": prosumer,
        "railway_overdrawal": rail_over,
        "total_drawal_bsptcl": r24,
        "stl": r25_stl,
        "stl_pct": stl_pct,
        "nepal_schedule": nepal_schedule,
        "nepal_drawal": nepal_drawal,
        "nepal_active": (nepal_schedule != 0 or nepal_drawal != 0),
        "total_loss": total_loss,
        "total_loss_pct": total_loss_pct,
        "allocation_discom": d,
        "allocation_factor": factor,
        "nbpdcl_pct": r2(nb_pct),
        "sbpdcl_pct": r2(sb_pct),
    }


def _round_all(d: Dict[str, float]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k, v in d.items():
        # Round only real numbers; pass strings/None/bools through untouched
        # (the dict now also carries allocation metadata like allocation_discom).
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            out[k] = v
        else:
            out[k] = r2(v)
    return out


# ---------------------------------------------------------------- API surface

async def _month_filter(filters: Dict[str, Optional[str]], months: List[str]) -> Optional[str]:
    """Resolve which month to compute. If a month/year is chosen, use it; else latest."""
    if filters.get("month") and filters.get("year"):
        mm = str(filters["month"]).zfill(2)
        # FY runs Apr→Mar, so Jan/Feb/Mar of "FY yyyy" fall in calendar year yyyy+1.
        y = int(filters["year"])
        cal_year = y + 1 if mm in ("01", "02", "03") else y
        target = f"{cal_year}-{mm}"
        return target if target in months else (months[-1] if months else None)
    if filters.get("year"):
        yrs = [m for m in months if in_fy(m, filters["year"])]
        return yrs[-1] if yrs else None
    if filters.get("month"):
        mm = str(filters["month"]).zfill(2)
        matches = [m for m in months if m[5:7] == mm]
        return matches[-1] if matches else (months[-1] if months else None)
    return months[-1] if months else None


def _resolve_period(filters: Dict[str, Optional[str]], months: List[str]) -> Dict[str, Any]:
    """
    Resolve a filter to the SET of months it covers, so quarter- and year-level
    views sum instead of showing a single month.

    Precedence (most specific wins), matching the dashboard's own controls:
        year + month  -> exactly that one month
        year + quarter-> that quarter within the FY   (up to 3 months, summed)
        quarter only  -> that quarter across every FY present (summed)
        year only     -> the whole financial year     (up to 12 months, summed)
        month only    -> that calendar month across every year (summed)
        nothing       -> the latest single month       (unchanged default)

    Returns { months: set|None, label: str, period: str, is_range: bool }.
    `months=None` means "single latest month" and preserves the exact original
    single-month behaviour, so nothing about the default view changes.
    """
    year = filters.get("year")
    month = filters.get("month")
    quarter = str(filters.get("quarter") or "").upper()

    # year + month -> single month (unchanged)
    if year and month:
        mm = str(month).zfill(2)
        y = int(year)
        cal_year = y + 1 if mm in ("01", "02", "03") else y
        target = f"{cal_year}-{mm}"
        one = target if target in months else (months[-1] if months else None)
        return {"months": None, "label": one or "", "period": one, "is_range": False}

    # year + quarter -> that quarter inside the FY
    if year and quarter:
        sel = {m for m in months if in_fy(m, year) and in_fy_quarter(m, quarter)}
        return {
            "months": sel,
            "label": f"{quarter} {fy_label(year)}",
            "period": _range_period(sel),
            "is_range": True,
        }

    # quarter only -> that quarter across all FYs present
    if quarter:
        sel = {m for m in months if in_fy_quarter(m, quarter)}
        return {"months": sel, "label": f"{quarter} (all years)",
                "period": _range_period(sel), "is_range": True}

    # year only -> the whole FY
    if year:
        sel = {m for m in months if in_fy(m, year)}
        return {"months": sel, "label": fy_label(year),
                "period": _range_period(sel), "is_range": True}

    # month only -> that calendar month across all years
    if month:
        mm = str(month).zfill(2)
        sel = {m for m in months if m[5:7] == mm}
        return {"months": sel, "label": f"Month {mm} (all years)",
                "period": _range_period(sel), "is_range": True}

    # nothing -> latest single month (unchanged default)
    latest = months[-1] if months else None
    return {"months": None, "label": latest or "", "period": latest, "is_range": False}


def _range_period(sel: set) -> Optional[str]:
    """A compact 'YYYY-MM..YYYY-MM' label for a set of months (or the single month)."""
    if not sel:
        return None
    lo, hi = min(sel), max(sel)
    return lo if lo == hi else f"{lo}..{hi}"


async def _compute_for(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    """
    Resolve the filter's period and return the computed R-chain for it, summed
    across the period when a quarter or FY is selected.

    Every endpoint below (waterfall, power flow, balance table, KPI grid, …) goes
    through this one helper, so they ALL sum consistently. Previously each called
    _month_filter -> _compute_month directly and therefore only ever showed a
    single month even for a quarter or year. Returns the raw (un-rounded) chain
    plus the resolved period metadata under "_period".
    """
    data = await _load()
    months = _months(data)
    p = _resolve_period(filters, months)
    c = _compute_month(
        data,
        month=p["period"] if not p["is_range"] else None,
        months_set=p["months"] if p["is_range"] else None,
    )
    c["_period"] = p
    return c


async def get_filter_options() -> Dict[str, List[str]]:
    data = await _load()
    months = _months(data)
    years = fy_years_from(months)
    return {"years": years, "quarters": ["Q1", "Q2", "Q3", "Q4"], "months": months}



# ---- pure section builders (compute from an already-resolved month snapshot) ----

def _ctl_waterfall(c: Dict[str, float]) -> Dict[str, Any]:
    return {
        "labels": ["Central Power", "Actual Drawal @Boundary", "CTL Loss"],
        "values": [r2(c["central_power"]), -r2(c["central_power"] - c["actual_drawal_boundary"]), 0],
        "measure": ["absolute", "relative", "total"],
        "result": r2(c["ctl"]), "result_pct": r2(c["ctl_pct"]),
    }


def _stl_waterfall(c: Dict[str, float]) -> Dict[str, Any]:
    return {
        "labels": ["Total Power @BSPTCL", "Total Drawal from BSPTCL", "STL Loss"],
        "values": [r2(c["total_power_bsptcl"]), -r2(c["total_drawal_bsptcl"]), 0],
        "measure": ["absolute", "relative", "total"],
        "result": r2(c["stl"]), "result_pct": r2(c["stl_pct"]),
    }


def _ctl_sankey(c: Dict[str, float]) -> Dict[str, Any]:
    return {
        "nodes": ["Central Power", "Actual Drawal", "CTL Loss"],
        "node_values": {"Central Power": r2(c["central_power"]), "Actual Drawal": r2(c["actual_drawal_boundary"]), "CTL Loss": r2(c["ctl"])},
        "links": [
            {"source": 0, "target": 1, "value": max(0.0, r2(c["actual_drawal_boundary"]))},
            {"source": 0, "target": 2, "value": max(0.0, r2(c["ctl"]))},
        ],
    }


def _stl_sankey(c: Dict[str, float]) -> Dict[str, Any]:
    return {
        "nodes": ["Total Power @BSPTCL", "DISCOM Drawal", "Prosumer Sale", "Railway Overdrawal", "STL Loss"],
        "node_values": {
            "Total Power @BSPTCL": r2(c["total_power_bsptcl"]), "DISCOM Drawal": r2(c["discom_drawal"]),
            "Prosumer Sale": r2(c["prosumer_sale"]), "Railway Overdrawal": r2(c["railway_overdrawal"]), "STL Loss": r2(c["stl"]),
        },
        "links": [
            {"source": 0, "target": 1, "value": max(0.0, r2(c["discom_drawal"]))},
            {"source": 0, "target": 2, "value": max(0.0, r2(c["prosumer_sale"]))},
            {"source": 0, "target": 3, "value": max(0.0, r2(c["railway_overdrawal"]))},
            {"source": 0, "target": 4, "value": max(0.0, r2(c["stl"]))},
        ],
    }


def _trend_row(m: str, c: Dict[str, float]) -> Dict[str, Any]:
    return {"year_month": m, "ctl": r2(c["ctl"]), "ctl_pct": r2(c["ctl_pct"]),
            "stl": r2(c["stl"]), "stl_pct": r2(c["stl_pct"]),
            "total_loss": r2(c["total_loss"]), "total_loss_pct": r2(c["total_loss_pct"])}


def _validation(c: Dict[str, float]) -> List[Dict[str, Any]]:
    tol = 0.01
    checks = [
        ("Row 11 = Row 9 + Row 10", c["actual_drawal_boundary"], c["schedule_nb_sb_nepal"] + c["ui_energy"]),
        ("CTL = Central Power − Row 11", c["ctl"], c["central_power"] - c["actual_drawal_boundary"]),
        ("DISCOM Drawal = NBPDCL + SBPDCL − Embedded", c["discom_drawal"], c["nbpdcl_drawal"] + c["sbpdcl_drawal"] - c["embedded_generation"]),
        ("Total Drawal = DISCOM + Prosumer + Rly Overdrawal", c["total_drawal_bsptcl"], c["discom_drawal"] + c["prosumer_sale"] + c["railway_overdrawal"]),
        ("STL = Total Power @BSPTCL − Total Drawal", c["stl"], c["total_power_bsptcl"] - c["total_drawal_bsptcl"]),
    ]
    return [{"rule": rule, "expected": r2(exp), "actual": r2(act), "pass": abs(exp - act) < tol} for rule, exp, act in checks]


def _insights(c: Dict[str, float]) -> List[str]:
    lines = [
        f"Central Transmission Loss (CTL) is {r2(c['ctl'])} MU at {r2(c['ctl_pct'])}% of central power (net of central renewable).",
        f"State Transmission Loss (STL) is {r2(c['stl'])} MU at {r2(c['stl_pct'])}% of total power at BSPTCL.",
        f"Total system loss is {r2(c['total_loss'])} MU ({r2(c['total_loss_pct'])}% of central power).",
    ]
    lvl = "Low" if c["total_loss_pct"] < 4 else "Moderate" if c["total_loss_pct"] < 7 else "High"
    lines.append(f"Overall transmission loss level is assessed as {lvl}.")
    if c["nepal_active"]:
        lines.append(f"Nepal power of {r2(c['nepal_schedule'])} MU is included inside the Bihar boundary schedule (COALESCE-optional layer active).")
    return lines


async def get_dashboard(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    """
    Single-shot payload for the whole Transmission page. Loads the sheets ONCE
    and computes every section from that one snapshot, so the frontend makes one
    request instead of nine (each of which previously re-loaded six sheets). This
    is the primary fix for the page feeling slow.
    """
    data = await _load()
    months = _months(data)
    p = _resolve_period(filters, months)
    disc = _disc(filters)
    # Holding computation is unchanged; allocation is layered on top. For BSPHCL
    # _allocate is a no-op, so the default payload is identical to before.
    # month=None + months_set drives the summed quarter/FY view; a single month
    # keeps the exact original behaviour.
    c = _allocate(
        _compute_month(data,
                       month=p["period"] if not p["is_range"] else None,
                       months_set=p["months"] if p["is_range"] else None),
        disc,
    )
    month = p["period"]  # a "YYYY-MM" or "YYYY-MM..YYYY-MM" range label

    kpis = _round_all(c)
    kpis["period"] = month
    kpis["period_label"] = p["label"]
    kpis["is_range"] = p["is_range"]
    kpis["months_in_period"] = len(p["months"]) if p["months"] else 1
    kpis["months_covered"] = len(months)
    kpis["discom"] = c.get("allocation_discom", "BSPHCL")
    kpis["nbpdcl_pct"] = c.get("nbpdcl_pct")
    kpis["sbpdcl_pct"] = c.get("sbpdcl_pct")

    return {
        "kpis": kpis,
        "power_flow": _power_flow(c),
        "nepal_layer": _nepal_layer(data, month, c),
        "ctl_steps": _ctl_steps(c),
        "stl_steps": _stl_steps(c),
        "ctl_waterfall": _ctl_waterfall(c),
        "stl_waterfall": _stl_waterfall(c),
        "ctl_sankey": _ctl_sankey(c),
        "stl_sankey": _stl_sankey(c),
        "trend": [_trend_row(m, _allocate(_compute_month(data, m), disc)) for m in months],
        "balance_table": _balance_table(c, month),
        "validation": _validation(c),
        "insights": _insights(c),
        "period": month,
        "discom": c.get("allocation_discom", "BSPHCL"),
    }


def _power_flow(c: Dict[str, float]) -> Dict[str, Any]:
    """The five-box top-down flow: Purchase → Boundary → Actual Drawal → BSPTCL → DISCOM,
    with the adjustment applied between each pair."""
    return {
        "boxes": [
            {"label": "Total Purchase (excl. Sale)", "value": r2(c["purchase_excl_sale"]), "tone": "blue"},
            {"label": "Bihar Boundary Schedule", "value": r2(c["boundary_schedule"]), "tone": "indigo"},
            {"label": "Actual Drawal at Boundary", "value": r2(c["actual_drawal_boundary"]), "tone": "teal"},
            {"label": "Total Power at BSPTCL", "value": r2(c["total_power_bsptcl"]), "tone": "green"},
            {"label": "DISCOM Input (NB + SB)", "value": r2(c["nbpdcl_drawal"] + c["sbpdcl_drawal"]), "tone": "orange"},
        ],
        # adjustment chips sit under the gap between boxes
        "adjustments": [
            {"under": 0, "label": f"− Sale {abs(r2(c['sale_energy']))}", "tone": "red"},
            {"under": 1, "label": f"− UI {abs(r2(c['ui_energy']))}", "tone": "amber"},
            {"under": 2, "label": f"+ Intrastate {r2(c['intrastate_purchase'])}", "tone": "green"},
            {"under": 3, "label": "− Prosumer / Rly", "tone": "slate"},
        ],
        "notes": [
            f"Nepal schedule +{r2(c['nepal_schedule'])} → already included inside boundary schedule",
            f"Nepal energy −{r2(c['nepal_schedule'])} → deducted from DISCOM input (no double count)",
        ],
    }


def _nepal_layer(data: Dict[str, List[Dict[str, Any]]], month: Optional[str], c: Dict[str, float]) -> Dict[str, Any]:
    """Optional Nepal panel — schedule (ADD), energy (DEDUCT), and a monthly breakdown."""
    monthly = []
    seen = {}
    for x in data["nepal"]:
        if _norm(x.get("metric_name")) != "nepal_schedule":
            continue
        ym = _ym(x.get("reporting_month"))
        if not ym:
            continue
        seen[ym] = seen.get(ym, 0.0) + _to_num(x.get("energy_quantum"))
    for ym in sorted(seen):
        monthly.append({"month": ym, "value": r2(seen[ym])})
    return {
        "active": c["nepal_active"],
        "schedule": r2(c["nepal_schedule"]),
        "energy": r2(c["nepal_schedule"]),
        "monthly": monthly,
        "total": r2(sum(m["value"] for m in monthly)),
        "rule": "Nepal absent → COALESCE(x,0) → baseline unchanged",
    }


def _ctl_steps(c: Dict[str, float]) -> Dict[str, Any]:
    return {
        "steps": [
            {"title": "Purchase from Central + Renewable", "value": r2(c["purchase_excl_sale"] if c["purchase_excl_sale"] else c["central_power"])},
            {"title": "Schedule at Bihar Boundary", "value": r2(c["boundary_schedule"])},
            {"title": f"Actual Drawal (after UI {r2(c['ui_energy'])})", "value": r2(c["actual_drawal_boundary"])},
            {"title": "CTL Loss = Step 2 − Step 3", "value": r2(c["ctl"]), "loss": True},
        ],
        "footer": f"CTL % = {r2(c['ctl'])} ÷ {r2(c['central_power'] - c['renewable_central'])} × 100 = {r2(c['ctl_pct'])} %  ·  PGCIL + Central system loss (purchase → Bihar boundary)",
        "result_pct": r2(c["ctl_pct"]),
    }


def _stl_steps(c: Dict[str, float]) -> Dict[str, Any]:
    step1 = c["total_power_bsptcl"] - c["intrastate_purchase"]  # boundary-side base before intra/nepal
    return {
        "steps": [
            {"title": f"Bihar Boundary Sch. − STOA {r2(c['stoa_schedule'])} − Railway {r2(c['railway_schedule'])}", "value": r2(step1 if step1 else c["actual_drawal_boundary"])},
            {"title": "+ Nepal Schedule  COALESCE(x, 0)", "value": r2(c["nepal_schedule"]), "nepal": True},
            {"title": f"NB {r2(c['nbpdcl_drawal'])} + SB {r2(c['sbpdcl_drawal'])} − Embedded {r2(c['embedded_generation'])}", "value": r2(c["discom_drawal"])},
            {"title": "− Nepal Energy  COALESCE(x, 0)", "value": -r2(c["nepal_schedule"]), "nepal": True},
        ],
        "footer": f"STL = {r2(c['total_power_bsptcl'])} − {r2(c['total_drawal_bsptcl'])} = {r2(c['stl'])} MU  ·  {r2(c['stl_pct'])} %",
        "result": r2(c["stl"]),
        "result_pct": r2(c["stl_pct"]),
    }


async def get_kpis(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    data = await _load()
    months = _months(data)
    period = _resolve_period(filters, months)
    # months=None -> single latest/selected month (original behaviour);
    # a set -> a quarter or FY, summed inside _compute_month.
    c = _allocate(
        _compute_month(data, month=period["period"] if not period["is_range"] else None,
                       months_set=period["months"] if period["is_range"] else None),
        _disc(filters),
    )
    result = _round_all(c)
    result["period"] = period["period"]
    result["period_label"] = period["label"]
    result["is_range"] = period["is_range"]
    result["months_in_period"] = len(period["months"]) if period["months"] else 1
    result["months_covered"] = len(months)
    result["discom"] = c.get("allocation_discom", "BSPHCL")
    result["nbpdcl_pct"] = c.get("nbpdcl_pct")
    result["sbpdcl_pct"] = c.get("sbpdcl_pct")
    return result


async def get_ctl_waterfall(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    c = await _compute_for(filters)
    month = c["_period"]["period"]
    # Central Power -> (−UI adjustments arrive via Row 11) -> Actual Drawal -> CTL
    return {
        "labels": ["Central Power", "Actual Drawal @Boundary", "CTL Loss"],
        "values": [r2(c["central_power"]), -r2(c["central_power"] - c["actual_drawal_boundary"]), 0],
        "measure": ["absolute", "relative", "total"],
        "result": r2(c["ctl"]),
        "result_pct": r2(c["ctl_pct"]),
    }


async def get_stl_waterfall(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    c = await _compute_for(filters)
    month = c["_period"]["period"]
    return {
        "labels": ["Total Power @BSPTCL", "Total Drawal from BSPTCL", "STL Loss"],
        "values": [r2(c["total_power_bsptcl"]), -r2(c["total_drawal_bsptcl"]), 0],
        "measure": ["absolute", "relative", "total"],
        "result": r2(c["stl"]),
        "result_pct": r2(c["stl_pct"]),
    }


async def get_ctl_sankey(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    c = await _compute_for(filters)
    month = c["_period"]["period"]
    nodes = ["Central Power", "Actual Drawal", "CTL Loss"]
    node_values = {"Central Power": r2(c["central_power"]), "Actual Drawal": r2(c["actual_drawal_boundary"]), "CTL Loss": r2(c["ctl"])}
    links = [
        {"source": 0, "target": 1, "value": max(0.0, r2(c["actual_drawal_boundary"]))},
        {"source": 0, "target": 2, "value": max(0.0, r2(c["ctl"]))},
    ]
    return {"nodes": nodes, "links": links, "node_values": node_values}


async def get_stl_sankey(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    c = await _compute_for(filters)
    month = c["_period"]["period"]
    nodes = ["Total Power @BSPTCL", "DISCOM Drawal", "Prosumer Sale", "Railway Overdrawal", "STL Loss"]
    node_values = {
        "Total Power @BSPTCL": r2(c["total_power_bsptcl"]),
        "DISCOM Drawal": r2(c["discom_drawal"]),
        "Prosumer Sale": r2(c["prosumer_sale"]),
        "Railway Overdrawal": r2(c["railway_overdrawal"]),
        "STL Loss": r2(c["stl"]),
    }
    links = [
        {"source": 0, "target": 1, "value": max(0.0, r2(c["discom_drawal"]))},
        {"source": 0, "target": 2, "value": max(0.0, r2(c["prosumer_sale"]))},
        {"source": 0, "target": 3, "value": max(0.0, r2(c["railway_overdrawal"]))},
        {"source": 0, "target": 4, "value": max(0.0, r2(c["stl"]))},
    ]
    return {"nodes": nodes, "links": links, "node_values": node_values}


async def get_trend(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    data = await _load()
    out = []
    for m in _months(data):
        c = _compute_month(data, m)
        out.append({
            "year_month": m,
            "ctl": r2(c["ctl"]), "ctl_pct": r2(c["ctl_pct"]),
            "stl": r2(c["stl"]), "stl_pct": r2(c["stl_pct"]),
            "total_loss": r2(c["total_loss"]), "total_loss_pct": r2(c["total_loss_pct"]),
        })
    return out


async def get_balance_table(filters: Dict[str, Optional[str]]) -> Dict[str, Any]:
    """The canonical A/B/C/D banded audit table — recomputed live."""
    c = await _compute_for(filters)
    month = c["_period"]["period"]
    return _balance_table(_allocate(c, _disc(filters)), month)


def _balance_table(c: Dict[str, float], month: Optional[str]) -> Dict[str, Any]:
    boundary = c["boundary_schedule"] or 1

    def pct_of_boundary(v: float) -> float:
        return r2(_safe_div(v, boundary) * 100)

    rows = [
        # A. CTL SIDE
        {"band": "A", "sl": 2, "particulars": "Power From Central Sector (incl Central Renewable + Sale)", "formula": "ppa_type IN (Central, SALE)", "mu": r2(c["central_power"]), "pct": pct_of_boundary(c["central_power"])},
        {"band": "A", "sl": 3, "particulars": "Total Schedule At Bihar Boundary (NB+SB+Railway+STOA+Nepal)", "formula": "", "mu": r2(c["boundary_schedule"]), "pct": pct_of_boundary(c["boundary_schedule"])},
        {"band": "A", "sl": 4, "particulars": "Less: STOA Schedule", "formula": "", "mu": -r2(c["stoa_schedule"]), "pct": pct_of_boundary(c["stoa_schedule"])},
        {"band": "A", "sl": 5, "particulars": "Less: Railway Schedule (before STL)", "formula": "", "mu": -r2(c["railway_schedule"]), "pct": pct_of_boundary(c["railway_schedule"])},
        {"band": "A", "sl": 9, "particulars": "Schedule (NB+SB+Nepal)", "formula": "= R3 − R4 − R5", "mu": r2(c["schedule_nb_sb_nepal"]), "pct": pct_of_boundary(c["schedule_nb_sb_nepal"]), "subtotal": True},
        {"band": "A", "sl": 10, "particulars": "Add: UI Energy", "formula": "", "mu": r2(c["ui_energy"]), "pct": pct_of_boundary(c["ui_energy"])},
        {"band": "A", "sl": 11, "particulars": "Total Actual Drawal At Bihar Boundary", "formula": "= R9 + R10", "mu": r2(c["actual_drawal_boundary"]), "pct": pct_of_boundary(c["actual_drawal_boundary"]), "subtotal": True},
        # B. STL SIDE
        {"band": "B", "sl": 16, "particulars": "Add: Intrastate Purchase", "formula": "ppa_type = intra", "mu": r2(c["intrastate_purchase"]), "pct": pct_of_boundary(c["intrastate_purchase"])},
        {"band": "B", "sl": 17, "particulars": "Total Power At BSPTCL", "formula": "= R11 + R16", "mu": r2(c["total_power_bsptcl"]), "pct": pct_of_boundary(c["total_power_bsptcl"]), "subtotal": True},
        {"band": "B", "sl": 18, "particulars": "NBPDCL Total Drawal", "formula": "", "mu": r2(c["nbpdcl_drawal"]), "pct": pct_of_boundary(c["nbpdcl_drawal"])},
        {"band": "B", "sl": 19, "particulars": "SBPDCL Total Drawal", "formula": "", "mu": r2(c["sbpdcl_drawal"]), "pct": pct_of_boundary(c["sbpdcl_drawal"])},
        {"band": "B", "sl": 20, "particulars": "Less: Embedded Generation (Intra Renewable → DISCOM)", "formula": "", "mu": -r2(c["embedded_generation"]), "pct": pct_of_boundary(c["embedded_generation"])},
        {"band": "B", "sl": 21, "particulars": "DISCOMs (NB+SB) Drawal from BSPTCL", "formula": "= R18 + R19 − R20", "mu": r2(c["discom_drawal"]), "pct": pct_of_boundary(c["discom_drawal"]), "subtotal": True},
        {"band": "B", "sl": 22, "particulars": "Add: Sale to Prosumers", "formula": "", "mu": r2(c["prosumer_sale"]), "pct": pct_of_boundary(c["prosumer_sale"])},
        {"band": "B", "sl": 23, "particulars": "Add: Railway Overdrawal", "formula": "", "mu": r2(c["railway_overdrawal"]), "pct": pct_of_boundary(c["railway_overdrawal"])},
        {"band": "B", "sl": 23.1, "particulars": "Add: Sale to Nepal", "formula": "nepal_drawal", "mu": r2(c["nepal_drawal"]), "pct": pct_of_boundary(c["nepal_drawal"])},
        {"band": "B", "sl": 24, "particulars": "Total Drawal from BSPTCL", "formula": "= R21 + R22 + R23 + Nepal", "mu": r2(c["total_drawal_bsptcl"]), "pct": pct_of_boundary(c["total_drawal_bsptcl"]), "subtotal": True},
        # C. LOSSES
        {"band": "C", "sl": 12, "particulars": "CTL — Central Transmission Loss", "formula": "= R2 − R11", "mu": r2(c["ctl"]), "pct": r2(c["ctl_pct"]), "loss": True},
        {"band": "C", "sl": 25, "particulars": "STL — State Transmission Loss", "formula": "= R17 − R24", "mu": r2(c["stl"]), "pct": r2(c["stl_pct"]), "loss": True},
        {"band": "C", "sl": 0, "particulars": "TOTAL SYSTEM LOSS", "formula": "= CTL + STL", "mu": r2(c["total_loss"]), "pct": r2(c["total_loss_pct"]), "subtotal": True, "loss": True},
    ]
    return {"period": month, "rows": rows,
            "nepal_active": c["nepal_active"], "nepal_power": r2(c["nepal_schedule"]),
            "discom": c.get("allocation_discom", "BSPHCL"),
            "allocation_factor": c.get("allocation_factor", 1.0),
            "nbpdcl_pct": c.get("nbpdcl_pct"),
            "sbpdcl_pct": c.get("sbpdcl_pct")}


async def get_validation(filters: Dict[str, Optional[str]]) -> List[Dict[str, Any]]:
    """Live PASS/FAIL checks of the workbook's mandatory identities."""
    c = await _compute_for(filters)
    month = c["_period"]["period"]
    tol = 0.01

    checks = [
        ("Row 11 = Row 9 + Row 10", c["actual_drawal_boundary"], c["schedule_nb_sb_nepal"] + c["ui_energy"]),
        ("CTL = Central Power − Row 11", c["ctl"], c["central_power"] - c["actual_drawal_boundary"]),
        ("DISCOM Drawal = NBPDCL + SBPDCL − Embedded", c["discom_drawal"], c["nbpdcl_drawal"] + c["sbpdcl_drawal"] - c["embedded_generation"]),
        ("Total Drawal = DISCOM + Prosumer + Rly Overdrawal", c["total_drawal_bsptcl"], c["discom_drawal"] + c["prosumer_sale"] + c["railway_overdrawal"]),
        ("STL = Total Power @BSPTCL − Total Drawal", c["stl"], c["total_power_bsptcl"] - c["total_drawal_bsptcl"]),
    ]
    return [
        {"rule": rule, "expected": r2(exp), "actual": r2(act), "pass": abs(exp - act) < tol}
        for rule, exp, act in checks
    ]


async def get_insights(filters: Dict[str, Optional[str]]) -> List[str]:
    c = await _compute_for(filters)
    month = c["_period"]["period"]
    lines = [
        f"Central Transmission Loss (CTL) is {r2(c['ctl'])} MU at {r2(c['ctl_pct'])}% of central power (net of central renewable).",
        f"State Transmission Loss (STL) is {r2(c['stl'])} MU at {r2(c['stl_pct'])}% of total power at BSPTCL.",
        f"Total system loss is {r2(c['total_loss'])} MU ({r2(c['total_loss_pct'])}% of central power).",
    ]
    lvl = "Low" if c["total_loss_pct"] < 4 else "Moderate" if c["total_loss_pct"] < 7 else "High"
    lines.append(f"Overall transmission loss level is assessed as {lvl}.")
    if c["nepal_active"]:
        lines.append(f"Nepal power of {r2(c['nepal_schedule'])} MU is included inside the Bihar boundary schedule (COALESCE-optional layer active).")
    return lines
