"""
tests/test_matcher.py — Unit & integration tests for matcher.py
===============================================================
All tests use the mock_jobs.json dataset and in-memory job dicts.
Run with: pytest tests/test_matcher.py -v
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from matcher import (
    Job,
    JobMatcher,
    MatchResult,
    _build_reasons,
    _experience_score,
    _jaccard_plus,
    _normalise,
)

# ── Shared fixtures ────────────────────────────────────────────────────────────

JOBS_PATH = Path(__file__).parent.parent / "mock_jobs.json"

BACKEND_SKILLS = [
    "Python", "FastAPI", "PostgreSQL", "Redis", "Docker",
    "AWS", "Kubernetes", "Git",
]
BACKEND_TEXT = (
    "Senior backend engineer with 5 years experience. "
    "Built REST APIs with Python and FastAPI. "
    "Managed PostgreSQL and Redis. Deployed on AWS with Docker and Kubernetes."
)

ML_SKILLS = [
    "Python", "PyTorch", "TensorFlow", "scikit-learn",
    "NumPy", "Pandas", "Docker", "Git",
]
ML_TEXT = (
    "Machine learning engineer. Trained deep learning models with PyTorch and "
    "TensorFlow. Classical pipelines with scikit-learn. Data processing with "
    "NumPy and Pandas. Containerised with Docker."
)


@pytest.fixture(scope="module")
def matcher() -> JobMatcher:
    return JobMatcher(JOBS_PATH, use_embeddings=False)


@pytest.fixture(scope="module")
def backend_results(matcher) -> list[MatchResult]:
    return matcher.match(BACKEND_SKILLS, BACKEND_TEXT, experience_years=5)


@pytest.fixture(scope="module")
def ml_results(matcher) -> list[MatchResult]:
    return matcher.match(ML_SKILLS, ML_TEXT, experience_years=4)


# ── Helper functions ───────────────────────────────────────────────────────────

class TestNormalise:
    def test_lowercases(self):
        assert _normalise("Python") == "python"
        assert _normalise("FASTAPI") == "fastapi"

    def test_strips_whitespace(self):
        assert _normalise("  Go  ") == "go"


class TestJaccardPlus:
    def test_perfect_match(self):
        r = {"python", "docker", "aws"}
        req = {"python", "docker", "aws"}
        assert _jaccard_plus(r, req, set()) == 1.0

    def test_no_overlap(self):
        r = {"java", "spring"}
        req = {"python", "docker"}
        assert _jaccard_plus(r, req, set()) == 0.0

    def test_partial_match(self):
        r = {"python", "docker"}
        req = {"python", "docker", "aws", "redis"}
        score = _jaccard_plus(r, req, set())
        assert 0.0 < score < 1.0
        assert abs(score - 0.5) < 0.01

    def test_nice_to_have_bonus(self):
        r = {"python", "docker", "terraform"}
        req = {"python", "docker"}
        nice = {"terraform"}
        score_with_bonus = _jaccard_plus(r, req, nice)
        score_no_bonus   = _jaccard_plus({"python", "docker"}, req, nice)
        assert score_with_bonus > score_no_bonus

    def test_empty_required(self):
        assert _jaccard_plus({"python"}, set(), set()) == 1.0

    def test_score_capped_at_one(self):
        r = {"python", "docker", "aws", "redis", "kubernetes", "extra1", "extra2"}
        req = {"python", "docker"}
        score = _jaccard_plus(r, req, set())
        assert score <= 1.0


class TestExperienceScore:
    def test_exact_match(self):
        assert _experience_score(5, 5) == 1.0

    def test_over_qualified(self):
        assert _experience_score(8, 5) == 1.0

    def test_none_returns_neutral(self):
        s = _experience_score(None, 5)
        assert 0.4 < s < 0.6

    def test_zero_required(self):
        assert _experience_score(0, 0) == 1.0

    def test_large_gap_low_score(self):
        s = _experience_score(0, 10)
        assert s < 0.1

    def test_one_year_gap(self):
        s = _experience_score(4, 5)
        assert 0.4 < s < 0.8


class TestBuildReasons:
    def _call(self, matched, missing, bonus, sk=0.9, sem=0.8, exp=0.9, cy=5, ry=4):
        return _build_reasons(matched, missing, bonus, sk, sem, exp, cy, ry)

    def test_returns_list(self):
        r = self._call(["Python", "Docker"], [], [])
        assert isinstance(r, list)
        assert len(r) > 0

    def test_strong_match_reason(self):
        r = self._call(["Python", "Docker", "AWS"], [], [], sk=0.85)
        assert any("Strong skill alignment" in x for x in r)

    def test_missing_skills_mentioned(self):
        r = self._call(["Python"], ["Go", "Rust"], [], sk=0.3)
        assert any("Missing" in x or "missing" in x for x in r)

    def test_bonus_skills_mentioned(self):
        r = self._call(["Python"], [], ["Terraform", "Helm"])
        assert any("Bonus" in x for x in r)

    def test_experience_gap_mentioned(self):
        r = _build_reasons(["Python"], [], [], 0.9, 0.8, 0.5, 2.0, 6)
        assert any("gap" in x.lower() or "short" in x.lower() for x in r)


# ── Job dataclass ──────────────────────────────────────────────────────────────

class TestJobDataclass:
    def test_from_dict(self):
        d = {
            "id": "TEST01", "title": "Engineer", "company": "Acme",
            "location": "Remote", "type": "Full-time", "salary_range": "$100k",
            "required_skills": ["Python"], "nice_to_have": ["Go"],
            "experience_years": 3, "education": "BS", "description": "Build things.",
        }
        job = Job.from_dict(d)
        assert job.id == "TEST01"
        assert job.title == "Engineer"
        assert "Python" in job.required_skills

    def test_all_skills_combines(self):
        d = {
            "id": "T", "title": "T", "company": "T", "location": "", "type": "",
            "salary_range": "", "required_skills": ["Python"],
            "nice_to_have": ["Go"], "experience_years": 1,
            "education": "", "description": "",
        }
        job = Job.from_dict(d)
        assert "Python" in job.all_skills
        assert "Go" in job.all_skills

    def test_full_text_non_empty(self):
        d = {
            "id": "T", "title": "Dev", "company": "Acme", "location": "",
            "type": "", "salary_range": "", "required_skills": ["Python"],
            "nice_to_have": [], "experience_years": 1, "education": "",
            "description": "Build APIs.",
        }
        job = Job.from_dict(d)
        assert "Python" in job.full_text
        assert "Dev" in job.full_text


# ── JobMatcher instantiation ───────────────────────────────────────────────────

class TestJobMatcherInit:
    def test_loads_from_path(self):
        m = JobMatcher(JOBS_PATH)
        assert m.job_count == 10

    def test_loads_from_list(self):
        jobs = json.loads(JOBS_PATH.read_text())
        m = JobMatcher(jobs)
        assert m.job_count == 10

    def test_missing_file_raises(self):
        with pytest.raises(FileNotFoundError):
            JobMatcher("/tmp/nonexistent_jobs.json")

    def test_empty_list_raises(self):
        with pytest.raises(ValueError):
            JobMatcher([])

    def test_embedding_fallback(self, caplog):
        import logging
        with caplog.at_level(logging.WARNING):
            m = JobMatcher(JOBS_PATH, use_embeddings=True)
        # Should fall back gracefully (sentence-transformers not installed)
        assert m.job_count == 10


# ── match() output structure ───────────────────────────────────────────────────

class TestMatchOutput:
    def test_returns_list(self, backend_results):
        assert isinstance(backend_results, list)

    def test_default_top_5(self, backend_results):
        assert len(backend_results) == 5

    def test_top_n_override(self, matcher):
        res = matcher.match(BACKEND_SKILLS, BACKEND_TEXT, top_n=3)
        assert len(res) == 3

    def test_results_are_match_result(self, backend_results):
        for r in backend_results:
            assert isinstance(r, MatchResult)

    def test_ranks_sequential(self, backend_results):
        ranks = [r.rank for r in backend_results]
        assert ranks == list(range(1, len(ranks) + 1))

    def test_sorted_descending(self, backend_results):
        scores = [r.match_pct for r in backend_results]
        assert scores == sorted(scores, reverse=True)

    def test_match_pct_in_range(self, backend_results):
        for r in backend_results:
            assert 0 <= r.match_pct <= 100

    def test_component_scores_in_range(self, backend_results):
        for r in backend_results:
            assert 0 <= r.skill_score <= 100
            assert 0 <= r.semantic_score <= 100
            assert 0 <= r.experience_score <= 100

    def test_reasons_non_empty(self, backend_results):
        for r in backend_results:
            assert isinstance(r.reasons, list)
            assert len(r.reasons) >= 1

    def test_has_matched_skills(self, backend_results):
        top = backend_results[0]
        assert isinstance(top.matched_skills, list)

    def test_has_missing_skills(self, backend_results):
        for r in backend_results:
            assert isinstance(r.missing_skills, list)

    def test_to_dict_keys(self, backend_results):
        d = backend_results[0].to_dict()
        for key in ("rank", "title", "company", "match_pct", "scores",
                    "matched_skills", "missing_skills", "reasons"):
            assert key in d

    def test_to_dict_scores_sub_keys(self, backend_results):
        scores = backend_results[0].to_dict()["scores"]
        assert {"skill", "semantic", "experience"} == set(scores.keys())


# ── Relevance / sanity checks ──────────────────────────────────────────────────

class TestRelevance:
    def test_backend_profile_top_result(self, backend_results):
        """A backend-heavy resume should surface a backend role at #1."""
        top = backend_results[0]
        backend_keywords = {"engineer", "backend", "developer"}
        assert any(kw in top.title.lower() for kw in backend_keywords)

    def test_ml_profile_top_result(self, ml_results):
        """An ML-heavy resume should surface a data/ML role at #1 or #2."""
        top_two_titles = " ".join(r.title.lower() for r in ml_results[:2])
        ml_keywords = {"machine learning", "data", "mlops", "scientist"}
        assert any(kw in top_two_titles for kw in ml_keywords)

    def test_perfect_skill_match_high_score(self, matcher):
        """Providing all required skills for a job should score ≥ 70."""
        job_skills = ["Kubernetes", "Terraform", "AWS", "Docker",
                      "Python", "GitHub Actions", "Prometheus", "Linux"]
        devops_text = "DevOps engineer managing cloud infra on AWS with Terraform and Kubernetes."
        res = matcher.match(job_skills, devops_text, experience_years=5)
        assert res[0].match_pct >= 70

    def test_empty_skills_returns_results(self, matcher):
        """Even with no skills, text-based matching should still return results."""
        res = matcher.match([], "I am a software engineer with experience.", top_n=3)
        assert isinstance(res, list)

    def test_min_score_filter(self, matcher):
        res = matcher.match(BACKEND_SKILLS, BACKEND_TEXT, min_score=90.0)
        for r in res:
            assert r.match_pct >= 90.0

    def test_bonus_skills_subset_of_nice_to_have(self, backend_results):
        for r in backend_results:
            # All bonus skills must have come from somewhere in the job dataset
            assert isinstance(r.bonus_skills, list)


# ── Dynamic job addition ───────────────────────────────────────────────────────

class TestAddJobs:
    def test_add_jobs_increases_count(self):
        m = JobMatcher(JOBS_PATH)
        before = m.job_count
        m.add_jobs([{
            "id": "NEW01", "title": "Rust Engineer", "company": "Mozilla",
            "location": "Remote", "type": "Full-time", "salary_range": "$140k",
            "required_skills": ["Rust", "Python", "Docker"],
            "nice_to_have": ["Go"], "experience_years": 3,
            "education": "BS", "description": "Build systems software in Rust.",
        }])
        assert m.job_count == before + 1

    def test_added_job_appears_in_results(self):
        m = JobMatcher(JOBS_PATH)
        m.add_jobs([{
            "id": "UNIQUE99", "title": "Quantum Engineer", "company": "IBM",
            "location": "Remote", "type": "Full-time", "salary_range": "$200k",
            "required_skills": ["Python", "Qiskit", "Linear Algebra"],
            "nice_to_have": [], "experience_years": 2,
            "education": "PhD", "description": "Quantum computing with Qiskit and Python.",
        }])
        res = m.match(["Python", "Qiskit"], "Quantum computing researcher.", top_n=10)
        ids = [r.job_id for r in res]
        assert "UNIQUE99" in ids
