"""
Energy Accounting Booklet — API routes
======================================

Additive router. Nothing here touches an existing endpoint, field or contract.

    GET /api/v1/booklet/periods        -> months available for generation
    GET /api/v1/booklet/data           -> the full payload as JSON (preview / debug)
    GET /api/v1/booklet/validate       -> just the reconciliation checks (fast pre-flight)
    GET /api/v1/booklet/generate       -> the .docx, streamed as a download
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from app.services import booklet_builder, transmission_analytics
from app.services.booklet_builder import BookletError

logger = logging.getLogger("nbpdcl.booklet")

router = APIRouter(prefix="/booklet", tags=["Energy Accounting Booklet"])

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


async def _build(**kwargs):
    """Translate a bad-input BookletError into a 4xx instead of letting the global
    handler turn it into an opaque 500."""
    try:
        return await booklet_builder.build_payload(**kwargs)
    except BookletError as exc:
        raise HTTPException(
            status_code=exc.status,
            detail={"message": exc.message, "available": exc.available},
        ) from exc


@router.get("/periods")
async def periods():
    """Months that can be booked, newest first, plus the default (latest)."""
    options = await transmission_analytics.get_filter_options()
    months = options.get("months", [])
    return {
        "months": sorted(months, reverse=True),
        "default": max(months) if months else None,
        "discoms": ["NBPDCL", "SBPDCL", "BSPHCL"],
    }


@router.get("/data")
async def data(
    month: Optional[str] = Query(None, description="YYYY-MM; defaults to the latest month with purchase energy"),
    discom: str = Query("NBPDCL"),
    include_detail: bool = Query(True, description="Include the feeder-level section 9"),
    allocate: bool = Query(False, description="Opt-in: scale sections 1-4 to the DISCOM's sharing ratio"),
):
    return await _build(month=month, discom=discom, include_detail=include_detail, allocate=allocate)


@router.get("/validate")
async def validate(
    month: Optional[str] = Query(None),
    discom: str = Query("NBPDCL"),
):
    """Pre-flight check — run this before generating so a bad month is caught early."""
    payload = await _build(month=month, discom=discom, include_detail=False)
    checks = payload["reconciliation"]
    return {
        "period": payload["meta"]["period"],
        "period_label": payload["meta"]["period_label"],
        "discom": discom,
        "ok": all(c["status"] == "PASS" for c in checks),
        "checks": checks,
    }


@router.get("/generate")
async def generate(
    month: Optional[str] = Query(None),
    discom: str = Query("NBPDCL"),
    include_detail: bool = Query(True),
    allocate: bool = Query(False),
):
    """Build and stream the Word booklet."""
    try:
        from app.services import booklet_docx
    except ImportError as exc:  # python-docx not installed
        logger.exception("python-docx missing")
        raise HTTPException(
            status_code=503,
            detail="Booklet rendering requires python-docx. Run: pip install -r requirements.txt",
        ) from exc

    payload = await _build(month=month, discom=discom, include_detail=include_detail, allocate=allocate)

    # render() is synchronous CPU work (python-docx builds the whole XML tree in
    # memory). Calling it directly on the event loop blocks EVERY other request
    # for its duration — measured at ~0.9 s for a full feeder-level booklet, so
    # five concurrent generates would stall the dashboards for five seconds.
    # Hand it to the threadpool so the loop stays responsive.
    blob = await run_in_threadpool(booklet_docx.render, payload)
    name = booklet_docx.filename(payload)

    failed = [c["check"] for c in payload["reconciliation"] if c["status"] != "PASS"]
    if failed:
        logger.warning("Booklet %s generated with %s reconciliation warning(s): %s",
                       name, len(failed), "; ".join(failed))

    return Response(
        content=blob,
        media_type=DOCX_MIME,
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            # Surfaced so the UI can warn without re-parsing the document.
            "X-Booklet-Reconciliation": "warn" if failed else "pass",
        },
    )
