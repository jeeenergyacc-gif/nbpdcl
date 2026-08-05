"""
Generic Sheet Data Routes
Provides raw + basic aggregated data for dashboards whose dedicated
analytics engines will be delivered in the next build phase
(Bihar Deviation, Input Energy, Railway, Prosumer).
Ensures every dashboard has live, real Google Sheets data from day one.
"""
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.core.config import get_settings
from app.services.sheets_service import get_sheet_data, coerce_float, SheetFetchError

router = APIRouter(prefix="/sheets", tags=["Sheets (Generic)"])
settings = get_settings()

SHEET_MAP = {
    "deviation": settings.SHEET_UI_DEVIATION,
    "input-energy": settings.SHEET_INPUT_ENERGY,
    "railway": settings.SHEET_RAILWAY_POWER,
    "prosumer": settings.SHEET_PROSUMER_SALES,
}

VALUE_COLUMN = {
    "deviation": "deviation_energy",
    "input-energy": "energy_quantum",
    "railway": "energy_quantum",
    "prosumer": "sales_unit",
}

DATE_COLUMN = {
    "deviation": "entry_date",
    "input-energy": "year_month",
    "railway": "reporting_month",
    "prosumer": "year_month",
}


@router.get("/{module}/raw")
async def raw_data(module: str, limit: int = Query(500, le=5000)):
    if module not in SHEET_MAP:
        raise HTTPException(status_code=404, detail=f"Unknown module '{module}'")
    try:
        data = await get_sheet_data(SHEET_MAP[module])
    except SheetFetchError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"module": module, "sheet": SHEET_MAP[module], "count": len(data), "rows": data[:limit]}


@router.get("/{module}/summary")
async def summary(module: str):
    if module not in SHEET_MAP:
        raise HTTPException(status_code=404, detail=f"Unknown module '{module}'")
    try:
        data = await get_sheet_data(SHEET_MAP[module])
    except SheetFetchError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    value_col = VALUE_COLUMN[module]
    date_col = DATE_COLUMN[module]

    values = [coerce_float(r, value_col) for r in data]
    total = sum(values)

    trend_agg = defaultdict(float)
    for r in data:
        key = str(r.get(date_col, ""))[:7]
        if key:
            trend_agg[key] += coerce_float(r, value_col)
    trend = [{"period": k, "value": round(v, 3)} for k, v in sorted(trend_agg.items())]

    return {
        "module": module,
        "total_rows": len(data),
        "total_value": round(total, 3),
        "average_value": round(total / len(data), 3) if data else 0,
        "max_value": round(max(values), 3) if values else 0,
        "min_value": round(min(values), 3) if values else 0,
        "trend": trend,
    }
