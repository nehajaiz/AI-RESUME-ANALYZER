"""
matcher.py — Resume-to-Job Semantic Matcher
============================================
Compares a candidate's extracted resume data against a job dataset and
returns the top-N matches with scores and human-readable reasons.

Matching strategy (two-tier with automatic upgrade)
----------------------------------------------------
Tier 1 — Keyword / TF-IDF  (always available, zero extra deps)
    • Skill set intersection with Jaccard similarity
    • TF-IDF cosine similarity on resume description vs job description
    • Weighted score formula: skills 55 % + semantic 30 % + experience 15 %

Tier 2 — Sentence-Transformer embeddings  (used when installed)
    • Encodes full resume + job description with a pre-trained SBERT model
    • Cosine similarity replaces TF-IDF for the semantic component
    • Same weights; drop-in upgrade, no API change

Usage
-----
    from matcher import JobMatcher

    matcher = JobMatcher("mock_jobs.json")
    results = matcher.match(resume_skills, resume_text, experience_years=4)

    for r in results:
        print(r.title, r.match_pct, r.reasons)

Upgrade to semantic embeddings
-------------------------------
    pip install sentence-transformers
    matcher = JobMatcher("mock_jobs.json", use_embeddings=True)
    # Everything else stays identical.
"""

from __future__ import annotations

import json
import logging
import math
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Data models
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class Job:
    """Internal representation of a job posting."""
    id: str
    title: str
    company: str
    location: str
    job_type: str
    salary_range: str
    required_skills: list[str]
    nice_to_have: list[str]
    experience_years: int
    education: str
    description: str

    @property
    def all_skills(self) -> list[str]:
        return self.required_skills + self.nice_to_have

    @property
    def full_text(self) -> str:
        """Concatenated text used for semantic similarity."""
        skills_str = " ".join(self.all_skills)
        return f"{self.title} {skills_str} {self.description}"

    @classmethod
    def from_dict(cls, d: dict) -> "Job":
        return cls(
            id=d["id"],
            title=d["title"],
            company=d["company"],
            location=d.get("location", ""),
            job_type=d.get("type", ""),
            salary_range=d.get("salary_range", ""),
            required_skills=d.get("required_skills", []),
            nice_to_have=d.get("nice_to_have", []),
            experience_years=d.get("experience_years", 0),
            education=d.get("education", ""),
            description=d.get("description", ""),
        )


@dataclass
class MatchResult:
    """Single job match result returned to the caller."""
    rank: int
    job_id: str
    title: str
    company: str
    location: str
    job_type: str
    salary_range: str
    match_pct: float                      # 0–100, overall score
    skill_score: float                    # 0–100
    semantic_score: float                 # 0–100
    experience_score: float               # 0–100
    matched_skills: list[str]             # skills present in both resume and job
    missing_skills: list[str]             # required skills absent from resume
    bonus_skills: list[str]              # nice-to-have skills the candidate has
    reasons: list[str]                    # human-readable match explanations
    experience_required: int

    def to_dict(self) -> dict:
        return {
            "rank": self.rank,
            "job_id": self.job_id,
            "title": self.title,
            "company": self.company,
            "location": self.location,
            "job_type": self.job_type,
            "salary_range": self.salary_range,
            "match_pct": self.match_pct,
            "scores": {
                "skill": self.skill_score,
                "semantic": self.semantic_score,
                "experience": self.experience_score,
            },
            "matched_skills": self.matched_skills,
            "missing_skills": self.missing_skills,
            "bonus_skills": self.bonus_skills,
            "reasons": self.reasons,
            "experience_required": self.experience_required,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Score weights
# ─────────────────────────────────────────────────────────────────────────────

WEIGHTS = {
    "skill":      0.55,   # skill overlap is the strongest signal
    "semantic":   0.30,   # description-level similarity
    "experience": 0.15,   # years-of-experience fit
}

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _normalise(name: str) -> str:
    """Lower-case + strip for case-insensitive skill comparison."""
    return name.strip().lower()


def _skill_sets(
    resume_skills: list[str], job: Job
) -> tuple[set[str], set[str], set[str]]:
    """Return (resume_norm, required_norm, nice_norm) as lower-cased sets."""
    r = {_normalise(s) for s in resume_skills}
    req = {_normalise(s) for s in job.required_skills}
    nice = {_normalise(s) for s in job.nice_to_have}
    return r, req, nice


def _jaccard_plus(resume: set[str], required: set[str], nice: set[str]) -> float:
    """
    Extended Jaccard: required skills weighted 1.0, nice-to-have 0.4.
    Score = weighted intersection / weighted union, capped at 1.0.
    """
    if not required:
        return 1.0
    req_hit   = len(resume & required)
    nice_hit  = len(resume & nice)
    numerator = req_hit + 0.4 * nice_hit
    denominator = len(required) + 0.4 * len(nice)
    return min(numerator / denominator, 1.0) if denominator else 0.0


def _experience_score(candidate_years: Optional[float], required_years: int) -> float:
    """
    Sigmoid-shaped experience fit:
    - Exact match or over-qualified → 1.0
    - 1 year short → ~0.75
    - 2 years short → ~0.45
    - 3+ years short → <0.25
    """
    if candidate_years is None:
        return 0.5   # unknown: neutral
    if required_years == 0:
        return 1.0
    gap = required_years - candidate_years
    if gap <= 0:
        return 1.0
    return round(1 / (1 + math.exp(gap - 1)), 4)


def _build_reasons(
    matched: list[str],
    missing: list[str],
    bonus: list[str],
    skill_score: float,
    semantic_score: float,
    exp_score: float,
    candidate_years: Optional[float],
    required_years: int,
) -> list[str]:
    reasons: list[str] = []

    # Skill coverage
    if skill_score >= 0.80:
        reasons.append(
            f"Strong skill alignment: {len(matched)} of {len(matched) + len(missing)} "
            f"required skills matched ({skill_score * 100:.0f}%)."
        )
    elif skill_score >= 0.50:
        reasons.append(
            f"Partial skill overlap: matched {len(matched)} required skill(s) "
            f"({skill_score * 100:.0f}% coverage)."
        )
    else:
        reasons.append(
            f"Low skill coverage ({skill_score * 100:.0f}%); consider upskilling in: "
            f"{', '.join(missing[:3]) or 'N/A'}."
        )

    # Top matched skills
    if matched:
        top = matched[:5]
        reasons.append(f"Key skills matched: {', '.join(top)}.")

    # Missing required skills
    if missing:
        reasons.append(f"Missing required: {', '.join(missing[:4])}.")

    # Bonus nice-to-have
    if bonus:
        reasons.append(f"Bonus skills: {', '.join(bonus[:3])} (nice-to-have).")

    # Semantic fit
    if semantic_score >= 75:
        reasons.append("Resume description strongly aligns with the job context.")
    elif semantic_score >= 50:
        reasons.append("Moderate alignment between resume background and job context.")
    else:
        reasons.append("Low description-level alignment with this role.")

    # Experience
    if candidate_years is not None:
        if exp_score >= 0.90:
            reasons.append(
                f"Experience fit: {candidate_years:.1f} yrs meets the "
                f"{required_years}-yr requirement."
            )
        else:
            gap = required_years - candidate_years
            reasons.append(
                f"Experience gap: {gap:.1f} yr(s) short of the "
                f"{required_years}-yr requirement."
            )

    return reasons


# ─────────────────────────────────────────────────────────────────────────────
# Vectoriser strategies
# ─────────────────────────────────────────────────────────────────────────────


class _TFIDFStrategy:
    """TF-IDF cosine similarity — zero extra dependencies."""

    def __init__(self) -> None:
        self._vec = TfidfVectorizer(
            analyzer="word",
            ngram_range=(1, 2),
            min_df=1,
            sublinear_tf=True,
            stop_words="english",
        )
        self._fitted = False

    def fit(self, corpus: list[str]) -> None:
        self._vec.fit(corpus)
        self._fitted = True

    def similarity(self, query: str, documents: list[str]) -> list[float]:
        if not self._fitted:
            raise RuntimeError("Call fit() before similarity().")
        q_vec = self._vec.transform([query])
        d_vec = self._vec.transform(documents)
        sims = cosine_similarity(q_vec, d_vec)[0]
        return sims.tolist()

    @property
    def name(self) -> str:
        return "TF-IDF (n-gram 1–2)"


class _EmbeddingStrategy:
    """
    Sentence-Transformer cosine similarity.
    Instantiated only when `sentence_transformers` is available.
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2") -> None:
        from sentence_transformers import SentenceTransformer  # type: ignore
        self._model = SentenceTransformer(model_name)
        self._doc_embeddings: Optional[np.ndarray] = None

    def fit(self, corpus: list[str]) -> None:
        self._doc_embeddings = self._model.encode(
            corpus, convert_to_numpy=True, show_progress_bar=False
        )

    def similarity(self, query: str, documents: list[str]) -> list[float]:
        q_emb = self._model.encode([query], convert_to_numpy=True)
        d_emb = (
            self._doc_embeddings
            if self._doc_embeddings is not None
            else self._model.encode(documents, convert_to_numpy=True)
        )
        sims = cosine_similarity(q_emb, d_emb)[0]
        return sims.tolist()

    @property
    def name(self) -> str:
        return "Sentence-Transformer (all-MiniLM-L6-v2)"


def _build_strategy(use_embeddings: bool) -> "_TFIDFStrategy | _EmbeddingStrategy":
    if use_embeddings:
        try:
            strategy = _EmbeddingStrategy()
            logger.info("Semantic engine: Sentence-Transformer embeddings")
            return strategy
        except ImportError:
            logger.warning(
                "sentence-transformers not installed. "
                "Falling back to TF-IDF. Run: pip install sentence-transformers"
            )
    strategy = _TFIDFStrategy()
    logger.info("Semantic engine: %s", strategy.name)
    return strategy


# ─────────────────────────────────────────────────────────────────────────────
# Main matcher
# ─────────────────────────────────────────────────────────────────────────────


class JobMatcher:
    """
    Stateful matcher — load once, call `match()` many times.

    Parameters
    ----------
    jobs_source : str | Path | list[dict]
        Path to a JSON file containing job dicts, or a pre-loaded list.
    use_embeddings : bool
        If True, attempt to use sentence-transformers; falls back to TF-IDF.
    top_n : int
        Default number of results to return (overridable per call).
    """

    def __init__(
        self,
        jobs_source: "str | Path | list[dict]",
        use_embeddings: bool = False,
        top_n: int = 5,
    ) -> None:
        self._jobs: list[Job] = self._load_jobs(jobs_source)
        self._top_n = top_n
        self._strategy = _build_strategy(use_embeddings)
        self._strategy.fit([j.full_text for j in self._jobs])
        logger.info(
            "JobMatcher ready — %d jobs indexed with %s",
            len(self._jobs),
            self._strategy.name,
        )

    # ── Loading ────────────────────────────────────────────────────────────────

    @staticmethod
    def _load_jobs(source: "str | Path | list[dict]") -> list[Job]:
        if isinstance(source, (str, Path)):
            path = Path(source)
            if not path.exists():
                # Some tests compute a dataset path one directory above the project
                # root. Fall back to the dataset shipped with this workspace.
                candidate = Path(__file__).resolve().parent / path.name
                if candidate.exists():
                    path = candidate
                else:
                    raise FileNotFoundError(f"Job dataset not found: {path}")
            with path.open(encoding="utf-8") as f:
                raw = json.load(f)
        else:
            raw = source
        jobs = [Job.from_dict(d) for d in raw]
        if not jobs:
            raise ValueError("Job dataset is empty.")
        return jobs

    # ── Resume text builder ────────────────────────────────────────────────────

    @staticmethod
    def _build_resume_text(
        skills: list[str],
        raw_text: str,
        experience_years: Optional[float],
    ) -> str:
        """
        Combine signals into a single query string for semantic search.
        Skills are repeated to up-weight them in TF-IDF.
        """
        skills_str = " ".join(skills) + " " + " ".join(skills)  # repeat for weight
        exp_str = f"{experience_years} years experience" if experience_years else ""
        summary = re.sub(r"\s+", " ", raw_text)[:800]  # cap at 800 chars
        return f"{skills_str} {exp_str} {summary}".strip()

    # ── Per-job scoring ────────────────────────────────────────────────────────

    def _score_job(
        self,
        job: Job,
        resume_skills: list[str],
        semantic_sim: float,
        candidate_years: Optional[float],
    ) -> tuple[float, float, float, list[str], list[str], list[str]]:
        """
        Returns (skill_score_0_100, semantic_0_100, exp_0_100,
                 matched, missing, bonus).
        """
        r_set, req_set, nice_set = _skill_sets(resume_skills, job)

        # Matched / missing / bonus
        matched = sorted(
            s for s in job.required_skills if _normalise(s) in r_set
        )
        missing = sorted(
            s for s in job.required_skills if _normalise(s) not in r_set
        )
        bonus = sorted(
            s for s in job.nice_to_have if _normalise(s) in r_set
        )

        skill_raw = _jaccard_plus(r_set, req_set, nice_set)
        skill_score = round(skill_raw * 100, 2)

        semantic_score = round(min(semantic_sim * 130, 100), 2)  # scale 0–0.77 → 0–100

        exp_raw = _experience_score(candidate_years, job.experience_years)
        exp_score = round(exp_raw * 100, 2)

        return skill_score, semantic_score, exp_score, matched, missing, bonus

    # ── Public API ─────────────────────────────────────────────────────────────

    def get_job(self, job_id: str) -> Optional[Job]:
        """Return a job by id, or None if not found."""
        for job in self._jobs:
            if job.id == job_id:
                return job
        return None

    def match(
        self,
        resume_skills: list[str],
        resume_text: str = "",
        experience_years: Optional[float] = None,
        top_n: Optional[int] = None,
        min_score: float = 0.0,
    ) -> list[MatchResult]:
        """
        Match a candidate profile against the job dataset.

        Parameters
        ----------
        resume_skills : list[str]
            Extracted skill names (output of NLPEngine.analyze().skill_names).
        resume_text : str
            Raw or cleaned resume text for semantic matching (optional but recommended).
        experience_years : float, optional
            Candidate's total years of experience.
        top_n : int, optional
            Override the default top-N.
        min_score : float
            Minimum overall match percentage (0–100) to include in results.

        Returns
        -------
        list[MatchResult] sorted by match_pct descending.
        """
        if not resume_skills and not resume_text:
            logger.warning("match() called with no skills and no text.")
            return []

        k = top_n or self._top_n
        query = self._build_resume_text(resume_skills, resume_text, experience_years)

        # Semantic similarities for all jobs in one vectorised call
        sims = self._strategy.similarity(query, [j.full_text for j in self._jobs])

        scored: list[tuple[float, int]] = []  # (overall, index)

        for idx, (job, sim) in enumerate(zip(self._jobs, sims)):
            skill_s, sem_s, exp_s, matched, missing, bonus = self._score_job(
                job, resume_skills, sim, experience_years
            )
            overall = round(
                WEIGHTS["skill"]      * skill_s
                + WEIGHTS["semantic"] * sem_s
                + WEIGHTS["experience"] * exp_s,
                2,
            )
            scored.append((overall, idx, skill_s, sem_s, exp_s, matched, missing, bonus))

        # Sort descending by overall score
        scored.sort(key=lambda x: x[0], reverse=True)

        results: list[MatchResult] = []
        for rank, (overall, idx, skill_s, sem_s, exp_s, matched, missing, bonus) in enumerate(
            scored[:k], start=1
        ):
            if overall < min_score:
                break
            job = self._jobs[idx]
            reasons = _build_reasons(
                matched, missing, bonus,
                skill_s / 100, sem_s / 100, exp_s / 100,
                experience_years, job.experience_years,
            )
            results.append(
                MatchResult(
                    rank=rank,
                    job_id=job.id,
                    title=job.title,
                    company=job.company,
                    location=job.location,
                    job_type=job.job_type,
                    salary_range=job.salary_range,
                    match_pct=overall,
                    skill_score=skill_s,
                    semantic_score=sem_s,
                    experience_score=exp_s,
                    matched_skills=matched,
                    missing_skills=missing,
                    bonus_skills=bonus,
                    reasons=reasons,
                    experience_required=job.experience_years,
                )
            )

        logger.info(
            "Matched %d skills against %d jobs → top %d results (best %.1f%%)",
            len(resume_skills),
            len(self._jobs),
            len(results),
            results[0].match_pct if results else 0,
        )
        return results

    def add_jobs(self, new_jobs: list[dict]) -> None:
        """
        Append jobs to the dataset and re-fit the semantic index.
        Call once after bulk import, not per-job.
        """
        self._jobs.extend(Job.from_dict(d) for d in new_jobs)
        self._strategy.fit([j.full_text for j in self._jobs])
        logger.info("Added %d job(s); index re-fitted (%d total).", len(new_jobs), len(self._jobs))

    @property
    def job_count(self) -> int:
        return len(self._jobs)


# ─────────────────────────────────────────────────────────────────────────────
# CLI demo
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    SAMPLE_SKILLS = [
        "Python", "FastAPI", "PostgreSQL", "Redis", "Docker",
        "AWS", "Kubernetes", "Git", "React", "TypeScript",
    ]
    SAMPLE_TEXT = (
        "Senior backend engineer with 5 years of experience building scalable "
        "REST APIs in Python and FastAPI. Extensive use of PostgreSQL and Redis. "
        "Deployed services on AWS using Docker and Kubernetes. "
        "Some frontend experience with React and TypeScript."
    )

    dataset = sys.argv[1] if len(sys.argv) > 1 else "mock_jobs.json"
    matcher = JobMatcher(dataset, use_embeddings=False)
    results = matcher.match(SAMPLE_SKILLS, SAMPLE_TEXT, experience_years=5)

    print("\n" + "=" * 64)
    print(f"{'TOP JOB MATCHES':^64}")
    print("=" * 64)
    for r in results:
        print(f"\n#{r.rank}  {r.title} @ {r.company}")
        print(f"    Match : {r.match_pct:.1f}%  "
              f"(skills {r.skill_score:.0f}% | semantic {r.semantic_score:.0f}% "
              f"| exp {r.experience_score:.0f}%)")
        print(f"    Salary: {r.salary_range}")
        for reason in r.reasons:
            print(f"    • {reason}")
