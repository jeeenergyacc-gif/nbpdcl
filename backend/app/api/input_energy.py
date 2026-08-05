"""
Input Energy Dashboard API Routes
"""
from typing import Optional
from fastapi import APIRouter

from app.services import input_energy_analytics as analytics

router = APIRouter(prefix="/input-energy", tags=["Input Energy"])


def _filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search):
    return {
        "year": year, "quarter": quarter, "month": month,
        "discom_name": discom_name, "circle": circle, "division": division,
        "substation": substation, "feeder_name": feeder_name, "feeder_type": feeder_type,
        "search": search,
    }


COMMON_PARAMS = "year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None, discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None, substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None, search: Optional[str] = None"


@router.get("/filters")
async def filter_options():
    return await analytics.get_filter_options()


@router.get("/kpis")
async def kpis(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
               discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
               substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
               search: Optional[str] = None):
    return await analytics.get_kpis(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/trend")
async def trend(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                 discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                 substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                 search: Optional[str] = None):
    return await analytics.get_monthly_trend(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/discom-share")
async def discom_share(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                        discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                        substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                        search: Optional[str] = None):
    return await analytics.get_discom_share(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/circle-ranking")
async def circle_ranking(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                          discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                          substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                          search: Optional[str] = None):
    return await analytics.get_circle_ranking(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/division-ranking")
async def division_ranking(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                            discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                            substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                            search: Optional[str] = None):
    return await analytics.get_division_ranking(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/circle-heatmap")
async def circle_heatmap(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                          discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                          substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                          search: Optional[str] = None):
    return await analytics.get_circle_heatmap(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/division-heatmap")
async def division_heatmap(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                            discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                            substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                            search: Optional[str] = None):
    return await analytics.get_division_heatmap(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/treemap")
async def treemap(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                   discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                   substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                   search: Optional[str] = None):
    return await analytics.get_treemap(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/sunburst")
async def sunburst(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                    discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                    substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                    search: Optional[str] = None):
    return await analytics.get_sunburst(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/sankey")
async def sankey(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                  discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                  substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                  search: Optional[str] = None):
    return await analytics.get_sankey(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/top-feeders")
async def top_feeders(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                       discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                       substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                       search: Optional[str] = None):
    return await analytics.get_top_feeders(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/bottom-feeders")
async def bottom_feeders(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                          discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                          substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                          search: Optional[str] = None):
    return await analytics.get_bottom_feeders(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/bubble")
async def bubble(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                  discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                  substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                  search: Optional[str] = None):
    return await analytics.get_bubble(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/scatter")
async def scatter(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                   discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                   substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                   search: Optional[str] = None):
    return await analytics.get_scatter(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/pareto")
async def pareto(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                  discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                  substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                  search: Optional[str] = None):
    return await analytics.get_pareto(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/waterfall")
async def waterfall(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                     discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                     substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                     search: Optional[str] = None):
    return await analytics.get_waterfall(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/gauge")
async def gauge(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                 discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                 substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                 search: Optional[str] = None):
    return await analytics.get_gauge(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/insights")
async def insights(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                    discom_name: Optional[str] = None, circle: Optional[str] = None, division: Optional[str] = None,
                    substation: Optional[str] = None, feeder_name: Optional[str] = None, feeder_type: Optional[str] = None,
                    search: Optional[str] = None):
    return await analytics.get_insights(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search))


@router.get("/table")
async def table(page: int = 1, page_size: int = 50, year: Optional[str] = None, quarter: Optional[str] = None,
                 month: Optional[str] = None, discom_name: Optional[str] = None, circle: Optional[str] = None,
                 division: Optional[str] = None, substation: Optional[str] = None, feeder_name: Optional[str] = None,
                 feeder_type: Optional[str] = None, search: Optional[str] = None):
    return await analytics.get_table_data(_filters(year, quarter, month, discom_name, circle, division, substation, feeder_name, feeder_type, search), page, page_size)
