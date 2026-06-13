"""
tests/test_scorer.py — Unit & integration tests for scorer.py
=============================================================
Run with: pytest tests/test_scorer.py -v
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from scorer import (
    ATSScoreResult,
    ATSScorer,
    ComponentScore,
    JobProfile,
    ResumeProfile,
    WEIGHTS,
    _edu_index,
    _experience_sigmoid,
    _extract_keywords,
    _grade,
    _norm,
    _resolve_edu_level,
    _title_similarity,
    _verb_bonus,
    _score_education,
    _score_experience,
    _score_keywords,
    _score_skills,
)

# ─────────────────────────────────────────────────────────────────────────────
# Shared fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def strong_resume() -> ResumeProfile:
    return ResumeProfile(
        skills=["Python", "FastAPI", "PostgreSQL", "Redis", "AWS", "Docker", "Git", "REST"],
        experience_years=5.0,
        job_titles=["Senior Software Engineer", "Backend Engineer"],
        education_level="bachelor",
        education_field="Computer Science",
        raw_text=(
            "Designed and built scalable REST APIs using Python and FastAPI. "
            "Deployed microservices on AWS with Docker and Kubernetes. "
            "Managed PostgreSQL and Redis. Reduced latency by 40%. "
            "Implemented CI/CD pipelines. Mentored junior engineers."
        ),
    )


@pytest.fixture
def weak_resume() -> ResumeProfile:
    return ResumeProfile(
        skills=["HTML", "CSS"],
        experience_years=1.0,
        job_titles=["Intern"],
        education_level="diploma",
        education_field="Web Design",
        raw_text="Wrote HTML and CSS for small websites.",
    )


@pytest.fixture
def backend_job() -> JobProfile:
    return JobProfile(
        required_skills=["Python", "FastAPI", "PostgreSQL", "Redis", "AWS", "Docker", "REST", "Git"],
        nice_to_have=["Kubernetes", "Terraform", "Go"],
        experience_years=5,
        job_title="Senior Backend Engineer",
        description=(
            "Build and scale payment infrastructure handling millions of transactions. "
            "Design RESTful APIs using FastAPI and Python. "
            "Manage PostgreSQL and Redis data layers. "
            "Deploy microservices on AWS using Docker and Kubernetes. "
            "Terraform for infrastructure-as-code."
        ),
        education_level="bachelor",
        education_field="Computer Science",
    )


@pytest.fixture
def scorer() -> ATSScorer:
    return ATSScorer()


# ─────────────────────────────────────────────────────────────────────────────
# Helper function tests
# ─────────────────────────────────────────────────────────────────────────────

class TestNorm:
    def test_lowercases(self):
        assert _norm("Python") == "python"

    def test_strips(self):
        assert _norm("  Go  ") == "go"

    def test_empty(self):
        assert _norm("") == ""


class TestResolveEduLevel:
    def test_bachelor_aliases(self):
        for alias in ["bachelor", "bachelors", "bs", "b.s", "ba", "btech", "bsc"]:
            assert _resolve_edu_level(alias) == "bachelor", f"Failed for: {alias}"

    def test_master_aliases(self):
        for alias in ["master", "masters", "ms", "msc", "mba", "mtech"]:
            assert _resolve_edu_level(alias) == "master", f"Failed for: {alias}"

    def test_phd_aliases(self):
        for alias in ["phd", "ph.d", "doctorate"]:
            assert _resolve_edu_level(alias) == "phd", f"Failed for: {alias}"

    def test_unknown_returns_none(self):
        assert _resolve_edu_level("unknown_degree") == "none"

    def test_empty_string(self):
        assert _resolve_edu_level("") == "none"

    def test_case_insensitive(self):
        assert _resolve_edu_level("Bachelor") == "bachelor"
        assert _resolve_edu_level("MASTER") == "master"


class TestEduIndex:
    def test_ordering(self):
        assert _edu_index("none") < _edu_index("diploma")
        assert _edu_index("diploma") < _edu_index("associate")
        assert _edu_index("associate") < _edu_index("bachelor")
        assert _edu_index("bachelor") < _edu_index("master")
        assert _edu_index("master") < _edu_index("phd")

    def test_unknown_returns_zero(self):
        assert _edu_index("xyz") == 0


class TestGrade:
    def test_a_grade(self):
        assert _grade(85) == "A"
        assert _grade(100) == "A"

    def test_b_grade(self):
        assert _grade(70) == "B"
        assert _grade(84) == "B"

    def test_c_grade(self):
        assert _grade(55) == "C"
        assert _grade(69) == "C"

    def test_d_grade(self):
        assert _grade(40) == "D"
        assert _grade(54) == "D"

    def test_f_grade(self):
        assert _grade(0) == "F"
        assert _grade(39) == "F"


class TestExperienceSigmoid:
    def test_exact_match(self):
        assert _experience_sigmoid(5, 5) == 1.0

    def test_over_qualified(self):
        assert _experience_sigmoid(8, 5) == 1.0

    def test_zero_required(self):
        assert _experience_sigmoid(0, 0) == 1.0

    def test_large_gap_low_score(self):
        s = _experience_sigmoid(0, 10)
        assert s < 0.05

    def test_one_year_gap_mid_range(self):
        s = _experience_sigmoid(4, 5)
        assert 0.4 < s < 0.8

    def test_returns_between_0_and_1(self):
        for candidate in [0, 1, 3, 5, 10]:
            for required in [0, 1, 3, 5, 10]:
                s = _experience_sigmoid(candidate, required)
                assert 0.0 <= s <= 1.0


class TestTitleSimilarity:
    def test_exact_match(self):
        score = _title_similarity(["Senior Backend Engineer"], "Senior Backend Engineer")
        assert score == 1.0

    def test_no_titles_returns_neutral(self):
        assert _title_similarity([], "Senior Engineer") == 0.5

    def test_no_job_title_returns_neutral(self):
        assert _title_similarity(["Engineer"], "") == 0.5

    def test_partial_overlap(self):
        s = _title_similarity(["Software Engineer"], "Senior Backend Engineer")
        assert 0.0 < s < 1.0

    def test_no_overlap(self):
        s = _title_similarity(["Designer"], "Backend Engineer")
        # "Backend" and "Engineer" not in "Designer"
        assert s == 0.0

    def test_case_insensitive(self):
        s1 = _title_similarity(["BACKEND ENGINEER"], "Backend Engineer")
        s2 = _title_similarity(["backend engineer"], "Backend Engineer")
        assert abs(s1 - s2) < 0.01


class TestExtractKeywords:
    def test_returns_list(self):
        kws = _extract_keywords("Python FastAPI PostgreSQL Docker AWS deployment")
        assert isinstance(kws, list)

    def test_non_empty_for_real_text(self):
        kws = _extract_keywords("Build scalable REST APIs using Python and FastAPI on AWS.")
        assert len(kws) > 0

    def test_empty_string(self):
        kws = _extract_keywords("")
        assert kws == []

    def test_respects_top_n(self):
        text = " ".join([f"word{i}" for i in range(50)])
        kws = _extract_keywords(text, top_n=5)
        assert len(kws) <= 5


class TestVerbBonus:
    def test_no_verbs(self):
        assert _verb_bonus("wrote html pages for websites") == 0.0

    def test_strong_verbs_give_bonus(self):
        text = "Designed and built scalable systems. Deployed services. Reduced latency."
        bonus = _verb_bonus(text)
        assert bonus > 0.0

    def test_capped_at_five(self):
        text = " ".join([
            "designed built developed implemented architected led optimised "
            "scaled deployed automated reduced improved delivered managed created"
        ])
        assert _verb_bonus(text) <= 5.0

    def test_empty_string(self):
        assert _verb_bonus("") == 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Component score tests
# ─────────────────────────────────────────────────────────────────────────────

class TestScoreSkills:
    def test_perfect_match(self, backend_job):
        # 100% requires matching all required AND nice-to-have (weighted Jaccard)
        all_skills = backend_job.required_skills + backend_job.nice_to_have
        resume = ResumeProfile(skills=all_skills)
        cs, _, missing, _ = _score_skills(resume, backend_job)
        assert cs.raw_score == 100.0
        assert missing == []

    def test_all_required_matched_high_score(self, strong_resume, backend_job):
        # All required matched (no nice-to-have) -> score still > 85
        cs, _, missing, _ = _score_skills(strong_resume, backend_job)
        assert missing == []
        assert cs.raw_score > 85

    def test_no_match(self, weak_resume, backend_job):
        cs, matched, missing, bonus = _score_skills(weak_resume, backend_job)
        assert cs.raw_score < 10
        assert len(missing) > 0

    def test_nice_to_have_adds_bonus(self, backend_job):
        resume = ResumeProfile(
            skills=["Python", "FastAPI", "PostgreSQL", "Redis", "AWS", "Docker", "REST", "Git",
                    "Kubernetes"],  # Kubernetes is nice-to-have
        )
        cs_with, _, _, bonus_with = _score_skills(resume, backend_job)
        resume_no_k8s = ResumeProfile(
            skills=["Python", "FastAPI", "PostgreSQL", "Redis", "AWS", "Docker", "REST", "Git"],
        )
        cs_without, _, _, bonus_without = _score_skills(resume_no_k8s, backend_job)
        assert cs_with.raw_score > cs_without.raw_score
        assert "Kubernetes" in bonus_with

    def test_matched_are_subset_of_required(self, strong_resume, backend_job):
        _, matched, _, _ = _score_skills(strong_resume, backend_job)
        required_lower = {s.lower() for s in backend_job.required_skills}
        for m in matched:
            assert m.lower() in required_lower

    def test_weight_applied(self, strong_resume, backend_job):
        cs, _, _, _ = _score_skills(strong_resume, backend_job)
        assert abs(cs.weighted - cs.raw_score * WEIGHTS["skill"]) < 0.1

    def test_score_between_0_and_100(self, weak_resume, backend_job):
        cs, _, _, _ = _score_skills(weak_resume, backend_job)
        assert 0 <= cs.raw_score <= 100

    def test_empty_required_skills_perfect_score(self):
        resume = ResumeProfile(skills=["Python"])
        job = JobProfile(required_skills=[], nice_to_have=[])
        cs, _, _, _ = _score_skills(resume, job)
        assert cs.raw_score == 100.0

    def test_case_insensitive_matching(self):
        resume = ResumeProfile(skills=["python", "fastapi"])
        job = JobProfile(required_skills=["Python", "FastAPI"])
        cs, matched, missing, _ = _score_skills(resume, job)
        assert cs.raw_score == 100.0
        assert missing == []


class TestScoreExperience:
    def test_exact_years_full_score(self, backend_job):
        resume = ResumeProfile(experience_years=5, job_titles=["Senior Backend Engineer"])
        cs, gap = _score_experience(resume, backend_job)
        assert gap == 0.0
        assert cs.raw_score >= 85

    def test_experience_gap_reported(self, backend_job):
        resume = ResumeProfile(experience_years=3.0, job_titles=[])
        cs, gap = _score_experience(resume, backend_job)
        assert gap == 2.0

    def test_none_experience_neutral(self, backend_job):
        resume = ResumeProfile(experience_years=None)
        cs, gap = _score_experience(resume, backend_job)
        assert 40 <= cs.raw_score <= 70

    def test_weight_applied(self, strong_resume, backend_job):
        cs, _ = _score_experience(strong_resume, backend_job)
        assert abs(cs.weighted - cs.raw_score * WEIGHTS["experience"]) < 0.1

    def test_title_match_boosts_score(self, backend_job):
        r_good = ResumeProfile(experience_years=5, job_titles=["Senior Backend Engineer"])
        r_poor = ResumeProfile(experience_years=5, job_titles=["Graphic Designer"])
        cs_good, _ = _score_experience(r_good, backend_job)
        cs_poor, _ = _score_experience(r_poor, backend_job)
        assert cs_good.raw_score > cs_poor.raw_score


class TestScoreKeywords:
    def test_high_overlap_high_score(self, strong_resume, backend_job):
        cs, matched, missing = _score_keywords(strong_resume, backend_job)
        assert cs.raw_score > 20

    def test_zero_overlap_zero_base(self):
        resume = ResumeProfile(raw_text="I like cats and dogs.")
        job = JobProfile(description="Kubernetes Terraform Ansible Prometheus Grafana DevOps.")
        cs, matched, _ = _score_keywords(resume, job)
        assert cs.raw_score < 30

    def test_returns_lists(self, strong_resume, backend_job):
        cs, matched, missing = _score_keywords(strong_resume, backend_job)
        assert isinstance(matched, list)
        assert isinstance(missing, list)

    def test_matched_plus_missing_equals_total(self, strong_resume, backend_job):
        cs, matched, missing = _score_keywords(strong_resume, backend_job)
        from scorer import _extract_keywords
        jd_kws = _extract_keywords(backend_job.description, top_n=20)
        assert len(matched) + len(missing) == len(jd_kws)

    def test_action_verbs_add_bonus(self):
        with_verbs = ResumeProfile(
            raw_text="Designed and built systems. Deployed services. Reduced latency.",
        )
        without_verbs = ResumeProfile(raw_text="systems deployment latency")
        job = JobProfile(description="Build and deploy systems to reduce latency.")
        cs_v, _, _ = _score_keywords(with_verbs, job)
        cs_nv, _, _ = _score_keywords(without_verbs, job)
        assert cs_v.raw_score >= cs_nv.raw_score

    def test_score_capped_at_100(self):
        long_text = " ".join(["python fastapi aws docker kubernetes"] * 50)
        resume = ResumeProfile(raw_text=long_text)
        job = JobProfile(description=long_text)
        cs, _, _ = _score_keywords(resume, job)
        assert cs.raw_score <= 100.0


class TestScoreEducation:
    def test_met_same_level(self, backend_job):
        resume = ResumeProfile(education_level="bachelor", education_field="Computer Science")
        cs, met = _score_education(resume, backend_job)
        assert met is True
        assert cs.raw_score >= 80

    def test_over_qualified_no_penalty(self, backend_job):
        resume = ResumeProfile(education_level="phd", education_field="Computer Science")
        cs, met = _score_education(resume, backend_job)
        assert met is True
        assert cs.raw_score >= 80

    def test_not_met_reduces_score(self, backend_job):
        resume = ResumeProfile(education_level="diploma")
        cs, met = _score_education(resume, backend_job)
        assert met is False
        assert cs.raw_score < 80

    def test_field_alignment_bonus(self, backend_job):
        r_match    = ResumeProfile(education_level="bachelor", education_field="Computer Science")
        r_mismatch = ResumeProfile(education_level="bachelor", education_field="Literature")
        cs_match,    _ = _score_education(r_match,    backend_job)
        cs_mismatch, _ = _score_education(r_mismatch, backend_job)
        assert cs_match.raw_score > cs_mismatch.raw_score

    def test_score_between_0_and_100(self):
        for edu in ["none", "diploma", "associate", "bachelor", "master", "phd"]:
            resume = ResumeProfile(education_level=edu)
            job    = JobProfile(education_level="master")
            cs, _ = _score_education(resume, job)
            assert 0 <= cs.raw_score <= 100

    def test_weight_applied(self, strong_resume, backend_job):
        cs, _ = _score_education(strong_resume, backend_job)
        assert abs(cs.weighted - cs.raw_score * WEIGHTS["education"]) < 0.1


# ─────────────────────────────────────────────────────────────────────────────
# ATSScorer integration tests
# ─────────────────────────────────────────────────────────────────────────────

class TestATSScorerOutput:
    def test_returns_ats_score_result(self, scorer, strong_resume, backend_job):
        result = scorer.score(strong_resume, backend_job)
        assert isinstance(result, ATSScoreResult)

    def test_score_in_range(self, scorer, strong_resume, backend_job):
        result = scorer.score(strong_resume, backend_job)
        assert 0.0 <= result.ats_score <= 100.0

    def test_grade_valid(self, scorer, strong_resume, backend_job):
        result = scorer.score(strong_resume, backend_job)
        assert result.grade in {"A", "B", "C", "D", "F"}

    def test_four_components(self, scorer, strong_resume, backend_job):
        result = scorer.score(strong_resume, backend_job)
        assert len(result.components) == 4

    def test_component_names(self, scorer, strong_resume, backend_job):
        result = scorer.score(strong_resume, backend_job)
        names = {c.name for c in result.components}
        assert names == {"Skill Match", "Experience Relevance", "Keyword Optimisation", "Education Fit"}

    def test_weighted_sum_equals_ats_score(self, scorer, strong_resume, backend_job):
        result = scorer.score(strong_resume, backend_job)
        total = round(sum(c.weighted for c in result.components), 1)
        assert abs(total - result.ats_score) < 0.2

    def test_strong_resume_beats_weak(self, scorer, strong_resume, weak_resume, backend_job):
        strong_r = scorer.score(strong_resume, backend_job)
        weak_r   = scorer.score(weak_resume, backend_job)
        assert strong_r.ats_score > weak_r.ats_score

    def test_matched_skills_non_empty_for_strong(self, scorer, strong_resume, backend_job):
        result = scorer.score(strong_resume, backend_job)
        assert len(result.matched_skills) > 0

    def test_missing_skills_empty_for_perfect(self, scorer, backend_job):
        perfect = ResumeProfile(
            skills=backend_job.required_skills[:],
            experience_years=5,
            education_level="bachelor",
        )
        result = scorer.score(perfect, backend_job)
        assert result.missing_skills == []

    def test_missing_skills_all_for_empty_resume(self, scorer, backend_job):
        empty = ResumeProfile()
        result = scorer.score(empty, backend_job)
        assert len(result.missing_skills) == len(backend_job.required_skills)

    def test_suggestions_non_empty(self, scorer, strong_resume, backend_job):
        result = scorer.score(strong_resume, backend_job)
        assert len(result.suggestions) >= 1
        assert all(isinstance(s, str) for s in result.suggestions)

    def test_experience_gap_correct(self, scorer, backend_job):
        resume = ResumeProfile(skills=["Python"], experience_years=3.0)
        result = scorer.score(resume, backend_job)
        assert result.experience_gap == 2.0

    def test_experience_gap_zero_when_met(self, scorer, backend_job):
        resume = ResumeProfile(experience_years=5.0)
        result = scorer.score(resume, backend_job)
        assert result.experience_gap == 0.0

    def test_education_met_true_for_qualified(self, scorer, backend_job):
        resume = ResumeProfile(education_level="bachelor")
        result = scorer.score(resume, backend_job)
        assert result.education_met is True

    def test_education_met_false_for_unqualified(self, scorer, backend_job):
        resume = ResumeProfile(education_level="none")
        result = scorer.score(resume, backend_job)
        assert result.education_met is False

    def test_to_dict_structure(self, scorer, strong_resume, backend_job):
        result = scorer.score(strong_resume, backend_job)
        d = result.to_dict()
        for key in ("ats_score", "grade", "components", "matched_skills",
                    "missing_skills", "bonus_skills", "matched_keywords",
                    "missing_keywords", "suggestions", "experience_gap", "education_met"):
            assert key in d

    def test_to_dict_is_json_serialisable(self, scorer, strong_resume, backend_job):
        import json
        result = scorer.score(strong_resume, backend_job)
        d = result.to_dict()
        json_str = json.dumps(d)
        assert len(json_str) > 10

    def test_deterministic(self, scorer, strong_resume, backend_job):
        r1 = scorer.score(strong_resume, backend_job)
        r2 = scorer.score(strong_resume, backend_job)
        assert r1.ats_score == r2.ats_score


class TestBatchScoring:
    def test_batch_returns_sorted_list(self, scorer, strong_resume):
        jobs = [
            JobProfile(required_skills=["Python"], job_title="Python Dev"),
            JobProfile(required_skills=["Java", "Spring Boot"], job_title="Java Dev"),
            JobProfile(required_skills=["Python", "FastAPI"], job_title="Backend Dev"),
        ]
        results = scorer.score_batch(strong_resume, jobs, top_n=3)
        scores = [r.ats_score for _, r in results]
        assert scores == sorted(scores, reverse=True)

    def test_batch_top_n_respected(self, scorer, strong_resume):
        jobs = [JobProfile(required_skills=["Python"]) for _ in range(5)]
        results = scorer.score_batch(strong_resume, jobs, top_n=2)
        assert len(results) == 2

    def test_batch_returns_tuples(self, scorer, strong_resume):
        jobs = [JobProfile(required_skills=["Python"])]
        results = scorer.score_batch(strong_resume, jobs)
        idx, res = results[0]
        assert isinstance(idx, int)
        assert isinstance(res, ATSScoreResult)


class TestSuggestionQuality:
    def test_missing_skills_mentioned_in_suggestions(self, scorer, weak_resume, backend_job):
        result = scorer.score(weak_resume, backend_job)
        all_text = " ".join(result.suggestions).lower()
        # At least one missing skill should appear in suggestions
        assert any(s.lower() in all_text for s in result.missing_skills[:3])

    def test_strong_match_positive_prefix(self, scorer, backend_job):
        perfect = ResumeProfile(
            skills=backend_job.required_skills + backend_job.nice_to_have,
            experience_years=7,
            job_titles=["Senior Backend Engineer"],
            education_level="master",
            education_field="Computer Science",
            raw_text=(
                "Designed and built large-scale payment infrastructure. "
                "Deployed on AWS with Kubernetes. Reduced costs by 30%. "
                "Architected distributed systems. Mentored team of 5 engineers."
            ),
        )
        result = scorer.score(perfect, backend_job)
        assert any(
            "strong" in s.lower() or "good" in s.lower() or "tailor" in s.lower()
            for s in result.suggestions
        )

    def test_education_gap_in_suggestions(self, scorer, backend_job):
        resume = ResumeProfile(
            skills=backend_job.required_skills,
            education_level="none",
        )
        result = scorer.score(resume, backend_job)
        edu_text = " ".join(result.suggestions).lower()
        assert "degree" in edu_text or "education" in edu_text or "diploma" in edu_text


class TestWeightsSum:
    def test_weights_sum_to_one(self):
        total = sum(WEIGHTS.values())
        assert abs(total - 1.0) < 1e-9
