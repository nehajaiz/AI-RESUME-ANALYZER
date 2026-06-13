"""
app/core/pipeline.py — Singleton pipeline
==========================================
Initialises parser, NLP engine, matcher, and scorer once at startup and
exposes them as a shared Pipeline instance injected via FastAPI dependency.

All heavy objects (spaCy blank model, TF-IDF vectoriser, FAISS-like index)
are created once and reused across requests.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

# Make sibling modules importable when running from project root
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from matcher import JobMatcher
from nlp_engine import NLPEngine
from scorer import ATSScorer

logger = logging.getLogger(__name__)

# ── Singleton holder ───────────────────────────────────────────────────────────

_pipeline: "Pipeline | None" = None


class Pipeline:
    """
    Holds one instance of each processing module.
    Accessed via get_pipeline() dependency.
    """

    def __init__(self, jobs_path: str) -> None:
        logger.info("Initialising NLP engine …")
        self.nlp = NLPEngine()

        logger.info("Initialising job matcher (dataset: %s) …", jobs_path)
        self.matcher = JobMatcher(jobs_path, use_embeddings=False)

        logger.info("Initialising ATS scorer …")
        self.scorer = ATSScorer()

        logger.info("Pipeline ready — %d jobs indexed.", self.matcher.job_count)


def init_pipeline(jobs_path: str) -> None:
    """Call once during app lifespan startup."""
    global _pipeline
    _pipeline = Pipeline(jobs_path)


def get_pipeline() -> Pipeline:
    """FastAPI dependency — raises RuntimeError if not yet initialised."""
    if _pipeline is None:
        raise RuntimeError("Pipeline not initialised. Call init_pipeline() at startup.")
    return _pipeline
