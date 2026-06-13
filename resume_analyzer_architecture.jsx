import { useState } from "react";

const tabs = ["Folder Structure", "System Flow", "Key Modules", "Tech Stack"];

const folderData = {
  backend: {
    label: "backend/",
    color: "#f97316",
    children: [
      {
        label: "app/",
        children: [
          { label: "main.py", desc: "FastAPI app init, CORS, router mounting, lifespan hooks" },
          { label: "config.py", desc: "Env vars, DB URLs, model paths, feature flags via Pydantic Settings" },
          {
            label: "api/",
            children: [
              { label: "routes/resume.py", desc: "POST /upload, GET /resumes/:id — upload & fetch resume records" },
              { label: "routes/jobs.py", desc: "CRUD for job postings, bulk import endpoint" },
              { label: "routes/match.py", desc: "POST /match — triggers NLP pipeline, returns ranked jobs" },
              { label: "routes/auth.py", desc: "JWT login, register, refresh token endpoints" },
              { label: "dependencies.py", desc: "DB session injection, current_user guard, rate limiter" },
            ],
          },
          {
            label: "core/",
            children: [
              { label: "parser.py", desc: "PDF/DOCX extraction via PyMuPDF + python-docx; section segmentation" },
              { label: "nlp_engine.py", desc: "spaCy NER, skill extraction, sentence embeddings (SentenceTransformer)" },
              { label: "matcher.py", desc: "Cosine similarity + weighted attribute matching logic" },
              { label: "scorer.py", desc: "Weighted scoring: skills 40%, experience 30%, education 20%, keywords 10%" },
              { label: "embeddings.py", desc: "Vector generation & FAISS index CRUD for fast ANN search" },
            ],
          },
          {
            label: "models/",
            children: [
              { label: "resume.py", desc: "SQLAlchemy/Motor ORM: Resume, Section, ParsedEntity tables" },
              { label: "job.py", desc: "Job, RequiredSkill, SalaryRange — normalized schema" },
              { label: "match.py", desc: "MatchResult, ScoreBreakdown — stores match history" },
              { label: "user.py", desc: "User, Role, APIKey — auth & multitenancy" },
            ],
          },
          {
            label: "schemas/",
            children: [
              { label: "resume.py", desc: "Pydantic: ResumeCreate, ResumeResponse, ParsedResumeOut" },
              { label: "job.py", desc: "Pydantic: JobCreate, JobResponse, MatchRequest" },
              { label: "match.py", desc: "Pydantic: MatchResponse, ScoreDetail, RankedJob" },
            ],
          },
          {
            label: "services/",
            children: [
              { label: "resume_service.py", desc: "Orchestrates parse → embed → store pipeline" },
              { label: "job_service.py", desc: "Job CRUD + batch embedding on creation" },
              { label: "match_service.py", desc: "Calls FAISS search, then scorer for top-N candidates" },
              { label: "storage_service.py", desc: "S3/GCS file upload, presigned URL generation" },
            ],
          },
          {
            label: "workers/",
            children: [
              { label: "celery_app.py", desc: "Celery init with Redis broker config" },
              { label: "tasks.py", desc: "Async tasks: parse_resume_task, embed_job_task, batch_match_task" },
            ],
          },
          {
            label: "db/",
            children: [
              { label: "session.py", desc: "Async SQLAlchemy engine + session factory / Motor client" },
              { label: "migrations/", desc: "Alembic migration scripts (if PostgreSQL)" },
              { label: "seed.py", desc: "Dev seed: sample jobs, test users" },
            ],
          },
          { label: "utils/", desc: "Text cleaning, date parsing, skill taxonomy normalization helpers" },
          { label: "exceptions.py", desc: "Custom HTTP exceptions: ParseError, MatchError, StorageError" },
          { label: "logging.py", desc: "Structured JSON logging with correlation IDs" },
        ],
      },
      { label: "tests/", desc: "pytest: unit (parser, scorer), integration (API routes), load tests" },
      { label: "Dockerfile", desc: "Multi-stage build: builder → runtime, non-root user" },
      { label: "docker-compose.yml", desc: "Services: api, worker, postgres/mongo, redis, minio" },
      { label: "requirements.txt", desc: "Pinned deps: fastapi, spacy, sentence-transformers, faiss-cpu, celery" },
      { label: ".env.example", desc: "Template for all required environment variables" },
    ],
  },
  frontend: {
    label: "frontend/",
    color: "#06b6d4",
    children: [
      {
        label: "src/",
        children: [
          {
            label: "components/",
            children: [
              { label: "ResumeUploader.tsx", desc: "Drag-and-drop zone, file validation, upload progress bar" },
              { label: "ParsedResumeCard.tsx", desc: "Displays extracted skills, experience, education with confidence badges" },
              { label: "JobMatchList.tsx", desc: "Virtualized list of ranked jobs with match % gauges" },
              { label: "ScoreBreakdown.tsx", desc: "Recharts radar/bar chart showing score dimensions" },
              { label: "JobCard.tsx", desc: "Job summary with skill gap highlights and apply CTA" },
              { label: "SkillTags.tsx", desc: "Matched (green) vs missing (red) skill tag cloud" },
            ],
          },
          {
            label: "pages/",
            children: [
              { label: "Dashboard.tsx", desc: "Overview: recent uploads, match history, quick stats" },
              { label: "ResumeAnalysis.tsx", desc: "Full parsed resume view + trigger match action" },
              { label: "JobMatches.tsx", desc: "Ranked job list, filters by score/location/type" },
              { label: "JobDetail.tsx", desc: "Single job: full description + per-resume fit analysis" },
              { label: "Upload.tsx", desc: "Dedicated upload flow with step indicator" },
              { label: "Auth.tsx", desc: "Login / register forms" },
            ],
          },
          {
            label: "store/",
            children: [
              { label: "resumeSlice.ts", desc: "Redux slice: upload state, parsed data, loading flags" },
              { label: "jobSlice.ts", desc: "Job listings cache, filters, pagination" },
              { label: "matchSlice.ts", desc: "Match results, selected job, score breakdown" },
              { label: "authSlice.ts", desc: "User session, JWT token management" },
            ],
          },
          {
            label: "api/",
            children: [
              { label: "client.ts", desc: "Axios instance with JWT interceptor, retry logic" },
              { label: "resumeApi.ts", desc: "uploadResume(), getResume(), listResumes()" },
              { label: "jobApi.ts", desc: "listJobs(), getJob(), searchJobs()" },
              { label: "matchApi.ts", desc: "triggerMatch(), getMatchResults(), getScoreBreakdown()" },
            ],
          },
          { label: "hooks/", desc: "useResumeUpload, useMatchPoll (polling for async results), useJobFilters" },
          { label: "utils/", desc: "formatScore(), skillDiffHighlight(), truncate(), dateFormat()" },
          { label: "types/", desc: "TypeScript interfaces: Resume, Job, MatchResult, ScoreBreakdown" },
        ],
      },
      { label: "public/", desc: "Static assets: icons, og-image, manifest.json" },
      { label: "Dockerfile", desc: "Nginx-based production image with SPA fallback config" },
      { label: "vite.config.ts", desc: "Vite: proxy /api → backend, env injection, chunk splitting" },
      { label: "tailwind.config.ts", desc: "Design tokens, custom colors, shadcn-ui integration" },
    ],
  },
};

const flowSteps = [
  {
    step: "01",
    title: "Resume Upload",
    color: "#f97316",
    bg: "#1c0a00",
    items: [
      "User drags PDF/DOCX onto ResumeUploader",
      "Frontend validates file type & size (<10MB)",
      "POST /api/resumes/upload with multipart form",
      "Backend stores raw file to S3/MinIO",
      "Returns resume_id; Celery task queued",
    ],
  },
  {
    step: "02",
    title: "Parsing & NLP",
    color: "#a855f7",
    bg: "#0d0014",
    items: [
      "parse_resume_task picks up from Redis queue",
      "PyMuPDF/python-docx extracts raw text",
      "Regex + rule-based segmentation into sections",
      "spaCy NER extracts: names, orgs, dates, locations",
      "Custom skill extractor matches against taxonomy DB",
    ],
  },
  {
    step: "03",
    title: "Embedding & Storage",
    color: "#06b6d4",
    bg: "#00080d",
    items: [
      "SentenceTransformer encodes full resume text → 768-dim vector",
      "Section-level embeddings stored per field",
      "Vector + metadata persisted in PostgreSQL / MongoDB",
      "FAISS index updated with new resume vector",
      "ParsedResume entity created; status → READY",
    ],
  },
  {
    step: "04",
    title: "Job Matching",
    color: "#22c55e",
    bg: "#00100a",
    items: [
      "POST /api/match with {resume_id, filters, top_k}",
      "FAISS ANN search returns top-100 candidate jobs",
      "Matcher computes attribute-level similarity",
      "Scorer applies weighted formula → final [0–100] score",
      "Top-N ranked results stored in MatchResult table",
    ],
  },
  {
    step: "05",
    title: "Result Delivery",
    color: "#f59e0b",
    bg: "#0d0800",
    items: [
      "Frontend polls GET /api/match/{id} until COMPLETE",
      "JobMatchList renders sorted job cards",
      "ScoreBreakdown shows radar chart per dimension",
      "SkillTags highlights matched vs. gap skills",
      "User can apply, save, or request re-analysis",
    ],
  },
];

const modules = [
  {
    name: "Parser",
    file: "core/parser.py",
    color: "#f97316",
    icon: "📄",
    points: [
      { label: "Input", text: "Binary PDF or DOCX blob from storage" },
      { label: "Text Extraction", text: "PyMuPDF for PDFs (layout-aware); python-docx for Word files" },
      { label: "Section Detection", text: "Regex + indent/font heuristics for Education, Experience, Skills, Summary" },
      { label: "Output", text: "Structured dict: {contact, summary, skills[], experience[], education[]}" },
      { label: "Error Handling", text: "Raises ParseError on corruption; OCR fallback via Tesseract for scanned PDFs" },
    ],
  },
  {
    name: "NLP Engine",
    file: "core/nlp_engine.py",
    color: "#a855f7",
    icon: "🧠",
    points: [
      { label: "NER", text: "spaCy en_core_web_trf for person, org, date, location entities" },
      { label: "Skill Extraction", text: "PhraseMatcher against curated O*NET + custom 8k-term taxonomy" },
      { label: "Embeddings", text: "all-mpnet-base-v2 (768-dim) for semantic similarity; batched for performance" },
      { label: "Experience Parsing", text: "Date-range extraction → YoE calculation per role and domain" },
      { label: "Normalization", text: "Alias resolution: 'JS' → 'JavaScript', 'ML' → 'Machine Learning'" },
    ],
  },
  {
    name: "Matcher",
    file: "core/matcher.py",
    color: "#06b6d4",
    icon: "🔗",
    points: [
      { label: "Stage 1 – ANN", text: "FAISS IndexFlatIP over job embeddings; top-100 candidates retrieved in <50ms" },
      { label: "Stage 2 – Attribute", text: "Skill set intersection/union; YoE comparison; education level mapping" },
      { label: "Semantic Sim", text: "Cosine similarity between resume section vectors and job description segments" },
      { label: "Filters", text: "Pre-filter by location, job type, salary range before scoring to reduce compute" },
      { label: "Output", text: "List of (job_id, raw_score, attribute_scores) tuples" },
    ],
  },
  {
    name: "Scorer",
    file: "core/scorer.py",
    color: "#22c55e",
    icon: "📊",
    points: [
      { label: "Skills (40%)", text: "Jaccard + semantic skill overlap; bonus for rare/in-demand skills" },
      { label: "Experience (30%)", text: "YoE match, role title similarity, domain relevance via embedding" },
      { label: "Education (20%)", text: "Degree level match, field-of-study cosine similarity" },
      { label: "Keywords (10%)", text: "TF-IDF weighted keyword overlap between resume and JD" },
      { label: "Output", text: "Normalized 0–100 score + breakdown dict stored in ScoreBreakdown table" },
    ],
  },
];

const techStack = [
  { layer: "API Layer", color: "#f97316", items: ["FastAPI + Uvicorn (ASGI)", "Pydantic v2 validation", "JWT Auth (python-jose)", "Rate limiting (slowapi)"] },
  { layer: "NLP / ML", color: "#a855f7", items: ["spaCy 3.x (NER)", "SentenceTransformers", "FAISS (vector search)", "scikit-learn (TF-IDF)"] },
  { layer: "Async / Queue", color: "#06b6d4", items: ["Celery + Redis broker", "Async SQLAlchemy", "Motor (async MongoDB)", "WebSocket for live status"] },
  { layer: "Storage", color: "#22c55e", items: ["PostgreSQL (relational)", "MongoDB (document alt)", "Redis (cache + queue)", "MinIO / S3 (files)"] },
  { layer: "Frontend", color: "#f59e0b", items: ["React 18 + TypeScript", "Redux Toolkit + RTK Query", "Recharts (viz)", "Tailwind + shadcn/ui"] },
  { layer: "Infra / DevOps", color: "#ec4899", items: ["Docker + Compose", "Nginx reverse proxy", "GitHub Actions CI", "Prometheus + Grafana"] },
];

function FileTree({ nodes, depth = 0 }) {
  const [open, setOpen] = useState({});
  return (
    <div style={{ paddingLeft: depth * 16 }}>
      {nodes.map((node, i) => {
        const hasChildren = node.children && node.children.length > 0;
        const isOpen = open[i];
        return (
          <div key={i}>
            <div
              onClick={() => hasChildren && setOpen(o => ({ ...o, [i]: !o[i] }))}
              style={{
                display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 6px",
                borderRadius: 4, cursor: hasChildren ? "pointer" : "default",
                marginBottom: 2,
              }}
              className="tree-row"
            >
              <span style={{ fontSize: 11, marginTop: 2, color: hasChildren ? "#94a3b8" : "#64748b", flexShrink: 0 }}>
                {hasChildren ? (isOpen ? "▾" : "▸") : "·"}
              </span>
              <div>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5,
                  color: hasChildren ? "#e2e8f0" : "#94a3b8",
                  fontWeight: hasChildren ? 600 : 400,
                }}>
                  {node.label}
                </span>
                {node.desc && (
                  <span style={{ fontSize: 11.5, color: "#475569", marginLeft: 8, fontFamily: "inherit" }}>
                    — {node.desc}
                  </span>
                )}
              </div>
            </div>
            {hasChildren && isOpen && (
              <FileTree nodes={node.children} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState(0);
  const [openTree, setOpenTree] = useState({ backend: true, frontend: false });

  return (
    <div style={{
      minHeight: "100vh", background: "#080c14",
      fontFamily: "'DM Sans', system-ui, sans-serif", color: "#e2e8f0",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .tree-row:hover { background: rgba(255,255,255,0.04); }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0f1421; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
        .tab-btn { transition: all 0.2s; }
        .tab-btn:hover { color: #e2e8f0 !important; }
        .module-card { transition: transform 0.2s, box-shadow 0.2s; }
        .module-card:hover { transform: translateY(-2px); }
      `}</style>

      {/* Header */}
      <div style={{
        borderBottom: "1px solid #1e293b", padding: "20px 32px",
        background: "linear-gradient(180deg, #0d1525 0%, #080c14 100%)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: "linear-gradient(135deg, #f97316, #a855f7)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
            }}>⚡</div>
            <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#64748b", letterSpacing: 2, textTransform: "uppercase" }}>System Architecture</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f8fafc", letterSpacing: -0.5 }}>
            AI Resume Analyzer & Job Matcher
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["FastAPI", "React", "PostgreSQL"].map(t => (
            <span key={t} style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 20, border: "1px solid #1e293b",
              color: "#64748b", fontFamily: "'JetBrains Mono', monospace",
            }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1e293b", padding: "0 32px" }}>
        {tabs.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className="tab-btn"
            style={{
              background: "none", border: "none", padding: "14px 20px", cursor: "pointer",
              fontSize: 13, fontWeight: 500, color: activeTab === i ? "#f8fafc" : "#475569",
              borderBottom: activeTab === i ? "2px solid #f97316" : "2px solid transparent",
              marginBottom: -1, transition: "all 0.2s",
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "28px 32px", maxWidth: 1100 }}>

        {/* FOLDER STRUCTURE */}
        {activeTab === 0 && (
          <div>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 20 }}>
              Click any folder to expand. Each file is annotated with its responsibility.
            </p>
            {[folderData.backend, folderData.frontend].map((tree, ti) => {
              const key = ti === 0 ? "backend" : "frontend";
              return (
                <div key={key} style={{ marginBottom: 16, background: "#0d1525", borderRadius: 10, border: "1px solid #1e293b", overflow: "hidden" }}>
                  <div
                    onClick={() => setOpenTree(o => ({ ...o, [key]: !o[key] }))}
                    style={{
                      padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                      background: "rgba(255,255,255,0.02)", borderBottom: openTree[key] ? "1px solid #1e293b" : "none",
                    }}>
                    <span style={{ color: tree.color, fontSize: 13 }}>{openTree[key] ? "▾" : "▸"}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: tree.color }}>
                      {tree.label}
                    </span>
                  </div>
                  {openTree[key] && (
                    <div style={{ padding: "12px 8px" }}>
                      <FileTree nodes={tree.children} depth={1} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* SYSTEM FLOW */}
        {activeTab === 1 && (
          <div>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>
              End-to-end pipeline from file upload to ranked job results.
            </p>
            <div style={{ position: "relative" }}>
              {/* Connector line */}
              <div style={{
                position: "absolute", left: 27, top: 40, bottom: 40, width: 2,
                background: "linear-gradient(180deg, #f97316, #a855f7, #06b6d4, #22c55e, #f59e0b)",
                borderRadius: 1,
              }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {flowSteps.map((s) => (
                  <div key={s.step} style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                    <div style={{
                      width: 54, height: 54, borderRadius: "50%", flexShrink: 0,
                      background: s.bg, border: `2px solid ${s.color}`,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      position: "relative", zIndex: 1,
                    }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: s.color, lineHeight: 1 }}>STEP</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: s.color }}>{s.step}</span>
                    </div>
                    <div style={{
                      flex: 1, background: "#0d1525", borderRadius: 10, border: `1px solid ${s.color}22`,
                      padding: "14px 18px",
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: s.color, marginBottom: 10 }}>{s.title}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {s.items.map((item, j) => (
                          <div key={j} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <span style={{ color: s.color, fontSize: 10, marginTop: 4 }}>→</span>
                            <span style={{ fontSize: 12.5, color: "#94a3b8", lineHeight: 1.5 }}>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* KEY MODULES */}
        {activeTab === 2 && (
          <div>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>
              Core processing modules with inputs, outputs, and design decisions.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {modules.map((mod) => (
                <div key={mod.name} className="module-card" style={{
                  background: "#0d1525", borderRadius: 12, border: `1px solid ${mod.color}33`,
                  padding: "20px", boxShadow: `0 0 30px ${mod.color}08`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 22 }}>{mod.icon}</span>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: mod.color }}>{mod.name}</div>
                      <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#475569" }}>{mod.file}</div>
                    </div>
                  </div>
                  <div style={{ height: 1, background: `${mod.color}22`, margin: "12px 0" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {mod.points.map((p) => (
                      <div key={p.label} style={{ display: "flex", gap: 8 }}>
                        <span style={{
                          fontSize: 10.5, fontWeight: 600, color: mod.color, minWidth: 80,
                          fontFamily: "'JetBrains Mono', monospace", paddingTop: 1, flexShrink: 0,
                        }}>{p.label}</span>
                        <span style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{p.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Scoring formula callout */}
            <div style={{
              marginTop: 20, padding: "16px 20px", borderRadius: 10,
              background: "#0a1020", border: "1px solid #1e293b",
            }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>SCORING FORMULA</div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#e2e8f0", lineHeight: 2,
              }}>
                <span style={{ color: "#22c55e" }}>final_score</span>
                {" = "}
                <span style={{ color: "#f97316" }}>0.40</span> × skills_score
                {" + "}
                <span style={{ color: "#a855f7" }}>0.30</span> × experience_score
                {" + "}
                <span style={{ color: "#06b6d4" }}>0.20</span> × education_score
                {" + "}
                <span style={{ color: "#f59e0b" }}>0.10</span> × keyword_score
              </div>
            </div>
          </div>
        )}

        {/* TECH STACK */}
        {activeTab === 3 && (
          <div>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>
              Curated technology choices per system layer with production rationale.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {techStack.map((layer) => (
                <div key={layer.layer} style={{
                  background: "#0d1525", borderRadius: 10, border: `1px solid ${layer.color}30`,
                  padding: "16px",
                }}>
                  <div style={{
                    fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: layer.color,
                    fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12,
                    borderBottom: `1px solid ${layer.color}22`, paddingBottom: 8,
                  }}>
                    {layer.layer}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {layer.items.map((item) => (
                      <div key={item} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: layer.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12.5, color: "#94a3b8" }}>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Database choice note */}
            <div style={{
              marginTop: 20, padding: "16px 20px", borderRadius: 10,
              background: "#0a1020", border: "1px solid #1e293b",
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20,
            }}>
              <div>
                <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600, marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}>
                  USE POSTGRESQL WHEN
                </div>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.7 }}>
                  You need ACID transactions, complex relational joins (user → resume → match), reporting queries, or are already on a SQL stack. Best for structured, stable schemas.
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#06b6d4", fontWeight: 600, marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}>
                  USE MONGODB WHEN
                </div>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.7 }}>
                  Resume parse output varies wildly per template, or you expect frequent schema changes in parsed entities. Flexible documents = faster iteration on extraction models.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
