from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    resume_id: str
    filename: str
    file_type: str
    word_count: int


class SkillItem(BaseModel):
    name: str
    category: str
    occurrences: int = 1


class EducationItem(BaseModel):
    degree: str = ""
    field: str = ""
    institution: str = ""
    year: Optional[int] = None


class ExperienceItem(BaseModel):
    title: str = ""
    company: str = ""
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    years: float = 0.0


class AnalyzeResponse(BaseModel):
    resume_id: str
    skills: list[SkillItem] = Field(default_factory=list)
    skills_by_category: dict[str, list[str]] = Field(default_factory=dict)
    education: list[EducationItem] = Field(default_factory=list)
    experience: list[ExperienceItem] = Field(default_factory=list)
    total_experience_years: float = 0.0
    skill_count: int = 0


class ScoreComponent(BaseModel):
    name: str
    raw_score: float
    weight: float
    weighted: float
    # scorer.py may emit either a dict or a human-readable string summary.
    detail: Any = None


class ATSScoreResponse(BaseModel):
    ats_score: float
    grade: str
    components: list[ScoreComponent] = Field(default_factory=list)
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    bonus_skills: list[str] = Field(default_factory=list)
    matched_keywords: list[str] = Field(default_factory=list)
    missing_keywords: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    experience_gap: float = 0.0
    education_met: bool = False


class JobMatchItem(BaseModel):
    rank: int
    job_id: str
    title: str
    company: str
    location: str = ""
    job_type: str = ""
    salary_range: str = ""
    match_pct: float
    skill_score: float
    semantic_score: float
    experience_score: float
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    bonus_skills: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    experience_required: int = 0


class MatchJobsResponse(BaseModel):
    resume_id: str
    total_jobs_searched: int
    matches: list[JobMatchItem] = Field(default_factory=list)


class FullAnalysisResponse(BaseModel):
    resume_id: str
    analysis: AnalyzeResponse
    ats_score: ATSScoreResponse
    top_match: Optional[JobMatchItem] = None

