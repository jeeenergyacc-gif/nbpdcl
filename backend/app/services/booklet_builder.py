"""
Energy Accounting Booklet — Payload Builder
===========================================

Assembles the ENTIRE monthly "Energy Accounting Booklet" (the Word document
BSPHCL publishes every billing month) as a single JSON payload, computed live
from the same sheets and the same analytics engines the dashboards already use.

STRICTLY ADDITIVE
-----------------
This module *reads* the existing analytics services. It does not modify a single
existing sheet name, endpoint, field name or response key. If every file except
`booklet_builder.py`, `booklet_docx.py` and `api/booklet.py` were reverted, the
application would behave byte-for-byte as it does today.

SECTION MAP (mirrors the published booklet exactly)
---------------------------------------------------
  1   Executive Summary          -> transmission (R2..R27) + purchase + input_energy
  1.4 DISCOM Input Energy        -> transmission R18 / R19  (same source as AllocationChip)
  2   Power Purchase Summary     -> purchase_analytics.get_table_data
  3   Energy Flow & Loss Calc    -> transmission_analytics (CTL/STL chain, verbatim formulas)
  4   Sale to Prosumers          -> prosumer_analytics.get_table_data
  5   Circle-wise Consumption    -> input_energy_analytics.get_circle_ranking
  8   Division-wise Consumption  -> input_energy_analytics.get_treemap (circle+division pairs)
  9   Feeder-level Detail        -> input_energy_analytics raw rows + per-division subtotals

The published booklet skips section numbers 6 and 7. That gap is reproduced here
deliberately so the generated document matches the printed one; change
`SECTION_NUMBERS` below if the numbering is ever corrected.

PRECISION
---------
All arithmetic is full-precision; rounding happens once, at presentation time,
to 2 decimals (MU) — matching the printed booklet.
"""
from collections import defaultdict
from typing import Any, Dict, List, Optional

from app.services import (
    purchase_analytics,
    prosumer_analytics,
    input_energy_analytics,
    transmission_analytics,
)
from app.services.sheets_service import get_sheet_data, coerce_float
from app.core.config import get_settings
from app.core.fy import fy_label, fy_start_year
from app.core.sharing import allocation_factor, VALID_DISCOMS


class BookletError(ValueError):
    """Bad caller input — surfaced as a 4xx rather than a silently wrong booklet."""

    def __init__(self, message: str, available=None, status: int = 400):
        super().__init__(message)
        self.message = message
        self.available = available or []
        # 400 = the caller sent something invalid; 404 = the input was well-formed
        # but that period simply has no data yet.
        self.status = status

settings = get_settings()

# The published booklet's own (non-contiguous) numbering.
SECTION_NUMBERS = {
    "exec": "1",
    "purchase": "2",
    "loss": "3",
    "prosumer": "4",
    "circle": "5",
    "division": "8",
    "detail": "9",
}

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

# Candidate column names for the two feeder-detail columns that the dashboards
# never surface. The input_energy sheet is read defensively: the first candidate
# that exists on the row wins; if none exist the cell degrades to a blank /
# "100%" rather than crashing the booklet. See docs/BOOKLET_AUTOMATION.md.
METER_KEYS = ("meter_no", "meter_sno", "meter_serial", "ca_no", "consumer_no", "meter_ca_no")
SHARING_KEYS = ("sharing_percentage","sharing_pct", "sharing_percent", "sharing_ratio", "share_pct", "sharing")


# ------------------------------------------------------------------ helpers

def _mu(v: Any) -> float:
    """Round to the 2-decimal MU precision the printed booklet uses."""
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return 0.0


def _fmt(v: Any, dp: int = 2) -> str:
    """Thousands-separated fixed-decimal string, e.g. 4,016.75."""
    try:
        return f"{float(v):,.{dp}f}"
    except (TypeError, ValueError):
        return str(v)


def _month_label(ym: Optional[str]) -> str:
    """'2026-05' -> 'May 2026'."""
    if not ym or len(str(ym)) < 7:
        return "All Periods"
    try:
        y, m = int(str(ym)[:4]), int(str(ym)[5:7])
        return f"{MONTH_NAMES[m - 1]} {y}"
    except (ValueError, IndexError):
        return str(ym)


def _first_key(row: Dict[str, Any], keys) -> Optional[Any]:
    for k in keys:
        if row.get(k) not in (None, ""):
            return row[k]
    return None


def _pct(part: float, whole: float) -> float:
    return round((part / whole) * 100, 2) if whole else 0.0


def _norm(v: Any) -> str:
    return (str(v) if v is not None else "").strip().lower()


# --------------------------------------------------- section 1: executive

async def _power_flow_summary(month: Optional[str], factor: float = 1.0) -> Dict[str, Any]:
    """
    The 'Percentage sharing of Generator' table plus the Gross-Input build-up.

    Derived directly from Plant_Purchase_Master so it can never disagree with
    section 2's grand total:

        Central Thermal    = ppa_type Central,  category NOT renewable
        Central Renewable  = ppa_type Central,  category renewable      (= R13)
        Intra Thermal      = ppa_type Intra,    category NOT renewable
        Intra Renewable    = ppa_type Intra,    category renewable
        Embedded (DISCOM)  = ppa_type "Intra Renewable ... DISCOM Network" (= R20)
        PMC / PTC Sale     = ppa_type SALE  (stored negative; shown as magnitude)

        Gross Input  = CT + CR + IT + IR + Embedded
        Net Purchase = Gross Input − |Sale|
    """
    rows = await get_sheet_data(settings.SHEET_POWER_PURCHASE)
    if month:
        rows = [r for r in rows if str(r.get("year_month", ""))[:7] == month]
    # `factor` is 1.0 for the published (holding-level) booklet. It is only ever
    # non-1 in the opt-in DISCOM-allocated edition, where it is exactly the
    # sharing ratio the transmission engine already applied to every other figure.

    embedded_ppa = transmission_analytics.EMBEDDED_PPA
    buckets: Dict[str, float] = defaultdict(float)

    for r in rows:
        ppa = _norm(r.get("ppa_type"))
        cat = _norm(r.get("ppa_category"))
        val = coerce_float(r, "energy_quantum") * factor
        is_re = "renewable" in cat

        if ppa == embedded_ppa:
            buckets["embedded"] += val
        elif ppa == "central":
            buckets["central_re" if is_re else "central_thermal"] += val
        elif ppa == "intra":
            buckets["intra_re" if is_re else "intra_thermal"] += val
        elif ppa == "sale":
            buckets["sale"] += val  # negative in the sheet

        # Anything else (an unrecognised ppa_type) is intentionally left out of
        # the generator-share table but is still caught by the reconciliation
        # check below, so a silent data drift becomes visible rather than hidden.

    sale_abs = abs(buckets["sale"])
    gross_input = (
        buckets["central_thermal"] + buckets["central_re"]
        + buckets["intra_thermal"] + buckets["intra_re"] + buckets["embedded"]
    )
    net_purchase = gross_input - sale_abs

    table = [
        {"sector": "Central", "type": "Thermal", "volume_mu": _mu(buckets["central_thermal"])},
        {"sector": "Central", "type": "Renewable", "volume_mu": _mu(buckets["central_re"])},
        {"sector": "Intra", "type": "Thermal", "volume_mu": _mu(buckets["intra_thermal"])},
        {"sector": "Intra", "type": "Renewable", "volume_mu": _mu(buckets["intra_re"])},
        {"sector": "Intra", "type": "PMC/PTC Sale", "volume_mu": _mu(sale_abs)},
    ]
    denom = sum(abs(r["volume_mu"]) for r in table) or 1
    for r in table:
        r["share_pct"] = _pct(abs(r["volume_mu"]), denom)

    return {
        "table": table,
        "embedded_mu": _mu(buckets["embedded"]),
        "gross_input_mu": _mu(gross_input),
        "sale_mu": _mu(sale_abs),
        "net_purchase_mu": _mu(net_purchase),
        "gross_input_formula": (
            "Gross Input = Central Thermal + Central RE + Intra Thermal + Intra RE "
            "+ Renewable Connected to DISCOM Network"
        ),
        "gross_input_worked": (
            f"Gross Input = {_fmt(buckets['central_thermal'])} + {_fmt(buckets['central_re'])} + "
            f"{_fmt(buckets['intra_thermal'])} + {_fmt(buckets['intra_re'])} + "
            f"{_fmt(buckets['embedded'])} = {_fmt(gross_input)} MU"
        ),
        "net_purchase_worked": (
            f"Net Purchase = {_fmt(gross_input)} MU − {_fmt(sale_abs)} MU = {_fmt(net_purchase)} MU"
        ),
    }


def _discom_input_table(c: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Section 1.4 — the NBPDCL / SBPDCL split (R18 / R19), the SAME single source
    the AllocationChip already reads, so the booklet and the UI can never differ."""
    nb, sb = float(c.get("nbpdcl_drawal", 0)), float(c.get("sbpdcl_drawal", 0))
    total = nb + sb
    return [
        {"discom": "NBPDCL (North)", "input_energy_mu": _mu(nb), "ratio_pct": _pct(nb, total)},
        {"discom": "SBPDCL (South)", "input_energy_mu": _mu(sb), "ratio_pct": _pct(sb, total)},
        {"discom": "Total", "input_energy_mu": _mu(total), "ratio_pct": 100.0, "is_total": True},
    ]


# ------------------------------------------------------ section 3: losses

def _loss_narrative(c: Dict[str, Any], flow: Dict[str, Any], month_label: str) -> Dict[str, Any]:
    """
    Section 3 reproduced verbatim, with every figure substituted live from the
    CTL/STL engine. Formula strings match the printed booklet word-for-word so a
    reviewer can diff the generated document against last month's by eye.
    """
    central = float(c["central_power"])
    ren_central = float(c["renewable_central"])
    r11 = float(c["actual_drawal_boundary"])
    ctl = float(c["ctl"])
    ctl_den = central - ren_central

    intra = float(c["intrastate_purchase"])
    r17 = float(c["total_power_bsptcl"])
    nb, sb = float(c["nbpdcl_drawal"]), float(c["sbpdcl_drawal"])
    embedded = float(c["embedded_generation"])
    pros = float(c["prosumer_sale"])
    rail = float(c["railway_overdrawal"])
    nepal = float(c.get("nepal_drawal", 0.0))
    r21 = float(c["discom_drawal"])
    r24 = float(c["total_drawal_bsptcl"])
    stl = float(c["stl"])

    return {
        "gross_input_formula": flow["gross_input_formula"],
        "gross_input_worked": flow["gross_input_worked"],
        "net_purchase_formula": "Net Purchase = Gross Input − Sale Deductions (IEX / Bilateral Market Cleared)",
        "net_purchase_worked": flow["net_purchase_worked"],
        "ctl_formula": (
            "CTL Loss Volume = Power From Central Sector − Actual Drawal At Bihar Boundary "
            "(Excluding Local Injection)"
        ),
        "ctl_pct_formula": "CTL % = Loss Volume / (Power From Central Sector − Renewable Central Injections)",
        "ctl_worked": f"Central Transmission Loss = {_fmt(central)} MU − {_fmt(r11)} MU = {_fmt(ctl)} MU",
        "ctl_pct_worked": (
            f"CTL % = {_fmt(ctl)} / ({_fmt(central)} − {_fmt(ren_central)}) = "
            f"{_fmt(ctl)} / {_fmt(ctl_den)} = {_fmt(c['ctl_pct'])}%"
        ),
        "stl_injected_formula": "Total Power Injected at BSPTCL = Total Actual Drawal at Boundary + Intrastate Purchase",
        "stl_drawal_formula": "Total DISCOM Drawal = DISCOMs Net Drawal + Prosumer Sales + Railway Overdrawal + Sale to Nepal",
        "stl_formula": "STL = Total Power Injected at BSPTCL − Total DISCOM Drawal",
        "stl_worked": [
            f"Total Power Injected = {_fmt(r11)} MU (Boundary Actual) + {_fmt(intra)} MU "
            f"(Intrastate Purchase) = {_fmt(r17)} MU",
            f"Net DISCOM Demand (NB + SB) = {_fmt(nb)} MU + {_fmt(sb)} MU − {_fmt(embedded)} MU = {_fmt(r21)} MU",
            f"Total DISCOM Drawal = {_fmt(r21)} MU + {_fmt(pros)} MU + {_fmt(rail)} MU + {_fmt(nepal)} MU (Sale to Nepal) = {_fmt(r24)} MU",
            f"STL = {_fmt(r17)} MU − {_fmt(r24)} MU = {_fmt(stl)} MU",
        ],
        "stl_pct_worked": f"STL % = ({_fmt(stl)} / {_fmt(r17)}) × 100 = {_fmt(c['stl_pct'])}%",
        "period_note": f"Based on the data received from different sources for the month {month_label}:-",
    }


# ------------------------------------------------- section 9: feeder detail

def _feeder_detail(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Circle > Division > Substation > Feeder detail with a bold subtotal row after
    every division — the exact layout of the printed section 9.

    `meter` and `sharing` degrade gracefully when the sheet does not carry those
    columns (see METER_KEYS / SHARING_KEYS).
    """
    grouped: Dict[tuple, List[Dict[str, Any]]] = defaultdict(list)
    for r in rows:
        key = (r.get("circle") or "Unknown", r.get("division") or "Unknown")
        grouped[key].append(r)

    out: List[Dict[str, Any]] = []
    grand = 0.0
    meter_found = False
    sharing_found = False

    for (circle, division) in sorted(grouped):
        subtotal = 0.0
        for r in sorted(
            grouped[(circle, division)],
            key=lambda x: (str(x.get("substation") or ""), str(x.get("feeder_name") or "")),
        ):
            val = coerce_float(r, "energy_quantum")
            subtotal += val
            meter = _first_key(r, METER_KEYS)
            sharing = _first_key(r, SHARING_KEYS)
            meter_found = meter_found or meter is not None
            sharing_found = sharing_found or sharing is not None
            out.append({
                "circle": circle,
                "division": division,
                "substation": r.get("substation") or "",
                "feeder": r.get("feeder_name") or "",
                "meter": str(meter) if meter is not None else "",
                "sharing": _sharing_label(sharing),
                "mu": _mu(val),
            })
        out.append({
            "circle": "", "division": f"{division} Total", "substation": "",
            "feeder": "", "meter": "", "sharing": "",
            "mu": _mu(subtotal), "is_subtotal": True,
        })
        grand += subtotal

    return {
        "rows": out,
        "grand_total_mu": _mu(grand),
        "meter_column_available": meter_found,
        "sharing_column_available": sharing_found,
    }


def _sharing_label(v: Any) -> str:
    """Accepts 100, '100', 1.0, '100%' — always renders as '100%'."""
    if v in (None, ""):
        return "100%"
    s = str(v).strip()
    if s.endswith("%"):
        return s
    try:
        f = float(s)
    except ValueError:
        return s
    if 0 < f <= 1:  # stored as a fraction
        f *= 100
    return f"{f:.0f}%"


# --------------------------------------------------------------- reconcile

def _reconciliation(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Self-audit rows printed at the back of the booklet. Anything that fails here
    means a sheet drifted — the booklet still generates, but flags itself rather
    than shipping a silently-wrong number.

    Tolerance is 0.01% (the project's standing allocation validation rule).
    """
    def check(name: str, a: float, b: float, note: str = "") -> Dict[str, Any]:
        diff = abs(a - b)
        tol = max(abs(b) * 0.0001, 0.01)
        return {
            "check": name, "computed": _mu(a), "expected": _mu(b),
            "difference": round(diff, 4), "status": "PASS" if diff <= tol else "REVIEW",
            "note": note,
        }

    flow = payload["section_1"]["power_flow"]
    s2 = payload["section_2"]
    s5 = payload["section_5"]
    s6 = payload["section_8"]
    s9 = payload["section_9"]
    disc = payload["section_1"]["discom_input"]
    detail_discom = payload["meta"]["discom"].upper()
    own = next((d["input_energy_mu"] for d in disc if d["discom"].upper().startswith(detail_discom)), 0.0)

    return [
        check("Net Purchase = Section 2 grand total", flow["net_purchase_mu"], s2["grand_total_mu"],
              "Gross Input − Sale must equal the plant-wise purchase table."),
        check("Circle total = Division total", s5["grand_total_mu"], s6["grand_total_mu"],
              "Section 5 and Section 8 aggregate the same input_energy rows."),
        check("Division total = Feeder detail total", s6["grand_total_mu"], s9["grand_total_mu"],
              "Section 9 must roll up exactly into Section 8."),
        check(f"Circle total = {detail_discom} input energy (R18/R19)", s5["grand_total_mu"], own,
              f"Circle-wise consumption is {detail_discom}'s own drawal."),
    ]


# ------------------------------------------------------------------- build

async def build_payload(
    month: Optional[str] = None,
    discom: str = "NBPDCL",
    include_detail: bool = True,
    allocate: bool = False,
) -> Dict[str, Any]:
    """
    Build the complete booklet payload for one billing month.

    SCOPE — this mirrors the published booklet exactly and is the single most
    important thing to get right:

        Sections 1-4 (executive summary, power purchase, CTL/STL, prosumers) are
        HOLDING-LEVEL (BSPHCL). The printed booklet's section 2 grand total is the
        whole state's net purchase, and CTL/STL are state-boundary losses — neither
        is a per-DISCOM figure.

        Sections 5 / 8 / 9 (circle, division, feeder) are DISCOM-LEVEL and use that
        DISCOM's ACTUAL input_energy rows. Input Energy is the standing spec
        exception: actuals only, never sharing-ratio allocated.

        Section 1.3 shows BOTH DISCOMs side by side (R18 / R19) — the same single
        backend source the AllocationChip reads.

    Args:
        month: 'YYYY-MM'. When None, the latest month with purchase energy is used.
        discom: whose circle/division/feeder detail is printed. 'NBPDCL' | 'SBPDCL'.
        include_detail: set False to skip section 9 (thousands of feeder rows) when
                only a summary preview is needed.
        allocate: opt-in variant that ALSO scales sections 1-4 to `discom` using the
                existing sharing-ratio allocation engine. Off by default, because the
                published booklet does not do this. Turn it on only for an internal
                DISCOM-only edition, and note that section 2 will then no longer tie
                to the state's net purchase.
    """
    discom = (discom or "NBPDCL").strip().upper()
    if discom not in VALID_DISCOMS:
        raise BookletError(
            f"Unknown DISCOM '{discom}'. Expected one of: {', '.join(VALID_DISCOMS)}.",
            list(VALID_DISCOMS),
            status=400,
        )

    balance_discom = discom if allocate else "BSPHCL"

    # transmission_analytics._month_filter takes an FY start-year plus a 2-digit
    # calendar month — NOT a 'YYYY-MM' string. Split the caller's month here so the
    # booklet resolves to exactly the same period the Transmission dashboard shows.
    #
    # An explicitly requested month is VALIDATED, not coerced. The underlying
    # _month_filter falls back to the latest month when it cannot resolve a
    # request, which is the right behaviour for a dashboard (something always
    # renders) but the wrong behaviour here: a typo would silently hand someone a
    # booklet for a different month, correctly formatted and completely wrong.
    # A booklet is a signed regulatory document, so a bad month must fail loudly.
    if month:
        req = str(month).strip()[:7]
        # Structural check first: YYYY-MM shape with a real calendar month 01-12.
        # Without the range check, '2026-13' looks well-formed and slips through to
        # the availability lookup, surfacing as a confusing 404 ("no data") for
        # what is really malformed input (400).
        valid = len(req) == 7 and req[4] == "-" and (req[:4] + req[5:]).isdigit()
        if valid:
            valid = 1 <= int(req[5:7]) <= 12
        if not valid:
            raise BookletError(f"Malformed month '{month}'. Expected YYYY-MM with month 01-12, e.g. 2026-05.")
        available = (await transmission_analytics.get_filter_options()).get("months", [])
        if req not in available:
            raise BookletError(
                f"No booklet data for {req}. A month is available once "
                f"Plant_Purchase_Master carries energy for it.",
                available,
                status=404,
            )
        tx_filters = {"year": fy_start_year(req), "month": req[5:7], "discom": balance_discom}
    else:
        tx_filters = {"discom": balance_discom}  # -> latest month with purchase energy

    c = await transmission_analytics.get_kpis(tx_filters)
    resolved_month = c.get("period") or (str(month)[:7] if month else None)
    month_label = _month_label(resolved_month)

    # Every non-transmission section is filtered to the SAME resolved month, so a
    # None month can never mix "latest month" losses with "all months" tables.
    ym = resolved_month
    mm = ym[5:7] if ym and len(ym) >= 7 else None
    fy = fy_start_year(ym) if ym else None
    base_filters = {"year": fy, "month": mm}

    # ---- section 1
    #
    # The factor MUST come from the same place purchase_analytics gets it
    # (app.core.sharing.allocation_factor), not from the transmission engine's
    # own factor. The sharing engine rounds the ratio to 2 dp before applying it,
    # so sourcing it anywhere else leaves section 1's Gross-Input build-up a few
    # hundredths of a percent away from section 2's table — enough to trip the
    # reconciliation check. Taking one factor from one place makes them agree by
    # construction rather than by luck. In the default (published) booklet this is
    # 1.0 on both sides anyway.
    pf_factor = await allocation_factor({**base_filters, "discom": balance_discom})
    flow = await _power_flow_summary(ym, pf_factor)

    # ---- section 2 (page_size high enough for the full plant list)
    purchase = await purchase_analytics.get_table_data(
        {**base_filters, "discom": balance_discom}, page=1, page_size=5000
    )
    p_rows = [
        {
            "sl": i + 1,
            "voltage": r.get("voltage_level") or "",
            "ppa": r.get("ppa_category") or "",
            "type": r.get("ppa_type") or "",
            "plant_nature": r.get("plant_type") or "",
            "plant_name": r.get("plant_name") or "",
            "mu": _mu(coerce_float(r, "energy_quantum")),
        }
        for i, r in enumerate(purchase.get("rows", []))
    ]

    # ---- section 4
    prosumer = await prosumer_analytics.get_table_data(base_filters, page=1, page_size=5000)
    pros_rows = [
        {"plant_name": r.get("plant_name") or "", "mu": _mu(coerce_float(r, "sales_unit"))}
        for r in prosumer.get("rows", [])
    ]

    # ---- sections 5 / 8 / 9  (input_energy — actuals, never allocated)
    ie_filters = {**base_filters, "discom_name": discom}
    circles = await input_energy_analytics.get_circle_ranking(ie_filters)
    circle_total = sum(float(x.get("energy_quantum", 0)) for x in circles)
    circle_rows = [
        {"circle": x.get("circle"), "mu": _mu(x.get("energy_quantum")),
         "share_pct": _pct(float(x.get("energy_quantum", 0)), circle_total)}
        for x in circles
    ]

    divisions = await input_energy_analytics.get_treemap(ie_filters)
    div_rows = sorted(
        [{"circle": d.get("circle"), "division": d.get("division"), "mu": _mu(d.get("energy_quantum"))}
         for d in divisions],
        key=lambda x: (x["circle"], x["division"]),
    )

    if include_detail:
        raw = input_energy_analytics._apply_filters(await input_energy_analytics.get_raw_data(), ie_filters)
        detail = _feeder_detail(raw)
    else:
        # Not "False" — unknown. The columns were never inspected because the
        # section was skipped, and reporting False here would look like a
        # definitive answer to the very question §9's warning banner asks.
        detail = {"rows": [], "grand_total_mu": _mu(sum(d["mu"] for d in div_rows)),
                  "meter_column_available": None, "sharing_column_available": None,
                  "skipped": True}

    ranked = sorted(circle_rows, key=lambda x: x["mu"], reverse=True)

    payload: Dict[str, Any] = {
        "meta": {
            "title": "Energy Accounting Booklet",
            "period": resolved_month,
            "period_label": month_label,
            "fy_label": fy_label(fy) if fy else "",
            "discom": discom,
            "balance_scope": balance_discom,
            "allocated": allocate,
            "entity": "Bihar State Power Holding Company Limited",
            "section_numbers": SECTION_NUMBERS,
        },
        "section_1": {
            "heading": "Executive Summary",
            "intro": (
                f"This section presents the energy balance of Bihar State Power Holding "
                f"Company Limited for the billing month of {month_label}."
            ),
            "power_flow": flow,
            "ctl_stl": {
                "ctl_mu": _mu(c["ctl"]), "ctl_pct": _mu(c["ctl_pct"]),
                "stl_mu": _mu(c["stl"]), "stl_pct": _mu(c["stl_pct"]),
                "total_loss_mu": _mu(c["total_loss"]), "total_loss_pct": _mu(c["total_loss_pct"]),
            },
            "discom_input": _discom_input_table(c),
        },
        "section_2": {
            "heading": "Power Purchase Summary (Source wise / Category wise)",
            "rows": p_rows,
            "grand_total_mu": _mu(sum(r["mu"] for r in p_rows)),
        },
        "section_3": {
            "heading": "Energy Flow & Loss Calculation",
            **_loss_narrative(c, flow, month_label),
        },
        "section_4": {
            "heading": "Sale to Prosumers",
            "intro": f"Energy sold to prosumers for the month {month_label} is as follows:-",
            "rows": pros_rows,
            "grand_total_mu": _mu(sum(r["mu"] for r in pros_rows)),
        },
        "section_5": {
            "heading": "Circle-wise Consumption",
            "highest": ranked[0]["circle"] if ranked else "",
            "lowest": ranked[-1]["circle"] if ranked else "",
            "rows": circle_rows,
            "grand_total_mu": _mu(circle_total),
        },
        "section_8": {
            "heading": "Division-wise Consumption",
            "rows": div_rows,
            "grand_total_mu": _mu(sum(d["mu"] for d in div_rows)),
            # Sale to Nepal shown as an addendum line under the NBPDCL grand total
            # (energy NBPDCL supplied to and bills Nepal). It is NOT part of the
            # division sum, so the reconciliation checks are unaffected.
            "nepal_sale_mu": _mu(c.get("nepal_drawal", 0.0)),
        },
        "section_9": {
            "heading": "Detailed Calculation of Circle / Division wise Input Energy",
            "intro": (
                "On the basis of the SAMAST portal of BSPTCL and monthly energy meter readings "
                "from all AMISPs, the detailed calculation of division-wise input energy is:-"
            ),
            **detail,
        },
    }

    payload["reconciliation"] = _reconciliation(payload)
    return payload
