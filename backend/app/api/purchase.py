"""
Power Purchase Dashboard API Routes
"""
from typing import Optional
from fastapi import APIRouter, Query

from app.services import purchase_analytics as analytics

router = APIRouter(prefix="/purchase", tags=["Power Purchase"])


def _filters(
    year: Optional[str] = Query(None),
    quarter: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    plant_type: Optional[str] = Query(None),
    plant_name: Optional[str] = Query(None),
    voltage_level: Optional[str] = Query(None),
    ppa_category: Optional[str] = Query(None),
    ppa_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    discom: Optional[str] = Query(None),
):
    return {
        "year": year, "quarter": quarter, "month": month,
        "plant_type": plant_type, "plant_name": plant_name,
        "voltage_level": voltage_level, "ppa_category": ppa_category,
        "ppa_type": ppa_type, "search": search, "discom": discom,
    }


@router.get("/filters")
async def filter_options():
    return await analytics.get_filter_options()


@router.get("/kpis")
async def kpis(f: dict = None, year: Optional[str] = None, quarter: Optional[str] = None,
               month: Optional[str] = None, plant_type: Optional[str] = None,
               plant_name: Optional[str] = None, voltage_level: Optional[str] = None,
               ppa_category: Optional[str] = None, ppa_type: Optional[str] = None,
               search: Optional[str] = None, discom: Optional[str] = None):
    filters = _filters(year, quarter, month, plant_type, plant_name, voltage_level, ppa_category, ppa_type, search, discom)
    return await analytics.get_kpis(filters)


@router.get("/trend")
async def trend(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                 plant_type: Optional[str] = None, plant_name: Optional[str] = None,
                 voltage_level: Optional[str] = None, ppa_category: Optional[str] = None,
                 ppa_type: Optional[str] = None, search: Optional[str] = None,
                 discom: Optional[str] = None):
    filters = _filters(year, quarter, month, plant_type, plant_name, voltage_level, ppa_category, ppa_type, search, discom)
    return await analytics.get_monthly_trend(filters)


@router.get("/plant-type-distribution")
async def plant_type_distribution(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                                   plant_type: Optional[str] = None, plant_name: Optional[str] = None,
                                   voltage_level: Optional[str] = None, ppa_category: Optional[str] = None,
                                   ppa_type: Optional[str] = None, search: Optional[str] = None,
                 discom: Optional[str] = None):
    filters = _filters(year, quarter, month, plant_type, plant_name, voltage_level, ppa_category, ppa_type, search, discom)
    return await analytics.get_plant_type_distribution(filters)


@router.get("/treemap")
async def treemap(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                   plant_type: Optional[str] = None, plant_name: Optional[str] = None,
                   voltage_level: Optional[str] = None, ppa_category: Optional[str] = None,
                   ppa_type: Optional[str] = None, search: Optional[str] = None,
                 discom: Optional[str] = None):
    filters = _filters(year, quarter, month, plant_type, plant_name, voltage_level, ppa_category, ppa_type, search, discom)
    return await analytics.get_treemap_data(filters)


@router.get("/sunburst")
async def sunburst(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                    plant_type: Optional[str] = None, plant_name: Optional[str] = None,
                    voltage_level: Optional[str] = None, ppa_category: Optional[str] = None,
                    ppa_type: Optional[str] = None, search: Optional[str] = None,
                 discom: Optional[str] = None):
    filters = _filters(year, quarter, month, plant_type, plant_name, voltage_level, ppa_category, ppa_type, search, discom)
    return await analytics.get_sunburst_data(filters)


@router.get("/sankey")
async def sankey(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                  plant_type: Optional[str] = None, plant_name: Optional[str] = None,
                  voltage_level: Optional[str] = None, ppa_category: Optional[str] = None,
                  ppa_type: Optional[str] = None, search: Optional[str] = None,
                 discom: Optional[str] = None):
    filters = _filters(year, quarter, month, plant_type, plant_name, voltage_level, ppa_category, ppa_type, search, discom)
    return await analytics.get_sankey_data(filters)


@router.get("/bubble")
async def bubble(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                  plant_type: Optional[str] = None, plant_name: Optional[str] = None,
                  voltage_level: Optional[str] = None, ppa_category: Optional[str] = None,
                  ppa_type: Optional[str] = None, search: Optional[str] = None,
                 discom: Optional[str] = None):
    filters = _filters(year, quarter, month, plant_type, plant_name, voltage_level, ppa_category, ppa_type, search, discom)
    return await analytics.get_bubble_data(filters)


@router.get("/top10")
async def top10(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                 plant_type: Optional[str] = None, plant_name: Optional[str] = None,
                 voltage_level: Optional[str] = None, ppa_category: Optional[str] = None,
                 ppa_type: Optional[str] = None, search: Optional[str] = None,
                 discom: Optional[str] = None):
    filters = _filters(year, quarter, month, plant_type, plant_name, voltage_level, ppa_category, ppa_type, search, discom)
    return await analytics.get_top10_plants(filters)


@router.get("/waterfall")
async def waterfall(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                     plant_type: Optional[str] = None, plant_name: Optional[str] = None,
                     voltage_level: Optional[str] = None, ppa_category: Optional[str] = None,
                     ppa_type: Optional[str] = None, search: Optional[str] = None,
                 discom: Optional[str] = None):
    filters = _filters(year, quarter, month, plant_type, plant_name, voltage_level, ppa_category, ppa_type, search, discom)
    return await analytics.get_waterfall_data(filters)


@router.get("/heatmap")
async def heatmap(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                   plant_type: Optional[str] = None, plant_name: Optional[str] = None,
                   voltage_level: Optional[str] = None, ppa_category: Optional[str] = None,
                   ppa_type: Optional[str] = None, search: Optional[str] = None,
                 discom: Optional[str] = None):
    filters = _filters(year, quarter, month, plant_type, plant_name, voltage_level, ppa_category, ppa_type, search, discom)
    return await analytics.get_heatmap_data(filters)


@router.get("/polar")
async def polar(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                 plant_type: Optional[str] = None, plant_name: Optional[str] = None,
                 voltage_level: Optional[str] = None, ppa_category: Optional[str] = None,
                 ppa_type: Optional[str] = None, search: Optional[str] = None,
                 discom: Optional[str] = None):
    filters = _filters(year, quarter, month, plant_type, plant_name, voltage_level, ppa_category, ppa_type, search, discom)
    return await analytics.get_polar_data(filters)


@router.get("/insights")
async def insights(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                    plant_type: Optional[str] = None, plant_name: Optional[str] = None,
                    voltage_level: Optional[str] = None, ppa_category: Optional[str] = None,
                    ppa_type: Optional[str] = None, search: Optional[str] = None,
                 discom: Optional[str] = None):
    filters = _filters(year, quarter, month, plant_type, plant_name, voltage_level, ppa_category, ppa_type, search, discom)
    return await analytics.get_executive_insights(filters)


@router.get("/table")
async def table(page: int = 1, page_size: int = 50,
                 year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                 plant_type: Optional[str] = None, plant_name: Optional[str] = None,
                 voltage_level: Optional[str] = None, ppa_category: Optional[str] = None,
                 ppa_type: Optional[str] = None, search: Optional[str] = None,
                 discom: Optional[str] = None):
    filters = _filters(year, quarter, month, plant_type, plant_name, voltage_level, ppa_category, ppa_type, search, discom)
    return await analytics.get_table_data(filters, page, page_size)
