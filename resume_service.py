"""
app/services/resume_service.py — Resume processing service
===========================================================
Contains all business logic for the three pipeline stages:
  1. parse_and_store   — parse file → store result in memory store
  2. analyze_resume    — run NLP on stored parse result
  3. match_jobs        — run matcher + scorer on NLP result

No FastAPI imports here; this layer is independently testable.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Optional

from parser import parse_resume, ParsedResume
from nlp_engine import NLPResult
from matcher import MatchResult
from scorer import ResumeProfile, JobProfile, ATSScoreResult

from app.core.pipeline import Pipeline
from app.schemas.resume import (
    UploadResponse,
    AnalyzeResponse,
    SkillItem,
    EducationItem,
    ExperienceItem,
    ATSScoreResponse,
    ScoreComponent,
    MatchJobsResponse,
    JobMatchItem,
    FullAnalysisResponse,
)

logger = logging.getLogger(__name__)


# ── In-memory store (swap for Redis / DB in production) ───────────────────────

class ResumeStore:
    """
    Thread-safe-enough for single-worker dev use.
    In production replace with Redis or a DB-backed session store.
    """

    def __init__(self) -> None:
        self._parsed: dict[str, ParsedResume]  = {}
        self._nlp:    dict[str, NLPResult]     = {}

    def save_parsed(self, resume_id: str, result: ParsedResume) -> None:
        self._parsed[resume_id] = result

    def get_parsed(self, resume_id: str) -> Optional[ParsedResume]:
        return self._parsed.get(resume_id)

    def save_nlp(self, resume_id: str, result: NLPResult) -> None:
        self._nlp[resume_id] = result

    def get_nlp(self, resume_id: str) -> Optional[NLPResult]:
        return self._nlp.get(resume_id)

    def exists(self, resume_id: str) -> bool:
        return resume_id in self._parsed


# Global store — one per process lifetime
resume_store = ResumeStore()


# ── Stage 1: Upload & parse ────────────────────────────────────────────────────

def parse_and_store(file_path: Path, original_filename: str) -> UploadResponse:
    """
    Parse a resume file and persist the result.

    Returns UploadResponse with a stable resume_id for subsequent calls.
    Raises ResumeParseError / FileNotFoundError on bad input.
    """
    parsed = parse_resume(file_path)

    resume_id = str(uuid.uuid4())
    resume_store.save_parsed(resume_id, parsed)

    logger.info(
        "Stored resume_id=%s file=%s words=%d",
        resume_id, original_filename, parsed.word_count,
    )

    return UploadResponse(
        resume_id=resume_id,
        filename=original_filename,
        file_type=parsed.file_type.value,
        word_count=parsed.word_count,
    )


# ── Stage 2: NLP analysis + ATS score ─────────────────────────────────────────

def analyze_resume(resume_id: str, pipeline: Pipeline) -> FullAnalysisResponse:
    """
    Run NLP extraction and score the resume against the best-matching job.

    Returns FullAnalysisResponse.
    Raises KeyError if resume_id is unknown.
    """
    parsed = resume_store.get_parsed(resume_id)
    if parsed is None:
        raise KeyError(f"resume_id '{resume_id}' not found.")

    # ── NLP extraction ────────────────────────────────────────────────────────
    nlp_result = pipeline.nlp.analyze(parsed.full_text)
    resume_store.save_nlp(resume_id, nlp_result)

    analysis = AnalyzeResponse(
        resume_id=resume_id,
        skills=[
            SkillItem(name=s.name, category=s.category, occurrences=s.occurrences)
            for s in nlp_result.skills
        ],
        skills_by_category=nlp_result.skills_by_category,
        education=[
            EducationItem(
                degree=e.degree, field=e.field,
                institution=e.institution, year=e.year,
            )
            for e in nlp_result.education
        ],
        experience=[
            ExperienceItem(
                title=ex.title, company=ex.company,
                start_year=ex.start_year, end_year=ex.end_year,
                years=ex.years,
            )
            for ex in nlp_result.experience
        ],
        total_experience_years=nlp_result.total_experience_years,
        skill_count=len(nlp_result.skills),
    )

    # ── Quick job match for ATS scoring ───────────────────────────────────────
    top_matches = pipeline.matcher.match(
        resume_skills=nlp_result.skill_names,
        resume_text=parsed.full_text,
        experience_years=nlp_result.total_experience_years or None,
        top_n=1,
    )

    top_match_schema: Optional[JobMatchItem] = None
    ats_result: Optional[ATSScoreResult] = None

    if top_matches:
        best = top_matches[0]
        top_match_schema = _match_to_schema(best)

        # Build job profile from indexed job data (includes full JD for keyword scoring)
        job = pipeline.matcher.get_job(best.job_id)
        if job:
            job_profile = JobProfile(
                required_skills=job.required_skills,
                nice_to_have=job.nice_to_have,
                experience_years=job.experience_years,
                job_title=job.title,
                description=job.description,
                education_level="bachelor",
            )
        else:
            job_profile = JobProfile(
                required_skills=best.matched_skills + best.missing_skills,
                nice_to_have=best.bonus_skills,
                experience_years=best.experience_required,
                job_title=best.title,
                description="",
                education_level="bachelor",
            )
        resume_profile = ResumeProfile(
            skills=nlp_result.skill_names,
            experience_years=nlp_result.total_experience_years or None,
            job_titles=[ex.title for ex in nlp_result.experience],
            education_level=_first_edu_level(nlp_result),
            education_field=_first_edu_field(nlp_result),
            raw_text=parsed.full_text,
        )
        ats_result = pipeline.scorer.score(resume_profile, job_profile)

    ats_schema = _ats_to_schema(ats_result) if ats_result else _empty_ats_schema()

    return FullAnalysisResponse(
        resume_id=resume_id,
        analysis=analysis,
        ats_score=ats_schema,
        top_match=top_match_schema,
    )


# ── Stage 3: Job matching ──────────────────────────────────────────────────────

def match_jobs(
    resume_id: str,
    pipeline: Pipeline,
    top_n: int = 5,
    min_score: float = 0.0,
) -> MatchJobsResponse:
    """
    Run full job matching for a previously analyzed resume.

    Uses cached NLP result if available; re-runs NLP otherwise.
    Raises KeyError if resume_id is unknown.
    """
    parsed = resume_store.get_parsed(resume_id)
    if parsed is None:
        raise KeyError(f"resume_id '{resume_id}' not found.")

    nlp_result = resume_store.get_nlp(resume_id)
    if nlp_result is None:
        nlp_result = pipeline.nlp.analyze(parsed.full_text)
        resume_store.save_nlp(resume_id, nlp_result)

    matches = pipeline.matcher.match(
        resume_skills=nlp_result.skill_names,
        resume_text=parsed.full_text,
        experience_years=nlp_result.total_experience_years or None,
        top_n=top_n,
        min_score=min_score,
    )

    return MatchJobsResponse(
        resume_id=resume_id,
        total_jobs_searched=pipeline.matcher.job_count,
        matches=[_match_to_schema(m) for m in matches],
    )


# ── Helpers ────────────────────────────────────────────────────────────────────

def _match_to_schema(m: MatchResult) -> JobMatchItem:
    return JobMatchItem(
        rank=m.rank,
        job_id=m.job_id,
        title=m.title,
        company=m.company,
        location=m.location,
        job_type=m.job_type,
        salary_range=m.salary_range,
        match_pct=m.match_pct,
        skill_score=m.skill_score,
        semantic_score=m.semantic_score,
        experience_score=m.experience_score,
        matched_skills=m.matched_skills,
        missing_skills=m.missing_skills,
        bonus_skills=m.bonus_skills,
        reasons=m.reasons,
        experience_required=m.experience_required,
    )


def _ats_to_schema(r: ATSScoreResult) -> ATSScoreResponse:
    return ATSScoreResponse(
        ats_score=r.ats_score,
        grade=r.grade,
        components=[
            ScoreComponent(
                name=c.name,
                raw_score=c.raw_score,
                weight=c.weight,
                weighted=c.weighted,
                detail=c.detail,
            )
            for c in r.components
        ],
        matched_skills=r.matched_skills,
        missing_skills=r.missing_skills,
        bonus_skills=r.bonus_skills,
        matched_keywords=r.matched_keywords,
        missing_keywords=r.missing_keywords,
        suggestions=r.suggestions,
        experience_gap=r.experience_gap,
        education_met=r.education_met,
    )


def _empty_ats_schema() -> ATSScoreResponse:
    return ATSScoreResponse(
        ats_score=0.0,
        grade="F",
        components=[],
        matched_skills=[],
        missing_skills=[],
        bonus_skills=[],
        matched_keywords=[],
        missing_keywords=[],
        suggestions=["Upload a resume and run /analyze to generate a score."],
        experience_gap=0.0,
        education_met=False,
    )


def _first_edu_level(nlp_result: NLPResult) -> str:
    if nlp_result.education:
        return nlp_result.education[0].degree.lower()
    return "none"


def _first_edu_field(nlp_result: NLPResult) -> str:
    if nlp_result.education:
        return nlp_result.education[0].field
    return ""
