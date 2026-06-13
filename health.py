import time

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

_START_TIME = time.time()


class HealthResponse(BaseModel):
    status: str
    version: str
    uptime_seconds: float
    jobs_indexed: int = 0


@router.get("/health", response_model=HealthResponse, summary="Health check")
async def health_check() -> HealthResponse:
    """
    Returns service status, version, and uptime.
    Suitable for load-balancer / k8s liveness probes.
    """
    from app.core.config import settings
    from app.core.pipeline import _pipeline

    return HealthResponse(
        status="ok",
        version=settings.VERSION,
        uptime_seconds=round(time.time() - _START_TIME, 2),
        jobs_indexed=getattr(getattr(_pipeline, "matcher", None), "job_count", 0) if _pipeline else 0,
    )
