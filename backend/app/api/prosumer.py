"""
Prosumer Sales Dashboard API Routes
"""
from typing import Optional
from fastapi import APIRouter

from app.services import prosumer_analytics as analytics

router = APIRouter(prefix="/prosumer", tags=["Prosumer Sales"])


def _f(year, quarter, month, plant_type, voltage_level, ppa_type, plant_name, search, min_sales, max_sales, discom=None):
    return {
        "year": year, "quarter": quarter, "month": month, "plant_type": plant_type,
        "voltage_level": voltage_level, "ppa_type": ppa_type, "plant_name": plant_name,
        "search": search, "min_sales": min_sales, "max_sales": max_sales, "discom": discom,
    }


@router.get("/filters")
async def filter_options():
    return await analytics.get_filter_options()


@router.get("/kpis")
async def kpis(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
               plant_type: Optional[str] = None, voltage_level: Optional[str] = None, ppa_type: Optional[str] = None,
               plant_name: Optional[str] = None, search: Optional[str] = None, min_sales: Optional[str] = None, max_sales: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_kpis(_f(year, quarter, month, plant_type, voltage_level, ppa_type, plant_name, search, min_sales, max_sales, discom))


@router.get("/trend")
async def trend(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                 plant_type: Optional[str] = None, voltage_level: Optional[str] = None, ppa_type: Optional[str] = None,
                 plant_name: Optional[str] = None, search: Optional[str] = None, min_sales: Optional[str] = None, max_sales: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_monthly_trend(_f(year, quarter, month, plant_type, voltage_level, ppa_type, plant_name, search, min_sales, max_sales, discom))


@router.get("/plant-type-contribution")
async def plant_type_contribution(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                                   plant_type: Optional[str] = None, voltage_level: Optional[str] = None, ppa_type: Optional[str] = None,
                                   plant_name: Optional[str] = None, search: Optional[str] = None, min_sales: Optional[str] = None, max_sales: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_plant_type_contribution(_f(year, quarter, month, plant_type, voltage_level, ppa_type, plant_name, search, min_sales, max_sales, discom))


@router.get("/top10")
async def top10(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                 plant_type: Optional[str] = None, voltage_level: Optional[str] = None, ppa_type: Optional[str] = None,
                 plant_name: Optional[str] = None, search: Optional[str] = None, min_sales: Optional[str] = None, max_sales: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_top10_plants(_f(year, quarter, month, plant_type, voltage_level, ppa_type, plant_name, search, min_sales, max_sales, discom))


@router.get("/voltage-sales")
async def voltage_sales(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                         plant_type: Optional[str] = None, voltage_level: Optional[str] = None, ppa_type: Optional[str] = None,
                         plant_name: Optional[str] = None, search: Optional[str] = None, min_sales: Optional[str] = None, max_sales: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_voltage_wise_sales(_f(year, quarter, month, plant_type, voltage_level, ppa_type, plant_name, search, min_sales, max_sales, discom))


@router.get("/type-voltage-heatmap")
async def type_voltage_heatmap(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                                plant_type: Optional[str] = None, voltage_level: Optional[str] = None, ppa_type: Optional[str] = None,
                                plant_name: Optional[str] = None, search: Optional[str] = None, min_sales: Optional[str] = None, max_sales: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_type_voltage_heatmap(_f(year, quarter, month, plant_type, voltage_level, ppa_type, plant_name, search, min_sales, max_sales, discom))


@router.get("/treemap")
async def treemap(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                   plant_type: Optional[str] = None, voltage_level: Optional[str] = None, ppa_type: Optional[str] = None,
                   plant_name: Optional[str] = None, search: Optional[str] = None, min_sales: Optional[str] = None, max_sales: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_treemap(_f(year, quarter, month, plant_type, voltage_level, ppa_type, plant_name, search, min_sales, max_sales, discom))


@router.get("/bubble")
async def bubble(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                  plant_type: Optional[str] = None, voltage_level: Optional[str] = None, ppa_type: Optional[str] = None,
                  plant_name: Optional[str] = None, search: Optional[str] = None, min_sales: Optional[str] = None, max_sales: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_bubble(_f(year, quarter, month, plant_type, voltage_level, ppa_type, plant_name, search, min_sales, max_sales, discom))


@router.get("/monthly-heatmap")
async def monthly_heatmap(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                           plant_type: Optional[str] = None, voltage_level: Optional[str] = None, ppa_type: Optional[str] = None,
                           plant_name: Optional[str] = None, search: Optional[str] = None, min_sales: Optional[str] = None, max_sales: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_monthly_heatmap(_f(year, quarter, month, plant_type, voltage_level, ppa_type, plant_name, search, min_sales, max_sales, discom))


@router.get("/waterfall")
async def waterfall(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                     plant_type: Optional[str] = None, voltage_level: Optional[str] = None, ppa_type: Optional[str] = None,
                     plant_name: Optional[str] = None, search: Optional[str] = None, min_sales: Optional[str] = None, max_sales: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_waterfall(_f(year, quarter, month, plant_type, voltage_level, ppa_type, plant_name, search, min_sales, max_sales, discom))


@router.get("/sankey")
async def sankey(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                  plant_type: Optional[str] = None, voltage_level: Optional[str] = None, ppa_type: Optional[str] = None,
                  plant_name: Optional[str] = None, search: Optional[str] = None, min_sales: Optional[str] = None, max_sales: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_sankey(_f(year, quarter, month, plant_type, voltage_level, ppa_type, plant_name, search, min_sales, max_sales, discom))


@router.get("/insights")
async def insights(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                    plant_type: Optional[str] = None, voltage_level: Optional[str] = None, ppa_type: Optional[str] = None,
                    plant_name: Optional[str] = None, search: Optional[str] = None, min_sales: Optional[str] = None, max_sales: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_insights(_f(year, quarter, month, plant_type, voltage_level, ppa_type, plant_name, search, min_sales, max_sales, discom))


@router.get("/table")
async def table(page: int = 1, page_size: int = 50, year: Optional[str] = None, quarter: Optional[str] = None,
                 month: Optional[str] = None, plant_type: Optional[str] = None, voltage_level: Optional[str] = None,
                 ppa_type: Optional[str] = None, plant_name: Optional[str] = None, search: Optional[str] = None,
                 min_sales: Optional[str] = None, max_sales: Optional[str] = None, discom: Optional[str] = None):
    return await analytics.get_table_data(_f(year, quarter, month, plant_type, voltage_level, ppa_type, plant_name, search, min_sales, max_sales, discom), page, page_size)
