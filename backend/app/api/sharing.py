"""
Sharing-ratio meta + validation API.

Exposes the resolved ratio for a period, and validates the core allocation
identity (NBPDCL allocated + SBPDCL allocated == BSPHCL holding, within ±0.01%)
on the Power Purchase total as a representative allocatable dataset.
"""
from typing import Optional
from fastapi import APIRouter, Query

from app.core import sharing
from app.services import purchase_analytics as purchase

router = APIRouter(prefix="/sharing", tags=["Sharing Ratio"])


def _f(year, quarter, month, discom=None):
    return {"year": year, "quarter": quarter, "month": month, "discom": discom,
            "plant_type": None, "plant_name": None, "voltage_level": None,
            "ppa_category": None, "ppa_type": None, "search": None}


@router.get("/ratio")
async def ratio(discom: Optional[str] = "BSPHCL", year: Optional[str] = None,
                quarter: Optional[str] = None, month: Optional[str] = None):
    return await sharing.resolve_ratio(discom or "BSPHCL", _f(year, quarter, month, discom))


@router.get("/split")
async def split(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None):
    """Period NBPDCL/SBPDCL split in both MU and %, for the sharing-percentage chart."""
    return await sharing.resolve_split(_f(year, quarter, month))


@router.get("/validate")
async def validate(year: Optional[str] = None, quarter: Optional[str] = None, month: Optional[str] = None,
                   tolerance_pct: float = Query(0.01)):
    """NBPDCL alloc + SBPDCL alloc must equal BSPHCL holding within tolerance."""
    holding = (await purchase.get_kpis(_f(year, quarter, month, "BSPHCL")))["total_purchase_mu"]
    nb = (await purchase.get_kpis(_f(year, quarter, month, "NBPDCL")))["total_purchase_mu"]
    sb = (await purchase.get_kpis(_f(year, quarter, month, "SBPDCL")))["total_purchase_mu"]
    allocated_sum = round(nb + sb, 3)
    diff = abs(allocated_sum - holding)
    tol = abs(holding) * (tolerance_pct / 100.0)
    return {
        "dataset": "Power Purchase (representative)",
        "bsphcl_holding": round(holding, 3),
        "nbpdcl_allocated": round(nb, 3),
        "sbpdcl_allocated": round(sb, 3),
        "allocated_sum": allocated_sum,
        "difference": round(diff, 5),
        "tolerance": round(tol, 5),
        "tolerance_pct": tolerance_pct,
        "pass": diff <= tol,
    }
