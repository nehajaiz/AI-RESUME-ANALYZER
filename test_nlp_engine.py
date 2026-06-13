"""
tests/test_nlp_engine.py — Unit tests for nlp_engine.py
========================================================
Tests cover skills, education, experience extraction and edge cases.
Run with: pytest tests/test_nlp_engine.py -v
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from nlp_engine import NLPEngine, NLPResult, Skill, Education, Experience

# ── Shared fixture ─────────────────────────────────────────────────────────────

SAMPLE_RESUME = """
Alice Zhang
Senior Software Engineer

EXPERIENCE
Senior Software Engineer at Stripe  2021 – Present
  - Built payment APIs using Python and FastAPI
  - Managed PostgreSQL databases and Redis caching layers
  - Deployed services on AWS using Docker and Kubernetes

Backend Engineer at Acme Corp  2019 – 2021
  - Developed REST APIs with Django and Flask
  - Used PostgreSQL and MongoDB for data storage
  - Set up CI/CD pipelines with GitHub Actions and Jenkins

EDUCATION
Bachelor's of Computer Science at Stanford University  2019
Master's of Data Science at MIT  2021

SKILLS
Languages: Python, TypeScript, Go, Rust
Frameworks: FastAPI, React, Next.js, Django
Data: Pandas, NumPy, PyTorch, scikit-learn
Tools: Git, Docker, Terraform, Prometheus
"""

@pytest.fixture(scope="module")
def engine() -> NLPEngine:
    return NLPEngine()

@pytest.fixture(scope="module")
def result(engine) -> NLPResult:
    return engine.analyze(SAMPLE_RESUME)


# ── Skills ─────────────────────────────────────────────────────────────────────

class TestSkillExtraction:
    def test_returns_skill_list(self, result):
        assert isinstance(result.skills, list)
        assert len(result.skills) > 0

    def test_skills_are_skill_instances(self, result):
        for s in result.skills:
            assert isinstance(s, Skill)

    def test_extracts_programming_languages(self, result):
        names = result.skill_names
        assert "Python" in names
        assert "TypeScript" in names
        assert "Go" in names

    def test_extracts_frameworks(self, result):
        names = result.skill_names
        assert "FastAPI" in names
        assert "Django" in names
        assert "React" in names

    def test_extracts_databases(self, result):
        names = result.skill_names
        assert "PostgreSQL" in names
        assert "MongoDB" in names
        assert "Redis" in names

    def test_extracts_cloud_devops(self, result):
        names = result.skill_names
        assert "Docker" in names
        assert "Kubernetes" in names
        assert "AWS" in names

    def test_extracts_data_ml_tools(self, result):
        names = result.skill_names
        assert "PyTorch" in names
        assert "Pandas" in names
        assert "scikit-learn" in names

    def test_skills_have_categories(self, result):
        categories = {s.category for s in result.skills}
        assert "languages" in categories
        assert "web_frameworks" in categories
        assert "databases" in categories

    def test_skills_by_category_structure(self, result):
        by_cat = result.skills_by_category
        assert isinstance(by_cat, dict)
        assert "languages" in by_cat
        assert "Python" in by_cat["languages"]

    def test_occurrence_counting(self, engine):
        # PostgreSQL appears multiple times in the sample resume
        res = engine.analyze(SAMPLE_RESUME)
        pg = next((s for s in res.skills if s.name == "PostgreSQL"), None)
        assert pg is not None
        assert pg.occurrences >= 2

    def test_alias_resolution(self, engine):
        text = "Built ML pipelines with sklearn and postgres on k8s."
        res = engine.analyze(text)
        names = res.skill_names
        assert "scikit-learn" in names
        assert "PostgreSQL" in names
        assert "Kubernetes" in names

    def test_case_insensitive_matching(self, engine):
        text = "Experience with PYTHON, FASTAPI, and DOCKER."
        res = engine.analyze(text)
        names = res.skill_names
        assert "Python" in names
        assert "FastAPI" in names
        assert "Docker" in names

    def test_no_duplicate_skills(self, result):
        names_lower = [s.name.lower() for s in result.skills]
        assert len(names_lower) == len(set(names_lower))


# ── Education ──────────────────────────────────────────────────────────────────

class TestEducationExtraction:
    def test_returns_education_list(self, result):
        assert isinstance(result.education, list)

    def test_extracts_bachelor_degree(self, result):
        degrees = [e.degree.lower() for e in result.education]
        assert any("bachelor" in d for d in degrees)

    def test_extracts_master_degree(self, result):
        degrees = [e.degree.lower() for e in result.education]
        assert any("master" in d for d in degrees)

    def test_extracts_field_of_study(self, result):
        fields = [e.field.lower() for e in result.education]
        assert any("computer science" in f for f in fields)

    def test_extracts_institution(self, result):
        institutions = [e.institution for e in result.education]
        assert any("Stanford" in i for i in institutions)

    def test_extracts_graduation_year(self, result):
        years = [e.year for e in result.education if e.year]
        assert 2019 in years

    def test_education_items_are_dataclasses(self, result):
        for e in result.education:
            assert isinstance(e, Education)
            assert hasattr(e, "degree")
            assert hasattr(e, "field")
            assert hasattr(e, "institution")

    def test_phd_extraction(self, engine):
        text = "Ph.D. in Machine Learning from Carnegie Mellon University 2020"
        res = engine.analyze(text)
        assert len(res.education) >= 1
        assert "ph" in res.education[0].degree.lower()

    def test_no_duplicate_education(self, result):
        keys = [f"{e.degree}|{e.field}|{e.institution}".lower() for e in result.education]
        assert len(keys) == len(set(keys))


# ── Experience ─────────────────────────────────────────────────────────────────

class TestExperienceExtraction:
    def test_returns_experience_list(self, result):
        assert isinstance(result.experience, list)

    def test_extracts_job_titles(self, result):
        titles = [e.title for e in result.experience]
        assert any("Engineer" in t for t in titles)

    def test_extracts_company_names(self, result):
        companies = [e.company for e in result.experience]
        assert any("Stripe" in c for c in companies)

    def test_experience_has_years(self, result):
        for e in result.experience:
            assert isinstance(e.years, float)
            assert e.years >= 0

    def test_present_role_year_computation(self, result):
        stripe = next((e for e in result.experience if "Stripe" in e.company), None)
        if stripe:
            assert stripe.end_year is None or stripe.years >= 3  # 2021–2025

    def test_experience_items_are_dataclasses(self, result):
        for e in result.experience:
            assert isinstance(e, Experience)

    def test_total_experience_years(self, result):
        assert result.total_experience_years >= 0.0


# ── Edge cases ─────────────────────────────────────────────────────────────────

class TestEdgeCases:
    def test_empty_string(self, engine):
        res = engine.analyze("")
        assert res.skills == []
        assert res.education == []
        assert res.experience == []

    def test_whitespace_only(self, engine):
        res = engine.analyze("   \n\n   ")
        assert res.skills == []

    def test_no_skills_in_text(self, engine):
        res = engine.analyze("I am a motivated individual who loves to learn.")
        assert isinstance(res.skills, list)

    def test_to_dict_structure(self, result):
        d = result.to_dict()
        assert "skills" in d
        assert "education" in d
        assert "experience" in d
        assert "total_experience_years" in d
        assert "skill_count" in d
        assert isinstance(d["skills"], list)

    def test_skill_count_in_dict(self, result):
        d = result.to_dict()
        assert d["skill_count"] == len(result.skills)

    def test_is_not_empty(self, result):
        assert result.raw_text_length > 0


# ── Dynamic skill addition ─────────────────────────────────────────────────────

class TestDynamicSkills:
    def test_add_custom_skill_category(self, engine):
        engine.add_skills("blockchain", ["Solidity", "Ethereum", "Web3.py"])
        res = engine.analyze("Smart contract developer using Solidity and Ethereum.")
        names = res.skill_names
        assert "Solidity" in names
        assert "Ethereum" in names

    def test_added_skills_have_correct_category(self, engine):
        res = engine.analyze("Experience with Solidity development.")
        sol = next((s for s in res.skills if s.name == "Solidity"), None)
        if sol:
            assert sol.category == "blockchain"


# ── Batch analysis ─────────────────────────────────────────────────────────────

class TestBatchAnalysis:
    def test_batch_returns_list(self, engine):
        texts = [SAMPLE_RESUME, "Python developer with React and PostgreSQL experience."]
        results = engine.analyze_batch(texts)
        assert len(results) == 2

    def test_batch_preserves_order(self, engine):
        texts = [
            "Python and Docker developer.",
            "Java and Kubernetes specialist.",
        ]
        results = engine.analyze_batch(texts)
        assert "Python" in results[0].skill_names
        assert "Java" in results[1].skill_names
