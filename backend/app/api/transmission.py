"""
Transmission Losses (CTL / STL) Dashboard API Routes — BSPHCL methodology.
Computed on the backend from the existing operational sheets.
"""
from typing import Optional
from fastapi import APIRouter

from app.services import transmission_analytics as analytics

router = APIRouter(prefix="/transmission", tags=["Transmission Losses"])


def _f(year, quarter, month, discom=None):
    return {"year": year, "quarter": quarter, "month": month, "discom": discom}


@router.get("/dashboard")
async def dashboard(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, discom: Optional[str] = None):
    """Single-shot payload for the whole page — one request instead of nine."""
    return await analytics.get_dashboard(_f(year, quarter, month, discom))


@router.get("/filters")
async def filter_options():
    return await analytics.get_filter_options()


@router.get("/kpis")
async def kpis(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_kpis(_f(year, quarter, month, discom))


@router.get("/ctl-waterfall")
async def ctl_waterfall(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None):
    return await analytics.get_ctl_waterfall(_f(year, quarter, month))


@router.get("/stl-waterfall")
async def stl_waterfall(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None):
    return await analytics.get_stl_waterfall(_f(year, quarter, month))


@router.get("/ctl-sankey")
async def ctl_sankey(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None):
    return await analytics.get_ctl_sankey(_f(year, quarter, month))


@router.get("/stl-sankey")
async def stl_sankey(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None):
    return await analytics.get_stl_sankey(_f(year, quarter, month))


@router.get("/trend")
async def trend(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None):
    return await analytics.get_trend(_f(year, quarter, month))


@router.get("/balance-table")
async def balance_table(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_balance_table(_f(year, quarter, month, discom))


@router.get("/validation")
async def validation(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None):
    return await analytics.get_validation(_f(year, quarter, month))


@router.get("/insights")
async def insights(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None):
    return await analytics.get_insights(_f(year, quarter, month))
