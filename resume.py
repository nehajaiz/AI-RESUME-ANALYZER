"""
app/api/routes/resume.py — Resume pipeline endpoints
=====================================================

POST /api/v1/upload-resume   Upload PDF or DOCX; returns resume_id
GET  /api/v1/analyze         NLP analysis + ATS score for a resume_id
GET  /api/v1/match-jobs      Ranked job matches for a resume_id
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.core.config import settings
from app.core.pipeline import Pipeline, get_pipeline
from app.schemas.resume import (
    FullAnalysisResponse,
    MatchJobsResponse,
    UploadResponse,
)
from app.services.resume_service import analyze_resume, match_jobs, parse_and_store

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Validators ─────────────────────────────────────────────────────────────────

def _validate_upload(file: UploadFile) -> None:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported file type '{ext}'. "
                f"Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}"
            ),
        )


# ── POST /upload-resume ────────────────────────────────────────────────────────

@router.post(
    "/upload-resume",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a resume (PDF or DOCX)",
    responses={
        415: {"description": "Unsupported file type"},
        422: {"description": "File too large or unreadable"},
    },
)
async def upload_resume(
    file: UploadFile = File(..., description="PDF or DOCX resume file"),
) -> UploadResponse:
    """
    Upload a resume file and parse it into raw text.

    - Validates extension (.pdf / .docx) and file size.
    - Parses text using PyMuPDF (PDF) or python-docx (DOCX).
    - Returns a `resume_id` used by all subsequent endpoints.
    """
    _validate_upload(file)

    content = await file.read()

    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File exceeds maximum size of {settings.MAX_FILE_SIZE_MB} MB.",
        )

    # Write to a temp file (parser expects a real path)
    suffix = Path(file.filename or "resume").suffix.lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        result = parse_and_store(tmp_path, file.filename or "resume")
    except Exception as exc:
        logger.exception("Parse failed for %s", file.filename)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not parse file: {exc}",
        )
    finally:
        tmp_path.unlink(missing_ok=True)

    return result


# ── GET /analyze ───────────────────────────────────────────────────────────────

@router.get(
    "/analyze",
    response_model=FullAnalysisResponse,
    summary="Run NLP analysis and ATS scoring",
    responses={
        404: {"description": "resume_id not found"},
    },
)
def analyze(
    resume_id: str = Query(..., description="ID returned by /upload-resume"),
    pipeline: Pipeline = Depends(get_pipeline),
) -> FullAnalysisResponse:
    """
    Analyse a parsed resume:

    - Extract skills (categorised), education, and experience via spaCy PhraseMatcher.
    - Score against the best-matching job using the 4-component ATS formula.
    - Return full structured breakdown including missing skills and suggestions.
    """
    try:
        return analyze_resume(resume_id, pipeline)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.exception("Analysis failed for resume_id=%s", resume_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis error: {exc}",
        )


# ── GET /match-jobs ────────────────────────────────────────────────────────────

@router.get(
    "/match-jobs",
    response_model=MatchJobsResponse,
    summary="Match resume against job dataset",
    responses={
        404: {"description": "resume_id not found"},
    },
)
def match_jobs_endpoint(
    resume_id: str = Query(..., description="ID returned by /upload-resume"),
    top_n: int = Query(default=5, ge=1, le=20, description="Number of job matches to return"),
    min_score: float = Query(default=0.0, ge=0.0, le=100.0, description="Minimum match %"),
    pipeline: Pipeline = Depends(get_pipeline),
) -> MatchJobsResponse:
    """
    Match a resume against all indexed jobs:

    - Uses TF-IDF semantic similarity + weighted skill Jaccard score.
    - Returns top-N ranked matches with per-job skill gaps and reasons.
    - Supports `top_n` (1–20) and `min_score` (0–100) query params.
    """
    try:
        return match_jobs(resume_id, pipeline, top_n=top_n, min_score=min_score)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.exception("Matching failed for resume_id=%s", resume_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Matching error: {exc}",
        )
