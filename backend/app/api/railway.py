"""
Railway Power Dashboard API Routes
"""
from typing import Optional
from fastapi import APIRouter

from app.services import railway_analytics as analytics

router = APIRouter(prefix="/railway", tags=["Railway Power"])


def _f(year, quarter, month, metric, discom=None):
    return {"year": year, "quarter": quarter, "month": month, "metric": metric, "discom": discom}


@router.get("/filters")
async def filter_options():
    return await analytics.get_filter_options()


@router.get("/kpis")
async def kpis(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, metric: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_kpis(_f(year, quarter, month, metric, discom))


@router.get("/schedule-trend")
async def schedule_trend(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, metric: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_schedule_trend(_f(year, quarter, month, metric, discom))


@router.get("/schedule-vs-drawal")
async def schedule_vs_drawal(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, metric: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_schedule_vs_drawal(_f(year, quarter, month, metric, discom))


@router.get("/overdrawal")
async def overdrawal(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, metric: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_overdrawal_analysis(_f(year, quarter, month, metric, discom))


@router.get("/monthly-comparison")
async def monthly_comparison(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, metric: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_monthly_comparison(_f(year, quarter, month, metric, discom))


@router.get("/distribution")
async def distribution(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, metric: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_energy_distribution(_f(year, quarter, month, metric, discom))


@router.get("/gauge")
async def gauge(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, metric: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_gauge(_f(year, quarter, month, metric, discom))


@router.get("/waterfall")
async def waterfall(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, metric: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_waterfall(_f(year, quarter, month, metric, discom))


@router.get("/sankey")
async def sankey(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, metric: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_sankey(_f(year, quarter, month, metric, discom))


@router.get("/insights")
async def insights(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, metric: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_insights(_f(year, quarter, month, metric, discom))


@router.get("/table")
async def table(page: int = 1, page_size: int = 50, year: Optional[str] = None, quarter: Optional[str] = None,
                 month: Optional[str] = None, metric: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_table_data(_f(year, quarter, month, metric, discom), page, page_size)
