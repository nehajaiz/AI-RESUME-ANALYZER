"""
scorer.py — ATS Resume Scorer
==============================
Produces a realistic Applicant Tracking System (ATS) score (0–100) for a
resume against a job description, broken down into four components:

    Component            Weight   What it measures
    ─────────────────────────────────────────────────────────────────
    Skill Match           40 %    Overlap between resume and JD skills
    Experience Relevance  25 %    Years-of-experience fit + title match
    Keyword Optimisation  20 %    TF-IDF keyword coverage of the JD
    Education Fit         15 %    Degree level and field alignment

Usage
─────
    from scorer import ATSScorer, ResumeProfile, JobProfile

    scorer = ATSScorer()

    resume  = ResumeProfile(
        skills=["Python", "FastAPI", "PostgreSQL", "Docker"],
        experience_years=4,
        job_titles=["Backend Engineer", "Software Engineer"],
        education_level="bachelor",
        education_field="Computer Science",
        raw_text="... full resume text ...",
    )

    job = JobProfile(
        required_skills=["Python", "FastAPI", "PostgreSQL", "Redis", "AWS"],
        nice_to_have=["Kubernetes", "Terraform"],
        experience_years=5,
        job_title="Senior Backend Engineer",
        description="Build payment APIs using Python and FastAPI ...",
        education_level="bachelor",
    )

    result = scorer.score(resume, job)
    print(result.ats_score)        # e.g. 74.5
    print(result.missing_skills)   # ['Redis', 'AWS']
    print(result.suggestions)      # ['Add Redis to skills section', ...]
"""

from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass, field
from typing import Optional

from sklearn.feature_extraction.text import TfidfVectorizer

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Constants & config
# ─────────────────────────────────────────────────────────────────────────────

WEIGHTS = {
    "skill":       0.40,
    "experience":  0.25,
    "keyword":     0.20,
    "education":   0.15,
}

# Education level hierarchy — higher index = higher qualification
EDUCATION_LEVELS = ["none", "diploma", "associate", "bachelor", "master", "phd"]

# Degree synonyms -> canonical level
_DEGREE_ALIASES: dict[str, str] = {
    # PhD
    "phd": "phd", "ph.d": "phd", "doctorate": "phd", "doctoral": "phd",
    # Master
    "master": "master", "masters": "master", "ms": "master", "m.s": "master",
    "msc": "master", "ma": "master", "m.a": "master", "mba": "master",
    "mtech": "master", "m.tech": "master", "me": "master", "m.e": "master",
    # Bachelor
    "bachelor": "bachelor", "bachelors": "bachelor", "bs": "bachelor",
    "b.s": "bachelor", "ba": "bachelor", "b.a": "bachelor", "btech": "bachelor",
    "b.tech": "bachelor", "be": "bachelor", "b.e": "bachelor", "bsc": "bachelor",
    # Associate / Diploma
    "associate": "associate", "associates": "associate",
    "diploma": "diploma", "certificate": "diploma",
}

# Action verbs that signal strong ATS presence (bonus keyword signal)
STRONG_ATS_VERBS = {
    "designed", "built", "developed", "implemented", "architected", "led",
    "optimised", "optimized", "scaled", "deployed", "automated", "reduced",
    "improved", "delivered", "managed", "created", "engineered", "launched",
    "migrated", "refactored", "mentored", "increased", "decreased",
}

# ─────────────────────────────────────────────────────────────────────────────
# Input profiles
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class ResumeProfile:
    """
    Structured resume data — typically produced by NLPEngine.analyze() +
    parser.parse_resume() in this pipeline.

    Parameters
    ----------
    skills : list[str]
        Extracted skill names.
    experience_years : float | None
        Total years of professional experience.
    job_titles : list[str]
        Previous job titles held.
    education_level : str
        Highest education level ('phd', 'master', 'bachelor', 'associate',
        'diploma', 'none').  Aliases like 'BS', 'M.S' are resolved
        automatically.
    education_field : str
        Field of study (e.g. 'Computer Science', 'Data Engineering').
    raw_text : str
        Full resume text — used for keyword and verb analysis.
    """
    skills: list[str] = field(default_factory=list)
    experience_years: Optional[float] = None
    job_titles: list[str] = field(default_factory=list)
    education_level: str = "none"
    education_field: str = ""
    raw_text: str = ""


@dataclass
class JobProfile:
    """
    Structured job description — can be loaded from mock_jobs.json or any
    job object produced by the matcher.

    Parameters
    ----------
    required_skills : list[str]
        Must-have skills listed in the JD.
    nice_to_have : list[str]
        Optional / preferred skills.
    experience_years : int
        Minimum years required.
    job_title : str
        The advertised role title.
    description : str
        Full job description text — used for keyword extraction.
    education_level : str
        Minimum education level required.
    education_field : str
        Preferred field of study (optional).
    """
    required_skills: list[str] = field(default_factory=list)
    nice_to_have: list[str] = field(default_factory=list)
    experience_years: int = 0
    job_title: str = ""
    description: str = ""
    education_level: str = "bachelor"
    education_field: str = ""


# ─────────────────────────────────────────────────────────────────────────────
# Score result
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class ComponentScore:
    """Individual component sub-score with its weight contribution."""
    name: str
    raw_score: float        # 0-100 before weighting
    weight: float           # weight in [0, 1]
    weighted: float         # raw_score * weight
    detail: str             # one-line explanation


@dataclass
class ATSScoreResult:
    """Full scoring output returned to the caller."""

    ats_score: float                    # 0-100 final weighted score
    grade: str                          # A / B / C / D / F
    components: list[ComponentScore]

    matched_skills: list[str]           # skills in both resume and JD
    missing_skills: list[str]           # required JD skills absent from resume
    bonus_skills: list[str]             # nice-to-have skills the candidate has
    matched_keywords: list[str]         # high-value JD keywords found in resume
    missing_keywords: list[str]         # high-value JD keywords absent from resume

    suggestions: list[str]              # prioritised improvement actions

    experience_gap: float               # years short of requirement (0 = met)
    education_met: bool                 # True if education requirement satisfied

    def to_dict(self) -> dict:
        return {
            "ats_score": self.ats_score,
            "grade": self.grade,
            "components": [
                {
                    "name": c.name,
                    "raw_score": c.raw_score,
                    "weight": c.weight,
                    "weighted": c.weighted,
                    "detail": c.detail,
                }
                for c in self.components
            ],
            "matched_skills": self.matched_skills,
            "missing_skills": self.missing_skills,
            "bonus_skills": self.bonus_skills,
            "matched_keywords": self.matched_keywords,
            "missing_keywords": self.missing_keywords,
            "suggestions": self.suggestions,
            "experience_gap": self.experience_gap,
            "education_met": self.education_met,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────


def _norm(text: str) -> str:
    """Lowercase + strip for case-insensitive comparisons."""
    return text.strip().lower()


def _resolve_edu_level(raw: str) -> str:
    """Map a free-text degree string to a canonical level key."""
    if not raw or not raw.strip():
        return "none"
    clean = re.sub(r"['\".()]", "", raw.strip().lower())
    first_token = clean.split()[0] if clean.split() else "none"
    return _DEGREE_ALIASES.get(first_token, "none")


def _edu_index(level: str) -> int:
    """Return the numeric rank of an education level (higher = more qualified)."""
    resolved = _resolve_edu_level(level) if level not in EDUCATION_LEVELS else level
    try:
        return EDUCATION_LEVELS.index(resolved)
    except ValueError:
        return 0


def _grade(score: float) -> str:
    if score >= 85:
        return "A"
    if score >= 70:
        return "B"
    if score >= 55:
        return "C"
    if score >= 40:
        return "D"
    return "F"


def _experience_sigmoid(candidate: float, required: int) -> float:
    """
    Sigmoid score: exact / over-qualified -> 1.0; each year short decays
    smoothly.  Returns value in [0, 1].
    """
    if required == 0:
        return 1.0
    gap = required - candidate
    if gap <= 0:
        return 1.0
    return round(1 / (1 + math.exp(gap - 1)), 4)


def _title_similarity(resume_titles: list[str], job_title: str) -> float:
    """
    Rough title alignment: check how many words from the job title appear
    in any of the candidate's previous titles.  Returns 0-1.
    """
    if not job_title or not resume_titles:
        return 0.5  # neutral
    jd_words = {
        _norm(w) for w in re.findall(r"\w+", job_title)
        if len(w) > 2 and w.lower() not in {"and", "the", "for", "of"}
    }
    if not jd_words:
        return 0.5
    best = 0.0
    for title in resume_titles:
        title_words = {_norm(w) for w in re.findall(r"\w+", title)}
        overlap = len(jd_words & title_words) / len(jd_words)
        best = max(best, overlap)
    return min(best, 1.0)


def _extract_keywords(text: str, top_n: int = 20) -> list[str]:
    """
    Extract the top-n TF-IDF keywords from a single document.
    Falls back to simple tokenisation for very short texts.
    """
    if not text or not text.strip():
        return []
    try:
        vec = TfidfVectorizer(
            analyzer="word",
            ngram_range=(1, 2),
            min_df=1,
            max_features=200,
            stop_words="english",
            sublinear_tf=True,
        )
        tfidf = vec.fit_transform([text])
        feature_names = vec.get_feature_names_out()
        scores = tfidf.toarray()[0]
        ranked = sorted(zip(feature_names, scores), key=lambda x: -x[1])
        return [w for w, _ in ranked[:top_n] if len(w) > 2]
    except ValueError:
        tokens = re.findall(r"\b[a-zA-Z][a-zA-Z0-9+#.]{2,}\b", text)
        return list(dict.fromkeys(tokens))[:top_n]


def _verb_bonus(resume_text: str) -> float:
    """
    Return 0-5 bonus points for strong ATS action verbs in the resume.
    Rewards candidates who quantify achievements.
    """
    if not resume_text:
        return 0.0
    words = {_norm(w) for w in re.findall(r"\b\w+\b", resume_text)}
    hits = len(words & STRONG_ATS_VERBS)
    return min(hits * 0.8, 5.0)


# ─────────────────────────────────────────────────────────────────────────────
# Score components
# ─────────────────────────────────────────────────────────────────────────────


def _score_skills(
    resume: ResumeProfile, job: JobProfile
) -> tuple[ComponentScore, list[str], list[str], list[str]]:
    """
    Skill Match (40%)
    -----------------
    Weighted Jaccard:
        Required skills  = weight 1.0
        Nice-to-have     = weight 0.35
        Score = weighted_hits / weighted_total * 100
    """
    r_set    = {_norm(s) for s in resume.skills}
    req_set  = {_norm(s) for s in job.required_skills}
    nice_set = {_norm(s) for s in job.nice_to_have}

    matched = [s for s in job.required_skills if _norm(s) in r_set]
    missing = [s for s in job.required_skills if _norm(s) not in r_set]
    bonus   = [s for s in job.nice_to_have    if _norm(s) in r_set]

    req_hits  = len(matched)
    nice_hits = len(bonus)

    numerator   = req_hits + 0.35 * nice_hits
    denominator = len(job.required_skills) + 0.35 * len(job.nice_to_have)

    raw = (numerator / denominator * 100) if denominator else 100.0
    raw = min(round(raw, 2), 100.0)

    pct_required = f"{req_hits}/{len(job.required_skills)}" if job.required_skills else "N/A"
    detail = (
        f"{pct_required} required skills matched; "
        f"{len(bonus)} nice-to-have skill(s) present."
    )

    cs = ComponentScore(
        name="Skill Match",
        raw_score=raw,
        weight=WEIGHTS["skill"],
        weighted=round(raw * WEIGHTS["skill"], 2),
        detail=detail,
    )
    return cs, matched, missing, bonus


def _score_experience(
    resume: ResumeProfile, job: JobProfile
) -> tuple[ComponentScore, float]:
    """
    Experience Relevance (25%)
    --------------------------
    Combines:
      Years-of-experience sigmoid  (70% of component)
      Job title similarity         (30% of component)
    """
    if resume.experience_years is None:
        yoe_raw = 50.0
        exp_gap = 0.0
    else:
        sig = _experience_sigmoid(resume.experience_years, job.experience_years)
        yoe_raw = sig * 100
        exp_gap = max(0.0, job.experience_years - resume.experience_years)

    title_sim = _title_similarity(resume.job_titles, job.job_title)
    title_raw = title_sim * 100

    raw = round(0.70 * yoe_raw + 0.30 * title_raw, 2)

    if resume.experience_years is None:
        detail = "Experience years unknown; title similarity used."
    elif exp_gap > 0:
        detail = (
            f"{resume.experience_years:.1f} yrs vs {job.experience_years} required "
            f"({exp_gap:.1f} yr gap); title similarity {title_sim * 100:.0f}%."
        )
    else:
        detail = (
            f"{resume.experience_years:.1f} yrs meets {job.experience_years}-yr requirement; "
            f"title similarity {title_sim * 100:.0f}%."
        )

    cs = ComponentScore(
        name="Experience Relevance",
        raw_score=raw,
        weight=WEIGHTS["experience"],
        weighted=round(raw * WEIGHTS["experience"], 2),
        detail=detail,
    )
    return cs, exp_gap


def _score_keywords(
    resume: ResumeProfile, job: JobProfile
) -> tuple[ComponentScore, list[str], list[str]]:
    """
    Keyword Optimisation (20%)
    --------------------------
    1. Extract top-20 TF-IDF keywords from the JD.
    2. Check how many appear in the resume text.
    3. Apply a small bonus for strong ATS action verbs.
    """
    jd_keywords  = _extract_keywords(job.description, top_n=20)
    resume_lower = _norm(resume.raw_text)

    matched_kw = [kw for kw in jd_keywords if kw in resume_lower]
    missing_kw = [kw for kw in jd_keywords if kw not in resume_lower]

    coverage  = len(matched_kw) / len(jd_keywords) if jd_keywords else 1.0
    verb_pts  = _verb_bonus(resume.raw_text)

    raw = min(round(coverage * 100 + verb_pts, 2), 100.0)

    detail = (
        f"{len(matched_kw)}/{len(jd_keywords)} JD keywords present in resume"
        + (f"; +{verb_pts:.1f} action-verb bonus." if verb_pts else ".")
    )

    cs = ComponentScore(
        name="Keyword Optimisation",
        raw_score=raw,
        weight=WEIGHTS["keyword"],
        weighted=round(raw * WEIGHTS["keyword"], 2),
        detail=detail,
    )
    return cs, matched_kw, missing_kw


def _score_education(
    resume: ResumeProfile, job: JobProfile
) -> tuple[ComponentScore, bool]:
    """
    Education Fit (15%)
    -------------------
    Level score  (0-80 pts): full if met; -25 per level below requirement.
    Field score  (0-20 pts): word-overlap between resume field and job field.
    Over-qualification carries no penalty.
    """
    resume_idx = _edu_index(resume.education_level)
    job_idx    = _edu_index(job.education_level)
    level_met  = resume_idx >= job_idx

    if level_met:
        level_score = 80.0
    else:
        gap = job_idx - resume_idx
        level_score = max(0.0, 80.0 - gap * 25)

    if resume.education_field and job.education_field:
        r_words = {_norm(w) for w in resume.education_field.split() if len(w) > 2}
        j_words = {_norm(w) for w in job.education_field.split()   if len(w) > 2}
        if r_words and j_words:
            overlap     = len(r_words & j_words) / len(j_words)
            field_score = round(overlap * 20, 2)
        else:
            field_score = 10.0
    else:
        field_score = 10.0

    raw = min(round(level_score + field_score, 2), 100.0)

    r_lvl = _resolve_edu_level(resume.education_level) if resume.education_level else "none"
    j_lvl = _resolve_edu_level(job.education_level)    if job.education_level    else "none"
    detail = (
        f"Resume: {r_lvl} | Required: {j_lvl}. "
        f"{'Level met.' if level_met else 'Level below requirement.'} "
        f"Field alignment: {field_score:.0f}/20."
    )

    cs = ComponentScore(
        name="Education Fit",
        raw_score=raw,
        weight=WEIGHTS["education"],
        weighted=round(raw * WEIGHTS["education"], 2),
        detail=detail,
    )
    return cs, level_met


# ─────────────────────────────────────────────────────────────────────────────
# Suggestion engine
# ─────────────────────────────────────────────────────────────────────────────


def _generate_suggestions(
    skill_cs: ComponentScore,
    exp_cs: ComponentScore,
    kw_cs: ComponentScore,
    edu_cs: ComponentScore,
    missing_skills: list[str],
    missing_keywords: list[str],
    exp_gap: float,
    education_met: bool,
    resume: ResumeProfile,
    job: JobProfile,
) -> list[str]:
    """Produce a prioritised, specific list of improvement suggestions."""
    suggestions: list[str] = []

    # Skills (highest weight — first)
    if missing_skills:
        top_missing = missing_skills[:4]
        tail = f" (and {len(missing_skills) - 4} more)." if len(missing_skills) > 4 else "."
        suggestions.append(
            f"Add missing required skills to your skills section: "
            f"{', '.join(top_missing)}{tail}"
        )
    if skill_cs.raw_score < 50:
        suggestions.append(
            "Skill coverage is below 50%. Prioritise gaining hands-on "
            "experience with the top required skills before applying."
        )
    elif skill_cs.raw_score < 75:
        suggestions.append(
            "Boost skill score by adding projects or certifications that "
            "demonstrate the missing required skills."
        )

    # Experience
    if exp_gap > 0:
        suggestions.append(
            f"You are {exp_gap:.1f} year(s) short of the {job.experience_years}-yr "
            "requirement. Highlight relevant freelance, open-source, or "
            "side-project experience to partially offset this gap."
        )
    if exp_cs.raw_score < 60 and resume.job_titles:
        suggestions.append(
            f"Your titles ({', '.join(resume.job_titles[:2])}) don't closely "
            f"mirror '{job.job_title}'. Re-frame your experience summary "
            "to use matching terminology."
        )
    elif not resume.job_titles:
        suggestions.append(
            "Add clear job titles to your work experience entries to improve "
            "title-similarity scoring."
        )

    # Keywords
    if missing_keywords:
        top_kw = missing_keywords[:5]
        suggestions.append(
            f"Incorporate these high-value JD keywords naturally into your "
            f"summary or experience bullets: {', '.join(top_kw)}."
        )
    if kw_cs.raw_score < 50:
        suggestions.append(
            "Mirror the language of the job description more closely. "
            "ATS systems rank resumes with exact JD phrases higher."
        )
    if not any(_norm(v) in _norm(resume.raw_text) for v in list(STRONG_ATS_VERBS)[:5]):
        suggestions.append(
            "Use strong action verbs (e.g. 'Designed', 'Implemented', "
            "'Reduced', 'Scaled') to begin each bullet point."
        )

    # Education
    if not education_met:
        r_lvl = _resolve_edu_level(resume.education_level)
        j_lvl = _resolve_edu_level(job.education_level)
        suggestions.append(
            f"This role requires a {j_lvl} degree; your highest is {r_lvl}. "
            "Emphasise equivalent work experience, certifications, or "
            "relevant bootcamps in your summary."
        )

    # General hygiene
    if len(resume.raw_text) < 300:
        suggestions.append(
            "Your resume text appears short. Expand bullet points with "
            "quantified achievements (numbers, percentages, scale)."
        )

    overall = sum(c.weighted for c in [skill_cs, exp_cs, kw_cs, edu_cs])
    if overall >= 85:
        suggestions.insert(0, "Strong match! Tailor your cover letter to the specific team and product.")
    elif overall >= 70:
        suggestions.insert(0, "Good match. Address the top 2-3 gaps above before submitting.")
    else:
        suggestions.insert(0, "Moderate match. Focus on closing skill and keyword gaps first.")

    return suggestions


# ─────────────────────────────────────────────────────────────────────────────
# Main scorer
# ─────────────────────────────────────────────────────────────────────────────


class ATSScorer:
    """
    Stateless ATS scorer — instantiate once, call `score()` many times.

    The scorer is purely deterministic; identical inputs always produce
    identical output.  It carries no state between calls.
    """

    def score(self, resume: ResumeProfile, job: JobProfile) -> ATSScoreResult:
        """
        Compute the full ATS score for a resume against a job.

        Parameters
        ----------
        resume : ResumeProfile
        job    : JobProfile

        Returns
        -------
        ATSScoreResult with ats_score, grade, components, gaps, suggestions.
        """
        skill_cs, matched_skills, missing_skills, bonus_skills = _score_skills(resume, job)
        exp_cs,   exp_gap                                       = _score_experience(resume, job)
        kw_cs,    matched_kw,     missing_kw                   = _score_keywords(resume, job)
        edu_cs,   edu_met                                       = _score_education(resume, job)

        ats_score = round(
            skill_cs.weighted + exp_cs.weighted + kw_cs.weighted + edu_cs.weighted,
            1,
        )
        ats_score = max(0.0, min(ats_score, 100.0))

        suggestions = _generate_suggestions(
            skill_cs, exp_cs, kw_cs, edu_cs,
            missing_skills, missing_kw,
            exp_gap, edu_met,
            resume, job,
        )

        result = ATSScoreResult(
            ats_score=ats_score,
            grade=_grade(ats_score),
            components=[skill_cs, exp_cs, kw_cs, edu_cs],
            matched_skills=matched_skills,
            missing_skills=missing_skills,
            bonus_skills=bonus_skills,
            matched_keywords=matched_kw,
            missing_keywords=missing_kw,
            suggestions=suggestions,
            experience_gap=round(exp_gap, 1),
            education_met=edu_met,
        )

        logger.info(
            "ATS scored: %.1f (%s) | skills %.0f | exp %.0f | kw %.0f | edu %.0f",
            ats_score, result.grade,
            skill_cs.raw_score, exp_cs.raw_score,
            kw_cs.raw_score, edu_cs.raw_score,
        )
        return result

    def score_batch(
        self,
        resume: ResumeProfile,
        jobs: list[JobProfile],
        top_n: int = 5,
    ) -> list[tuple[int, ATSScoreResult]]:
        """
        Score one resume against many jobs.
        Returns (job_index, ATSScoreResult) list sorted by ats_score desc.
        """
        scored = [(i, self.score(resume, job)) for i, job in enumerate(jobs)]
        scored.sort(key=lambda x: x[1].ats_score, reverse=True)
        return scored[:top_n]


# ─────────────────────────────────────────────────────────────────────────────
# CLI demo
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    resume = ResumeProfile(
        skills=["Python", "FastAPI", "PostgreSQL", "Docker", "AWS", "Git", "Redis"],
        experience_years=4.0,
        job_titles=["Software Engineer", "Backend Developer"],
        education_level="bachelor",
        education_field="Computer Science",
        raw_text=(
            "Designed and built scalable payment REST APIs using Python and FastAPI. "
            "Managed PostgreSQL and Redis caching. Deployed services on AWS with Docker. "
            "Reduced API latency by 40% through query optimisation. "
            "Implemented automated CI/CD pipelines using GitHub Actions. "
            "Mentored two junior engineers on backend best practices."
        ),
    )

    job = JobProfile(
        required_skills=["Python", "FastAPI", "PostgreSQL", "Redis", "AWS", "Docker", "REST", "Git"],
        nice_to_have=["Kubernetes", "Terraform", "Go"],
        experience_years=5,
        job_title="Senior Backend Engineer",
        description=(
            "Build and scale payment infrastructure handling millions of transactions. "
            "Design RESTful APIs using FastAPI and Python. "
            "Manage PostgreSQL and Redis data layers. "
            "Deploy microservices on AWS using Docker and Kubernetes. "
            "Requires deep understanding of distributed systems and high-availability architecture. "
            "Terraform for infrastructure-as-code. Strong Python and Go skills preferred."
        ),
        education_level="bachelor",
        education_field="Computer Science",
    )

    scorer = ATSScorer()
    result = scorer.score(resume, job)

    W = 62
    print("\n" + "=" * W)
    print(f"{'ATS SCORE REPORT':^{W}}")
    print("=" * W)
    print(f"  Final ATS Score  : {result.ats_score:>5.1f} / 100   Grade: {result.grade}")
    print(f"  Education met    : {'Yes' if result.education_met else 'No'}")
    print(f"  Experience gap   : {result.experience_gap:.1f} yr(s)")
    print("-" * W)
    print(f"  {'Component':<26} {'Raw':>5}   {'Weight':>6}   {'Weighted':>8}")
    print("-" * W)
    for c in result.components:
        print(f"  {c.name:<26} {c.raw_score:>5.1f}   {c.weight*100:>5.0f}%   {c.weighted:>8.2f}")
    print("-" * W)
    print(f"\n  Matched skills  : {', '.join(result.matched_skills) or 'None'}")
    print(f"  Missing skills  : {', '.join(result.missing_skills) or 'None'}")
    print(f"  Bonus skills    : {', '.join(result.bonus_skills) or 'None'}")
    print(f"\n  Top keywords matched : {', '.join(result.matched_keywords[:6]) or 'None'}")
    print(f"  Missing keywords     : {', '.join(result.missing_keywords[:6]) or 'None'}")
    print("\n  Suggestions:")
    for i, s in enumerate(result.suggestions, 1):
        print(f"  {i}. {s}")
    print("=" * W)
