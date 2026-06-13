"""
tests/test_api.py — Integration tests for the Resume Analyzer API
==================================================================
Uses FastAPI TestClient (synchronous) with a real pipeline instance
so every layer (parser → NLP → matcher → scorer) is exercised.

Fixtures create minimal in-memory PDF and DOCX files so no external
files are needed.

Run with:
    pytest tests/test_api.py -v
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

import fitz          # PyMuPDF  — for building test PDFs
import pytest
from docx import Document
from fastapi.testclient import TestClient

# ── Path setup ─────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


# ── App bootstrap (must happen after path setup) ───────────────────────────────
from app.core.pipeline import init_pipeline, _pipeline
from main import app

# Initialise once for the whole test session
init_pipeline(str(ROOT / "mock_jobs.json"))

client = TestClient(app, raise_server_exceptions=True)


# ── File fixtures ──────────────────────────────────────────────────────────────

RESUME_TEXT = (
    "Alice Zhang — Senior Software Engineer\n\n"
    "EXPERIENCE\n"
    "Senior Software Engineer at Stripe  2021 – Present\n"
    "  Built payment APIs using Python and FastAPI.\n"
    "  Managed PostgreSQL and Redis. Deployed on AWS with Docker.\n\n"
    "Backend Engineer at Acme  2019 – 2021\n"
    "  REST APIs with Django. PostgreSQL and MongoDB.\n\n"
    "EDUCATION\n"
    "Bachelor's of Computer Science at Stanford University 2019\n\n"
    "SKILLS\n"
    "Python, FastAPI, PostgreSQL, Redis, Docker, AWS, Git, REST, "
    "TypeScript, React, Kubernetes, Terraform"
)


@pytest.fixture(scope="module")
def pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), RESUME_TEXT, fontsize=11)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


@pytest.fixture(scope="module")
def docx_bytes() -> bytes:
    doc = Document()
    for line in RESUME_TEXT.split("\n"):
        doc.add_paragraph(line)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ── Helper ─────────────────────────────────────────────────────────────────────

def upload_pdf(pdf_bytes: bytes) -> str:
    """Upload a PDF and return the resume_id."""
    resp = client.post(
        "/api/v1/upload-resume",
        files={"file": ("test_resume.pdf", pdf_bytes, "application/pdf")},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["resume_id"]


# ══════════════════════════════════════════════════════════════════════════════
# Health endpoint
# ══════════════════════════════════════════════════════════════════════════════

class TestHealth:
    def test_health_200(self):
        r = client.get("/api/v1/health")
        assert r.status_code == 200

    def test_health_status_ok(self):
        r = client.get("/api/v1/health")
        assert r.json()["status"] == "ok"

    def test_health_has_version(self):
        r = client.get("/api/v1/health")
        assert "version" in r.json()

    def test_health_jobs_indexed(self):
        r = client.get("/api/v1/health")
        assert r.json()["jobs_indexed"] >= 1

    def test_health_uptime(self):
        r = client.get("/api/v1/health")
        assert r.json()["uptime_seconds"] >= 0


# ══════════════════════════════════════════════════════════════════════════════
# POST /upload-resume
# ══════════════════════════════════════════════════════════════════════════════

class TestUploadResume:
    def test_upload_pdf_201(self, pdf_bytes):
        r = client.post(
            "/api/v1/upload-resume",
            files={"file": ("resume.pdf", pdf_bytes, "application/pdf")},
        )
        assert r.status_code == 201

    def test_upload_docx_201(self, docx_bytes):
        r = client.post(
            "/api/v1/upload-resume",
            files={"file": ("resume.docx", docx_bytes,
                            "application/vnd.openxmlformats-officedocument"
                            ".wordprocessingml.document")},
        )
        assert r.status_code == 201

    def test_upload_returns_resume_id(self, pdf_bytes):
        r = client.post(
            "/api/v1/upload-resume",
            files={"file": ("resume.pdf", pdf_bytes, "application/pdf")},
        )
        body = r.json()
        assert "resume_id" in body
        assert len(body["resume_id"]) > 0

    def test_upload_returns_word_count(self, pdf_bytes):
        r = client.post(
            "/api/v1/upload-resume",
            files={"file": ("resume.pdf", pdf_bytes, "application/pdf")},
        )
        assert r.json()["word_count"] > 0

    def test_upload_returns_correct_file_type(self, pdf_bytes):
        r = client.post(
            "/api/v1/upload-resume",
            files={"file": ("resume.pdf", pdf_bytes, "application/pdf")},
        )
        assert r.json()["file_type"] == "pdf"

    def test_upload_docx_file_type(self, docx_bytes):
        r = client.post(
            "/api/v1/upload-resume",
            files={"file": ("resume.docx", docx_bytes, "application/octet-stream")},
        )
        assert r.json()["file_type"] == "docx"

    def test_upload_unsupported_extension_415(self):
        r = client.post(
            "/api/v1/upload-resume",
            files={"file": ("resume.txt", b"plain text", "text/plain")},
        )
        assert r.status_code == 415

    def test_upload_unsupported_extension_message(self):
        r = client.post(
            "/api/v1/upload-resume",
            files={"file": ("resume.jpg", b"fake image", "image/jpeg")},
        )
        assert "Unsupported" in r.json()["detail"]

    def test_upload_each_request_unique_id(self, pdf_bytes):
        r1 = client.post("/api/v1/upload-resume",
                         files={"file": ("r.pdf", pdf_bytes, "application/pdf")})
        r2 = client.post("/api/v1/upload-resume",
                         files={"file": ("r.pdf", pdf_bytes, "application/pdf")})
        assert r1.json()["resume_id"] != r2.json()["resume_id"]

    def test_upload_empty_file_handled(self):
        r = client.post(
            "/api/v1/upload-resume",
            files={"file": ("empty.pdf", b"", "application/pdf")},
        )
        # Should not crash the server — either 201 with empty or 422
        assert r.status_code in (201, 422)


# ══════════════════════════════════════════════════════════════════════════════
# GET /analyze
# ══════════════════════════════════════════════════════════════════════════════

class TestAnalyze:
    @pytest.fixture(scope="class")
    def resume_id(self, pdf_bytes):
        return upload_pdf(pdf_bytes)

    @pytest.fixture(scope="class")
    def response(self, resume_id):
        return client.get(f"/api/v1/analyze?resume_id={resume_id}")

    @pytest.fixture(scope="class")
    def body(self, response):
        return response.json()

    # Status & envelope
    def test_status_200(self, response):
        assert response.status_code == 200

    def test_has_resume_id(self, body, resume_id):
        assert body["resume_id"] == resume_id

    def test_has_analysis_key(self, body):
        assert "analysis" in body

    def test_has_ats_score_key(self, body):
        assert "ats_score" in body

    # Skills
    def test_skills_is_list(self, body):
        assert isinstance(body["analysis"]["skills"], list)

    def test_skills_non_empty(self, body):
        assert body["analysis"]["skill_count"] > 0

    def test_skills_have_name_and_category(self, body):
        for s in body["analysis"]["skills"]:
            assert "name" in s
            assert "category" in s

    def test_python_extracted(self, body):
        names = [s["name"] for s in body["analysis"]["skills"]]
        assert "Python" in names

    def test_skills_by_category_is_dict(self, body):
        assert isinstance(body["analysis"]["skills_by_category"], dict)

    # Education
    def test_education_is_list(self, body):
        assert isinstance(body["analysis"]["education"], list)

    # Experience
    def test_experience_is_list(self, body):
        assert isinstance(body["analysis"]["experience"], list)

    def test_total_experience_years_non_negative(self, body):
        assert body["analysis"]["total_experience_years"] >= 0

    # ATS score
    def test_ats_score_in_range(self, body):
        assert 0 <= body["ats_score"]["ats_score"] <= 100

    def test_ats_grade_valid(self, body):
        assert body["ats_score"]["grade"] in {"A", "B", "C", "D", "F"}

    def test_ats_has_components(self, body):
        assert len(body["ats_score"]["components"]) == 4

    def test_ats_has_suggestions(self, body):
        assert len(body["ats_score"]["suggestions"]) >= 1

    def test_ats_has_matched_skills(self, body):
        assert isinstance(body["ats_score"]["matched_skills"], list)

    def test_ats_has_missing_skills(self, body):
        assert isinstance(body["ats_score"]["missing_skills"], list)

    # 404 for unknown ID
    def test_unknown_resume_id_404(self):
        r = client.get("/api/v1/analyze?resume_id=does-not-exist")
        assert r.status_code == 404

    def test_missing_resume_id_422(self):
        r = client.get("/api/v1/analyze")
        assert r.status_code == 422


# ══════════════════════════════════════════════════════════════════════════════
# GET /match-jobs
# ══════════════════════════════════════════════════════════════════════════════

class TestMatchJobs:
    @pytest.fixture(scope="class")
    def resume_id(self, pdf_bytes):
        return upload_pdf(pdf_bytes)

    @pytest.fixture(scope="class")
    def response(self, resume_id):
        return client.get(f"/api/v1/match-jobs?resume_id={resume_id}")

    @pytest.fixture(scope="class")
    def body(self, response):
        return response.json()

    # Status & envelope
    def test_status_200(self, response):
        assert response.status_code == 200

    def test_has_resume_id(self, body, resume_id):
        assert body["resume_id"] == resume_id

    def test_has_matches_key(self, body):
        assert "matches" in body

    def test_total_jobs_searched(self, body):
        assert body["total_jobs_searched"] >= 1

    # Match list
    def test_default_top_5(self, body):
        assert len(body["matches"]) <= 5

    def test_matches_are_sorted(self, body):
        scores = [m["match_pct"] for m in body["matches"]]
        assert scores == sorted(scores, reverse=True)

    def test_match_pct_in_range(self, body):
        for m in body["matches"]:
            assert 0 <= m["match_pct"] <= 100

    def test_match_has_required_fields(self, body):
        for m in body["matches"]:
            for field in ("rank", "title", "company", "match_pct",
                          "matched_skills", "missing_skills", "reasons"):
                assert field in m, f"Missing field: {field}"

    def test_ranks_sequential(self, body):
        ranks = [m["rank"] for m in body["matches"]]
        assert ranks == list(range(1, len(ranks) + 1))

    def test_reasons_non_empty(self, body):
        for m in body["matches"]:
            assert len(m["reasons"]) >= 1

    # Query params
    def test_top_n_param(self, resume_id):
        r = client.get(f"/api/v1/match-jobs?resume_id={resume_id}&top_n=3")
        assert r.status_code == 200
        assert len(r.json()["matches"]) <= 3

    def test_top_n_max_20(self, resume_id):
        r = client.get(f"/api/v1/match-jobs?resume_id={resume_id}&top_n=20")
        assert r.status_code == 200

    def test_top_n_out_of_range_422(self, resume_id):
        r = client.get(f"/api/v1/match-jobs?resume_id={resume_id}&top_n=0")
        assert r.status_code == 422

    def test_min_score_filter(self, resume_id):
        r = client.get(f"/api/v1/match-jobs?resume_id={resume_id}&min_score=90")
        assert r.status_code == 200
        for m in r.json()["matches"]:
            assert m["match_pct"] >= 90

    def test_unknown_resume_id_404(self):
        r = client.get("/api/v1/match-jobs?resume_id=ghost-id")
        assert r.status_code == 404

    def test_missing_resume_id_422(self):
        r = client.get("/api/v1/match-jobs")
        assert r.status_code == 422

    # Backend engineer profile surfaces backend jobs
    def test_backend_resume_top_match_relevance(self, body):
        top = body["matches"][0]
        backend_kw = {"engineer", "developer", "backend", "software"}
        assert any(kw in top["title"].lower() for kw in backend_kw)


# ══════════════════════════════════════════════════════════════════════════════
# End-to-end workflow
# ══════════════════════════════════════════════════════════════════════════════

class TestFullWorkflow:
    def test_e2e_pdf_pipeline(self, pdf_bytes):
        # 1. Upload
        up = client.post(
            "/api/v1/upload-resume",
            files={"file": ("cv.pdf", pdf_bytes, "application/pdf")},
        )
        assert up.status_code == 201
        rid = up.json()["resume_id"]

        # 2. Analyze
        an = client.get(f"/api/v1/analyze?resume_id={rid}")
        assert an.status_code == 200
        assert an.json()["analysis"]["skill_count"] > 0
        assert 0 <= an.json()["ats_score"]["ats_score"] <= 100

        # 3. Match jobs
        mj = client.get(f"/api/v1/match-jobs?resume_id={rid}&top_n=5")
        assert mj.status_code == 200
        assert len(mj.json()["matches"]) > 0

    def test_e2e_docx_pipeline(self, docx_bytes):
        up = client.post(
            "/api/v1/upload-resume",
            files={"file": ("cv.docx", docx_bytes, "application/octet-stream")},
        )
        assert up.status_code == 201
        rid = up.json()["resume_id"]

        an = client.get(f"/api/v1/analyze?resume_id={rid}")
        assert an.status_code == 200

        mj = client.get(f"/api/v1/match-jobs?resume_id={rid}")
        assert mj.status_code == 200

    def test_resume_id_reusable_across_endpoints(self, pdf_bytes):
        up = client.post(
            "/api/v1/upload-resume",
            files={"file": ("cv.pdf", pdf_bytes, "application/pdf")},
        )
        rid = up.json()["resume_id"]

        for _ in range(3):
            r = client.get(f"/api/v1/analyze?resume_id={rid}")
            assert r.status_code == 200

    def test_nlp_result_cached_on_second_call(self, pdf_bytes):
        """Second /analyze call should hit cache — same score as first."""
        up = client.post(
            "/api/v1/upload-resume",
            files={"file": ("cv.pdf", pdf_bytes, "application/pdf")},
        )
        rid = up.json()["resume_id"]

        r1 = client.get(f"/api/v1/analyze?resume_id={rid}")
        r2 = client.get(f"/api/v1/analyze?resume_id={rid}")
        assert r1.json()["ats_score"]["ats_score"] == r2.json()["ats_score"]["ats_score"]
