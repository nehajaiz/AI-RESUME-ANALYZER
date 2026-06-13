"""
Singleton pipeline used by the FastAPI app and tests.

The tests import `init_pipeline` and `_pipeline` from `app.core.pipeline`.
"""

from __future__ import annotations

import logging
from pathlib import Path

from matcher import JobMatcher
from nlp_engine import NLPEngine
from scorer import ATSScorer

logger = logging.getLogger(__name__)

_pipeline: "Pipeline | None" = None


class Pipeline:
    """Holds one instance of each processing module."""

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
    resolved = jobs_path
    try:
        p = Path(jobs_path)
        if not p.exists():
            # Some tests compute ROOT one level above the project directory.
            # Fall back to the dataset shipped with this workspace.
            candidate = Path(__file__).resolve().parents[2] / p.name
            if candidate.exists():
                resolved = str(candidate)
    except Exception:
        # If jobs_path isn't a real path, just pass it through.
        resolved = jobs_path

    _pipeline = Pipeline(resolved)


def get_pipeline() -> Pipeline:
    """FastAPI dependency — raises RuntimeError if not yet initialised."""
    if _pipeline is None:
        raise RuntimeError("Pipeline not initialised. Call init_pipeline() at startup.")
    return _pipeline

