"""
Bihar UI Deviation Dashboard API Routes
"""
from typing import Optional
from fastapi import APIRouter, Query

from app.services import deviation_analytics as analytics

router = APIRouter(prefix="/deviation", tags=["Bihar UI Deviation"])


def _filters(year: Optional[str], quarter: Optional[str], month: Optional[str], range_: Optional[str], discom: Optional[str] = None):
    return {"year": year, "quarter": quarter, "month": month, "range": range_, "discom": discom}


@router.get("/filters")
async def filter_options():
    return await analytics.get_filter_options()


@router.get("/kpis")
async def kpis(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, range: Optional[str] = Query(None), discom: Optional[str] = None):
    return await analytics.get_kpis(_filters(year, quarter, month, range, discom))


@router.get("/trend")
async def trend(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, range: Optional[str] = Query(None), discom: Optional[str] = None):
    return await analytics.get_trend(_filters(year, quarter, month, range, discom))


@router.get("/cumulative")
async def cumulative(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, range: Optional[str] = Query(None), discom: Optional[str] = None):
    return await analytics.get_cumulative(_filters(year, quarter, month, range, discom))


@router.get("/heatmap")
async def heatmap(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, range: Optional[str] = Query(None), discom: Optional[str] = None):
    return await analytics.get_heatmap(_filters(year, quarter, month, range, discom))


@router.get("/distribution")
async def distribution(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, range: Optional[str] = Query(None), discom: Optional[str] = None):
    return await analytics.get_distribution(_filters(year, quarter, month, range, discom))


@router.get("/insights")
async def insights(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, range: Optional[str] = Query(None), discom: Optional[str] = None):
    return await analytics.get_insights(_filters(year, quarter, month, range, discom))


@router.get("/table")
async def table(page: int = 1, page_size: int = 50, year: Optional[str] = None, quarter: Optional[str] = None,
                 month: Optional[str] = None, range: Optional[str] = Query(None), discom: Optional[str] = None):
    return await analytics.get_table_data(_filters(year, quarter, month, range, discom), page, page_size)
