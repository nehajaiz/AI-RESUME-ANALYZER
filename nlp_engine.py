"""
nlp_engine.py — Resume NLP Extraction Engine
=============================================
Extracts structured information from raw resume text:

  • Skills      — matched against a curated, categorised taxonomy
  • Education   — degree, institution, field of study, year
  • Experience  — job title, company, date range, years of experience

Architecture
------------
- spaCy blank("en") + PhraseMatcher for O(n) skill extraction
  (works without a pre-trained model download)
- Regex patterns for education and experience sections
- Optional: swap PhraseMatcher for a transformer model by supplying
  a custom `spacy.Language` instance to `NLPEngine(nlp=...)`

Usage
-----
    from nlp_engine import NLPEngine

    engine = NLPEngine()
    result = engine.analyze(resume_text)

    print(result.skills)          # [Skill(name='Python', category='languages'), ...]
    print(result.education)       # [Education(degree='B.S.', field='Computer Science', ...)]
    print(result.experience)      # [Experience(title='Engineer', company='Acme', years=3.0)]
    print(result.total_experience_years)
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Optional

import spacy
from spacy.matcher import PhraseMatcher

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Skill Taxonomy
# ─────────────────────────────────────────────────────────────────────────────
# Extend these lists freely.  Keys become the `category` on each Skill.

SKILL_TAXONOMY: dict[str, list[str]] = {
    "languages": [
        "Python", "JavaScript", "TypeScript", "Java", "C", "C++", "C#",
        "Go", "Rust", "Ruby", "PHP", "Swift", "Kotlin", "Scala", "R",
        "MATLAB", "Perl", "Bash", "Shell", "PowerShell", "Dart", "Elixir",
        "Haskell", "Lua", "Groovy", "Julia",
    ],
    "web_frameworks": [
        "FastAPI", "Django", "Flask", "Express", "Next.js", "Nuxt.js",
        "React", "Vue", "Angular", "Svelte", "Spring Boot", "Rails",
        "Laravel", "ASP.NET", "NestJS", "Fastify", "Gin", "Fiber",
        "Starlette", "Tornado", "aiohttp",
    ],
    "databases": [
        "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Cassandra",
        "DynamoDB", "Elasticsearch", "Neo4j", "CouchDB", "MariaDB",
        "Oracle", "SQL Server", "Firestore", "Supabase", "PlanetScale",
        "InfluxDB", "TimescaleDB", "Pinecone", "Weaviate", "Qdrant",
    ],
    "cloud_devops": [
        "AWS", "Azure", "GCP", "Google Cloud", "Docker", "Kubernetes",
        "Terraform", "Ansible", "Jenkins", "GitHub Actions", "CircleCI",
        "GitLab CI", "ArgoCD", "Helm", "Prometheus", "Grafana", "Datadog",
        "New Relic", "Nginx", "Apache", "Vault", "Consul",
    ],
    "data_ml": [
        "TensorFlow", "PyTorch", "Keras", "scikit-learn", "XGBoost",
        "LightGBM", "Pandas", "NumPy", "SciPy", "Matplotlib", "Seaborn",
        "Plotly", "Spark", "Hadoop", "Airflow", "dbt", "MLflow",
        "Hugging Face", "LangChain", "OpenCV", "NLTK", "spaCy",
        "Transformers", "FAISS", "Ray",
    ],
    "tools_practices": [
        "Git", "GitHub", "GitLab", "Bitbucket", "Jira", "Confluence",
        "Agile", "Scrum", "Kanban", "TDD", "BDD", "CI/CD", "REST",
        "GraphQL", "gRPC", "WebSocket", "OAuth", "JWT", "OpenAPI",
        "Swagger", "Postman", "Linux", "Unix", "macOS",
    ],
    "soft_skills": [
        "Leadership", "Communication", "Problem Solving", "Teamwork",
        "Mentoring", "Project Management", "Critical Thinking",
        "Time Management", "Collaboration", "Adaptability",
    ],
}

# Canonical aliases: what appears in text → canonical skill name
SKILL_ALIASES: dict[str, str] = {
    "js": "JavaScript",
    "ts": "TypeScript",
    "py": "Python",
    "node": "Node.js",
    "node.js": "Node.js",
    "nodejs": "Node.js",
    "k8s": "Kubernetes",
    "gke": "Kubernetes",
    "ml": "Machine Learning",
    "ai": "Artificial Intelligence",
    "postgres": "PostgreSQL",
    "mongo": "MongoDB",
    "sk-learn": "scikit-learn",
    "sklearn": "scikit-learn",
    "hf": "Hugging Face",
    "gh actions": "GitHub Actions",
    "react.js": "React",
    "reactjs": "React",
    "vue.js": "Vue",
    "vuejs": "Vue",
    "next": "Next.js",
    "nuxt": "Nuxt.js",
}


# ─────────────────────────────────────────────────────────────────────────────
# Output dataclasses
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class Skill:
    name: str
    category: str
    occurrences: int = 1

    def __hash__(self) -> int:
        return hash(self.name.lower())

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Skill) and self.name.lower() == other.name.lower()


@dataclass
class Education:
    degree: str
    field: str
    institution: str
    year: Optional[int]
    raw: str                # original matched text for debugging


@dataclass
class Experience:
    title: str
    company: str
    start_year: Optional[int]
    end_year: Optional[int]   # None = "present"
    years: float              # computed duration
    raw: str


@dataclass
class NLPResult:
    skills: list[Skill]
    education: list[Education]
    experience: list[Experience]
    raw_text_length: int

    @property
    def skill_names(self) -> list[str]:
        return [s.name for s in self.skills]

    @property
    def skills_by_category(self) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {}
        for s in self.skills:
            out.setdefault(s.category, []).append(s.name)
        return out

    @property
    def total_experience_years(self) -> float:
        """
        Heuristic: take the longest single role, or sum if roles don't overlap.
        Returns 0.0 if no experience entries found.
        """
        if not self.experience:
            return 0.0
        return round(max(e.years for e in self.experience), 1)

    def to_dict(self) -> dict:
        return {
            "skills": [
                {"name": s.name, "category": s.category, "occurrences": s.occurrences}
                for s in self.skills
            ],
            "education": [
                {
                    "degree": e.degree,
                    "field": e.field,
                    "institution": e.institution,
                    "year": e.year,
                }
                for e in self.education
            ],
            "experience": [
                {
                    "title": ex.title,
                    "company": ex.company,
                    "start_year": ex.start_year,
                    "end_year": ex.end_year,
                    "years": ex.years,
                }
                for ex in self.experience
            ],
            "total_experience_years": self.total_experience_years,
            "skill_count": len(self.skills),
        }


# ─────────────────────────────────────────────────────────────────────────────
# Regex patterns
# ─────────────────────────────────────────────────────────────────────────────

# ── Degree patterns ────────────────────────────────────────────────────────────
_DEGREE_WORDS = (
    r"(?:Bachelor(?:'?s)?|Master(?:'?s)?|Ph\.?D\.?|Doctor(?:ate)?|"
    r"B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?A\.?|B\.?E\.?|M\.?E\.?|"
    r"B\.?Tech\.?|M\.?Tech\.?|MBA|Associate(?:'?s)?|Diploma)"
)
# Field stops before institution keywords or a bare year so "Computer Science at MIT"
# doesn't consume "at MIT" into the field group.
_FIELD_WORDS = r"(?:of\s+)?([A-Z][A-Za-z ]{2,35}?)(?=\s+(?:at|from|,|\d)|$)"
_INST_WORDS  = r"(?:at|from|@|,)\s*([A-Z][A-Za-z &,.']{3,60})"
_YEAR_PAT    = r"(?:[\(,\s]\s*)?(\b(?:19|20)\d{2}\b)"

DEGREE_RE = re.compile(
    rf"({_DEGREE_WORDS})\s+{_FIELD_WORDS}(?:\s*{_INST_WORDS})?(?:\s*{_YEAR_PAT})?",
    re.IGNORECASE,
)

# ── Experience / date-range patterns ──────────────────────────────────────────
_TITLE_WORDS = (
    r"((?:Senior|Junior|Lead|Principal|Staff|Associate|Chief|Head of|VP of)?\s*"
    r"(?:Software|Data|Machine Learning|ML|AI|Backend|Frontend|Full[- ]Stack|"
    r"DevOps|Cloud|Platform|Site Reliability|Security|QA|Product|Project|"
    r"Engineering)?\s*"
    r"(?:Engineer|Developer|Scientist|Analyst|Manager|Architect|Consultant|"
    r"Designer|Director|Intern|Specialist|Lead|Officer))"
)
_COMPANY_WORDS = r"(?:at\s+)?([A-Z][A-Za-z0-9 &.,'-]{2,50})"
_MONTH = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*"
_DATE  = rf"(?:{_MONTH}\s+)?(\d{{4}})"
_PRES  = r"(?:Present|Current|Now|–\s*$)"

EXPERIENCE_RE = re.compile(
    rf"{_TITLE_WORDS}\s*(?:@|at|,|\||-)\s*{_COMPANY_WORDS}"
    rf"(?:[^\n]{{0,30}}{_DATE}\s*[-–—to]+\s*(?:{_DATE}|({_PRES})))?",
    re.IGNORECASE,
)

# Standalone date-range for experience blocks like "2019 – 2022" or "2020 – Present"
DATE_RANGE_RE = re.compile(
    rf"(\d{{4}})\s*[-–—to]+\s*(?:(\d{{4}})|({_PRES}))",
    re.IGNORECASE,
)

# ─────────────────────────────────────────────────────────────────────────────
# Engine
# ─────────────────────────────────────────────────────────────────────────────


class NLPEngine:
    """
    Stateless NLP extraction engine.  Instantiate once, call `analyze()` many times.

    Parameters
    ----------
    nlp : spacy.Language, optional
        Pass a pre-loaded spaCy model to enable NER on top of PhraseMatcher.
        Defaults to a blank English pipeline (no download required).
    extra_skills : dict[str, list[str]], optional
        Additional {category: [skill, ...]} entries merged into the taxonomy.
    """

    def __init__(
        self,
        nlp: Optional[spacy.Language] = None,
        extra_skills: Optional[dict[str, list[str]]] = None,
    ) -> None:
        self._nlp = nlp or spacy.blank("en")
        self._taxonomy = {**SKILL_TAXONOMY, **(extra_skills or {})}
        self._matcher = self._build_matcher()
        self._skill_map: dict[str, tuple[str, str]] = {}  # lower → (canonical, category)
        self._build_skill_map()
        logger.info(
            "NLPEngine ready — %d skills across %d categories",
            sum(len(v) for v in self._taxonomy.values()),
            len(self._taxonomy),
        )

    # ── Build PhraseMatcher ────────────────────────────────────────────────────

    def _build_matcher(self) -> PhraseMatcher:
        matcher = PhraseMatcher(self._nlp.vocab, attr="LOWER")
        for category, skills in self._taxonomy.items():
            patterns = [self._nlp.make_doc(s) for s in skills]
            matcher.add(category, patterns)
        # Add aliases as their own patterns
        for alias in SKILL_ALIASES:
            patterns = [self._nlp.make_doc(alias)]
            matcher.add("__alias__", patterns)
        return matcher

    def _build_skill_map(self) -> None:
        for category, skills in self._taxonomy.items():
            for skill in skills:
                self._skill_map[skill.lower()] = (skill, category)
        for alias, canonical in SKILL_ALIASES.items():
            # Find the category of the canonical skill
            cat = next(
                (c for c, skills in self._taxonomy.items() if canonical in skills),
                "languages",
            )
            self._skill_map[alias.lower()] = (canonical, cat)

    # ── Skill extraction ───────────────────────────────────────────────────────

    def _extract_skills(self, text: str) -> list[Skill]:
        doc = self._nlp(text)
        matches = self._matcher(doc)

        counts: dict[str, int] = {}
        skill_lookup: dict[str, tuple[str, str]] = {}

        for _, start, end in matches:
            span_text = doc[start:end].text
            canonical, category = self._skill_map.get(
                span_text.lower(), (span_text, "other")
            )
            key = canonical.lower()
            counts[key] = counts.get(key, 0) + 1
            skill_lookup[key] = (canonical, category)

        return sorted(
            [
                Skill(name=canonical, category=category, occurrences=counts[key])
                for key, (canonical, category) in skill_lookup.items()
            ],
            key=lambda s: (-s.occurrences, s.name),
        )

    # ── Education extraction ───────────────────────────────────────────────────

    def _extract_education(self, text: str) -> list[Education]:
        results: list[Education] = []
        seen: set[str] = set()

        for m in DEGREE_RE.finditer(text):
            degree  = m.group(1).strip()
            field   = (m.group(2) or "").strip().rstrip(",")
            inst    = (m.group(3) or "").strip().rstrip(",")
            year_s  = m.group(4)
            year    = int(year_s) if year_s else None

            key = f"{degree}|{field}|{inst}".lower()
            if key in seen:
                continue
            seen.add(key)

            results.append(Education(
                degree=degree,
                field=field,
                institution=inst,
                year=year,
                raw=m.group(0).strip(),
            ))

        return results

    # ── Experience extraction ──────────────────────────────────────────────────

    @staticmethod
    def _years_from_range(
        start: Optional[int],
        end: Optional[int],
        is_present: bool,
        reference_year: int = 2025,
    ) -> float:
        if start is None:
            return 0.0
        end_y = reference_year if (is_present or end is None) else end
        return max(0.0, float(end_y - start))

    def _extract_experience(self, text: str) -> list[Experience]:
        results: list[Experience] = []
        seen: set[str] = set()

        for m in EXPERIENCE_RE.finditer(text):
            title   = (m.group(1) or "").strip()
            company = (m.group(2) or "").strip().rstrip(",")
            start_s = m.group(3)
            end_s   = m.group(4)
            pres    = m.group(5)

            if not title:
                continue

            start_y = int(start_s) if start_s else None
            end_y   = int(end_s)   if end_s   else None
            is_pres = bool(pres)
            yrs     = self._years_from_range(start_y, end_y, is_pres)

            key = f"{title}|{company}".lower()
            if key in seen:
                continue
            seen.add(key)

            results.append(Experience(
                title=title,
                company=company,
                start_year=start_y,
                end_year=end_y,
                years=yrs,
                raw=m.group(0).strip(),
            ))

        return results

    # ── Public API ─────────────────────────────────────────────────────────────

    def analyze(self, text: str) -> NLPResult:
        """
        Run the full extraction pipeline on resume text.

        Parameters
        ----------
        text : str — cleaned resume text (output of parser.clean_text works well)

        Returns
        -------
        NLPResult dataclass with skills, education, experience
        """
        if not text or not text.strip():
            logger.warning("analyze() called with empty text")
            return NLPResult(skills=[], education=[], experience=[], raw_text_length=0)

        skills    = self._extract_skills(text)
        education = self._extract_education(text)
        experience = self._extract_experience(text)

        logger.info(
            "NLP result: skills=%d education=%d experience=%d",
            len(skills), len(education), len(experience),
        )
        return NLPResult(
            skills=skills,
            education=education,
            experience=experience,
            raw_text_length=len(text),
        )

    def analyze_batch(self, texts: list[str]) -> list[NLPResult]:
        """Analyze multiple resumes. Preserves order."""
        return [self.analyze(t) for t in texts]

    def add_skills(self, category: str, skills: list[str]) -> None:
        """
        Dynamically extend the taxonomy at runtime (e.g., from a database).
        Re-builds the PhraseMatcher — call once before processing, not per-resume.
        """
        self._taxonomy.setdefault(category, []).extend(skills)
        for skill in skills:
            self._skill_map[skill.lower()] = (skill, category)
        patterns = [self._nlp.make_doc(s) for s in skills]
        self._matcher.add(category, patterns)
        logger.info("Added %d skills to category '%s'", len(skills), category)
