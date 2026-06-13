"""
app/schemas/resume.py — Pydantic request / response models
============================================================
All API contracts live here.  Import from this module in routes and tests.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field, field_validator


# ── Upload response ────────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    resume_id: str = Field(..., description="Opaque ID referencing the parsed resume in memory")
    filename: str
    file_type: str                        # "pdf" or "docx"
    word_count: int
    message: str = "Resume uploaded and parsed successfully."


# ── Analysis response ──────────────────────────────────────────────────────────

class SkillItem(BaseModel):
    name: str
    category: str
    occurrences: int = 1


class EducationItem(BaseModel):
    degree: str
    field: str
    institution: str
    year: Optional[int] = None


class ExperienceItem(BaseModel):
    title: str
    company: str
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    years: float


class AnalyzeResponse(BaseModel):
    resume_id: str
    skills: list[SkillItem]
    skills_by_category: dict[str, list[str]]
    education: list[EducationItem]
    experience: list[ExperienceItem]
    total_experience_years: float
    skill_count: int


# ── ATS score response ─────────────────────────────────────────────────────────

class ScoreComponent(BaseModel):
    name: str
    raw_score: float = Field(..., ge=0, le=100)
    weight: float
    weighted: float
    detail: str


class ATSScoreResponse(BaseModel):
    ats_score: float = Field(..., ge=0, le=100)
    grade: str = Field(..., pattern="^[ABCDF]$")
    components: list[ScoreComponent]
    matched_skills: list[str]
    missing_skills: list[str]
    bonus_skills: list[str]
    matched_keywords: list[str]
    missing_keywords: list[str]
    suggestions: list[str]
    experience_gap: float
    education_met: bool


# ── Job match response ─────────────────────────────────────────────────────────

class JobMatchItem(BaseModel):
    rank: int
    job_id: str
    title: str
    company: str
    location: str
    job_type: str
    salary_range: str
    match_pct: float = Field(..., ge=0, le=100)
    skill_score: float
    semantic_score: float
    experience_score: float
    matched_skills: list[str]
    missing_skills: list[str]
    bonus_skills: list[str]
    reasons: list[str]
    experience_required: int


class MatchJobsResponse(BaseModel):
    resume_id: str
    total_jobs_searched: int
    matches: list[JobMatchItem]


# ── Full pipeline response ─────────────────────────────────────────────────────

class FullAnalysisResponse(BaseModel):
    """Returned by GET /analyze — NLP analysis + ATS score against best match."""
    resume_id: str
    analysis: AnalyzeResponse
    ats_score: ATSScoreResponse
    top_match: Optional[JobMatchItem] = None


# ── Error response ─────────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    detail: str
    code: str = "error"
