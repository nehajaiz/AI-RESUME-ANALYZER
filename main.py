"""
main.py — AI Resume Analyzer API
==================================
Entry point for the FastAPI application.

Run locally:
    python main.py
    # or
    uvicorn main:app --reload --port 8080

Open in browser: http://127.0.0.1:8080/docs

Endpoints:
    POST /api/v1/upload-resume   Upload PDF or DOCX resume
    GET  /api/v1/analyze         NLP extraction + ATS score
    GET  /api/v1/match-jobs      Ranked job matches
    GET  /api/v1/health          Liveness probe
    GET  /docs                   Swagger UI (DEBUG=true only)
"""

from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Ensure project root is on sys.path when launched as `python main.py`
_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.api.routes import health, resume
from app.core.config import settings
from app.core.pipeline import init_pipeline

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ────────────────────────────────────────────────────────────
    logger.info("Starting %s v%s", settings.PROJECT_NAME, settings.VERSION)
    init_pipeline(settings.JOBS_DATASET_PATH)
    logger.info("Application ready.")
    yield
    # ── Shutdown ───────────────────────────────────────────────────────────
    logger.info("Shutting down.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=(
        "AI-powered resume analysis pipeline: parse → NLP → ATS score → job match.\n\n"
        "**Workflow:**\n"
        "1. `POST /upload-resume` — upload your PDF or DOCX\n"
        "2. `GET /analyze?resume_id=<id>` — get skills, ATS score, suggestions\n"
        "3. `GET /match-jobs?resume_id=<id>` — get ranked job matches\n"
    ),
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
PREFIX = "/api/v1"
app.include_router(health.router,  prefix=PREFIX, tags=["health"])
app.include_router(resume.router,  prefix=PREFIX, tags=["resume"])


@app.get("/", include_in_schema=False)
def root():
    """Landing page — browsers often open bare 127.0.0.1 without a path."""
    if settings.DEBUG:
        return RedirectResponse(url="/docs")
    return {"message": "AI Resume Analyzer API", "health": f"{PREFIX}/health"}


if __name__ == "__main__":
    import uvicorn

    # Port 8000 is commonly taken by other local dev servers; 8080 avoids clashes.
    port = 8080
    print(f"\n  Resume Analyzer API -> http://127.0.0.1:{port}/docs\n")

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=port,
        reload=False,
        reload_excludes=[".venv", "venv", ".pytest_cache", "__pycache__"],
    )
