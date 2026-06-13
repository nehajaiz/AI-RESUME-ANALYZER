import { useState, useRef, useCallback, useEffect } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  Cell, RadialBarChart, RadialBar
} from "recharts";

const API = "http://localhost:8000/api/v1";

// ── Mock data for demo mode ──────────────────────────────────────────────────
const DEMO = {
  upload: { resume_id: "demo-001", filename: "alice_zhang_resume.pdf", file_type: "pdf", word_count: 487 },
  analysis: {
    resume_id: "demo-001",
    analysis: {
      skill_count: 18,
      total_experience_years: 4,
      skills: [
        { name: "Python", category: "languages", occurrences: 3 },
        { name: "TypeScript", category: "languages", occurrences: 2 },
        { name: "Go", category: "languages", occurrences: 1 },
        { name: "FastAPI", category: "web_frameworks", occurrences: 2 },
        { name: "React", category: "web_frameworks", occurrences: 2 },
        { name: "Django", category: "web_frameworks", occurrences: 1 },
        { name: "PostgreSQL", category: "databases", occurrences: 3 },
        { name: "Redis", category: "databases", occurrences: 2 },
        { name: "MongoDB", category: "databases", occurrences: 1 },
        { name: "AWS", category: "cloud_devops", occurrences: 2 },
        { name: "Docker", category: "cloud_devops", occurrences: 3 },
        { name: "Kubernetes", category: "cloud_devops", occurrences: 1 },
        { name: "PyTorch", category: "data_ml", occurrences: 1 },
        { name: "Pandas", category: "data_ml", occurrences: 1 },
        { name: "Git", category: "tools_practices", occurrences: 2 },
        { name: "REST", category: "tools_practices", occurrences: 2 },
        { name: "CI/CD", category: "tools_practices", occurrences: 1 },
        { name: "Agile", category: "tools_practices", occurrences: 1 },
      ],
      skills_by_category: {
        languages: ["Python", "TypeScript", "Go"],
        web_frameworks: ["FastAPI", "React", "Django"],
        databases: ["PostgreSQL", "Redis", "MongoDB"],
        cloud_devops: ["AWS", "Docker", "Kubernetes"],
        data_ml: ["PyTorch", "Pandas"],
        tools_practices: ["Git", "REST", "CI/CD", "Agile"],
      },
      education: [{ degree: "Bachelor's", field: "Computer Science", institution: "Stanford University", year: 2020 }],
      experience: [
        { title: "Senior Software Engineer", company: "Stripe", start_year: 2022, end_year: null, years: 3 },
        { title: "Backend Engineer", company: "Acme Corp", start_year: 2020, end_year: 2022, years: 2 },
      ],
    },
    ats_score: {
      ats_score: 74.5,
      grade: "B",
      components: [
        { name: "Skill Match", raw_score: 87.5, weight: 0.40, weighted: 35.0, detail: "7/8 required skills matched" },
        { name: "Experience Relevance", raw_score: 72.0, weight: 0.25, weighted: 18.0, detail: "4.0 yrs meets 5-yr requirement" },
        { name: "Keyword Optimisation", raw_score: 58.0, weight: 0.20, weighted: 11.6, detail: "12/20 JD keywords present" },
        { name: "Education Fit", raw_score: 100.0, weight: 0.15, weighted: 15.0, detail: "Bachelor's meets requirement" },
      ],
      matched_skills: ["Python", "FastAPI", "PostgreSQL", "Redis", "AWS", "Docker", "Git"],
      missing_skills: ["REST"],
      bonus_skills: ["Kubernetes", "React"],
      matched_keywords: ["payment", "apis", "fastapi", "python", "postgresql"],
      missing_keywords: ["distributed systems", "high-availability", "terraform"],
      suggestions: [
        "Strong match! Tailor your cover letter to the specific team and product.",
        "Add missing required skill: REST to your skills section.",
        "Incorporate these high-value JD keywords: distributed systems, high-availability, terraform.",
        "You are 1.0 year(s) short of the 5-yr requirement. Highlight open-source contributions.",
        "Use strong action verbs (Designed, Implemented, Reduced) to begin each bullet point.",
      ],
      experience_gap: 1.0,
      education_met: true,
    },
    top_match: { rank: 1, title: "Senior Backend Engineer", company: "Stripe", match_pct: 77.9 },
  },
  matches: {
    resume_id: "demo-001",
    total_jobs_searched: 10,
    matches: [
      { rank: 1, job_id: "JOB001", title: "Senior Backend Engineer", company: "Stripe", location: "Remote", job_type: "Full-time", salary_range: "$160k–$200k", match_pct: 77.9, skill_score: 87.5, semantic_score: 62.0, experience_score: 72.0, matched_skills: ["Python", "FastAPI", "PostgreSQL", "Redis", "AWS", "Docker", "Git"], missing_skills: ["REST"], bonus_skills: ["Kubernetes"], reasons: ["Strong skill alignment: 7/8 required skills matched (87%).", "Key skills matched: AWS, Docker, FastAPI, Git, PostgreSQL.", "Resume description strongly aligns with the job context."], experience_required: 5 },
      { rank: 2, job_id: "JOB003", title: "Full Stack Developer", company: "Shopify", location: "Remote", job_type: "Full-time", salary_range: "$120k–$155k", match_pct: 61.2, skill_score: 72.0, semantic_score: 55.0, experience_score: 85.0, matched_skills: ["TypeScript", "React", "PostgreSQL", "Git"], missing_skills: ["Next.js", "GraphQL", "Node.js", "Docker"], bonus_skills: ["Redis"], reasons: ["Partial skill overlap: matched 4 required skills (72% coverage).", "Key skills matched: TypeScript, React, PostgreSQL.", "Missing required: Next.js, GraphQL, Node.js, Docker."], experience_required: 3 },
      { rank: 3, job_id: "JOB010", title: "MLOps Engineer", company: "Hugging Face", location: "Remote", job_type: "Full-time", salary_range: "$140k–$180k", match_pct: 54.8, skill_score: 65.0, semantic_score: 48.0, experience_score: 80.0, matched_skills: ["Python", "Docker", "AWS", "Git"], missing_skills: ["MLflow", "Airflow", "PyTorch"], bonus_skills: ["Kubernetes"], reasons: ["Partial skill overlap: matched 4 required skills.", "Key skills matched: Python, Docker, AWS.", "Missing required: MLflow, Airflow."], experience_required: 3 },
      { rank: 4, job_id: "JOB004", title: "Data Engineer", company: "Airbnb", location: "San Francisco, CA", job_type: "Full-time", salary_range: "$140k–$175k", match_pct: 48.3, skill_score: 52.0, semantic_score: 41.0, experience_score: 78.0, matched_skills: ["Python", "PostgreSQL", "AWS", "Git"], missing_skills: ["Spark", "Airflow", "dbt"], bonus_skills: [], reasons: ["Partial skill overlap: matched 4/7 required skills.", "Missing required: Spark, Airflow, dbt."], experience_required: 4 },
      { rank: 5, job_id: "JOB005", title: "DevOps / Platform Engineer", company: "GitHub", location: "Remote", job_type: "Full-time", salary_range: "$145k–$185k", match_pct: 44.1, skill_score: 47.0, semantic_score: 39.0, experience_score: 72.0, matched_skills: ["AWS", "Docker", "Python", "Git"], missing_skills: ["Kubernetes", "Terraform", "Prometheus", "Linux", "GitHub Actions"], bonus_skills: [], reasons: ["Low skill coverage (47%).", "Missing required: Terraform, Prometheus, Linux."], experience_required: 4 },
    ],
  },
};

// ── Colour system ─────────────────────────────────────────────────────────────
const C = {
  violet: "#6366f1", violetLight: "#818cf8", violetDim: "#e0e7ff",
  slate50: "#f8fafc", slate100: "#f1f5f9", slate200: "#e2e8f0",
  slate400: "#94a3b8", slate500: "#64748b", slate600: "#475569",
  slate700: "#334155", slate800: "#1e293b", slate900: "#0f172a",
  green: "#10b981", greenLight: "#d1fae5", red: "#ef4444", redLight: "#fee2e2",
  amber: "#f59e0b", amberLight: "#fef3c7",
  blue: "#3b82f6", blueLight: "#dbeafe",
  white: "#ffffff",
};

const scoreColor = v => v >= 75 ? C.green : v >= 55 ? C.amber : C.red;
const scoreBg = v => v >= 75 ? C.greenLight : v >= 55 ? C.amberLight : C.redLight;

const CAT_COLORS = {
  languages: "#6366f1", web_frameworks: "#8b5cf6", databases: "#06b6d4",
  cloud_devops: "#f59e0b", data_ml: "#ef4444", tools_practices: "#10b981", soft_skills: "#64748b",
};
const CAT_LABELS = {
  languages: "Languages", web_frameworks: "Frameworks", databases: "Databases",
  cloud_devops: "Cloud & DevOps", data_ml: "Data & ML", tools_practices: "Tools", soft_skills: "Soft Skills",
};
const CAT_ORDER = ["languages","web_frameworks","databases","cloud_devops","data_ml","tools_practices","soft_skills"];

// ── Inline styles ─────────────────────────────────────────────────────────────
const S = {
  shell: { fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif", background:C.slate100, minHeight:"100vh", color:C.slate800 },
  sidebar: { width:220, background:C.white, borderRight:`1px solid ${C.slate200}`, display:"flex", flexDirection:"column", position:"fixed", top:0, left:0, bottom:0, zIndex:50 },
  sideHead: { padding:"24px 20px 20px", borderBottom:`1px solid ${C.slate100}` },
  logo: { display:"flex", alignItems:"center", gap:10 },
  logoMark: { width:32, height:32, borderRadius:8, background:`linear-gradient(135deg, ${C.violet}, ${C.violetLight})`, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:16, fontWeight:700, flexShrink:0 },
  logoText: { fontSize:15, fontWeight:700, color:C.slate900, letterSpacing:-0.3 },
  logoSub: { fontSize:11, color:C.slate400, marginTop:1 },
  navSection: { padding:"16px 12px 8px" },
  navLabel: { fontSize:10, fontWeight:600, letterSpacing:"0.08em", color:C.slate400, textTransform:"uppercase", padding:"0 8px", marginBottom:6 },
  navItem: (active) => ({ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:500, color:active?C.violet:C.slate600, background:active?C.violetDim:"transparent", transition:"all .15s", marginBottom:2 }),
  navIcon: { fontSize:16, width:20, textAlign:"center" },
  content: { marginLeft:220, minHeight:"100vh", display:"flex", flexDirection:"column" },
  topbar: { background:C.white, borderBottom:`1px solid ${C.slate200}`, padding:"0 28px", height:56, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:40 },
  topbarTitle: { fontSize:15, fontWeight:600, color:C.slate800 },
  topbarRight: { display:"flex", alignItems:"center", gap:12 },
  avatar: { width:32, height:32, borderRadius:"50%", background:`linear-gradient(135deg, ${C.violet}, ${C.violetLight})`, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:13, fontWeight:600 },
  badge: (color, bg) => ({ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:20, color, background:bg }),
  main: { padding:28, flex:1 },
  pageHeader: { marginBottom:24 },
  pageTitle: { fontSize:22, fontWeight:700, color:C.slate900, letterSpacing:-0.4 },
  pageSub: { fontSize:13, color:C.slate500, marginTop:4 },
  grid: (cols) => ({ display:"grid", gridTemplateColumns:`repeat(${cols}, 1fr)`, gap:20, marginBottom:20 }),
  card: { background:C.white, borderRadius:12, border:`1px solid ${C.slate200}`, overflow:"hidden" },
  cardPad: { padding:"20px 22px" },
  cardHead: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 },
  cardTitle: { fontSize:13, fontWeight:600, color:C.slate700, letterSpacing:-0.1 },
  cardSub: { fontSize:11, color:C.slate400, marginTop:2 },
  statVal: { fontSize:28, fontWeight:700, color:C.slate900, letterSpacing:-1 },
  statLabel: { fontSize:12, color:C.slate500, marginTop:4 },
  statDelta: (pos) => ({ fontSize:11, fontWeight:600, color:pos?C.green:C.red, background:pos?C.greenLight:C.redLight, padding:"2px 7px", borderRadius:20 }),
  uploadZone: { border:`2px dashed ${C.slate200}`, borderRadius:12, padding:"40px 28px", textAlign:"center", cursor:"pointer", transition:"all .2s" },
  uploadIcon: { fontSize:36, marginBottom:14, opacity:0.4 },
  uploadTitle: { fontSize:15, fontWeight:600, color:C.slate700, marginBottom:6 },
  uploadSub: { fontSize:13, color:C.slate400 },
  btn: (variant="primary") => ({
    display:"inline-flex", alignItems:"center", gap:7, padding:"9px 16px", borderRadius:8,
    fontSize:13, fontWeight:600, cursor:"pointer", border:"none", transition:"all .15s",
    ...(variant==="primary" ? { background:C.violet, color:"#fff" } :
        variant==="ghost"   ? { background:"transparent", color:C.slate600, border:`1px solid ${C.slate200}` } :
                               { background:C.violetDim, color:C.violet }),
  }),
  progressBar: { height:6, background:C.slate100, borderRadius:3, overflow:"hidden" },
  progressFill: (w, color=C.violet) => ({ width:`${w}%`, height:"100%", background:color, borderRadius:3, transition:"width .6s ease" }),
  skillTag: (cat) => ({ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:6, background:`${CAT_COLORS[cat]}18`, color:CAT_COLORS[cat], fontSize:12, fontWeight:500, border:`1px solid ${CAT_COLORS[cat]}30`, whiteSpace:"nowrap" }),
  dot: (color) => ({ width:8, height:8, borderRadius:"50%", background:color, display:"inline-block" }),
  divider: { height:1, background:C.slate100, margin:"16px 0" },
  jobCard: (active) => ({ padding:"16px 18px", borderRadius:10, border:`1px solid ${active?C.violet:C.slate200}`, marginBottom:10, background:active?`${C.violet}04`:C.white, cursor:"pointer", transition:"all .15s", position:"relative" }),
  rankBadge: (r) => ({ position:"absolute", top:14, right:14, fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, background:r===1?`${C.violet}15`:C.slate100, color:r===1?C.violet:C.slate500 }),
  sugItem: { display:"flex", gap:12, padding:"12px 0", borderBottom:`1px solid ${C.slate100}` },
  sugNum: { width:24, height:24, borderRadius:6, background:C.violetDim, color:C.violet, fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 },
  sugText: { fontSize:13, color:C.slate600, lineHeight:1.6 },
  chip: (type) => ({ fontSize:11, fontWeight:500, padding:"3px 9px", borderRadius:6,
    ...(type==="missing" ? { background:C.redLight, color:C.red, border:`1px solid ${C.red}30` } :
        type==="bonus"   ? { background:C.greenLight, color:C.green, border:`1px solid ${C.green}30` } :
                            { background:C.violetDim, color:C.violet, border:`1px solid ${C.violet}30` }),
  }),
  emptyState: { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"60px 20px", gap:12, textAlign:"center" },
  spinner: { width:20, height:20, border:`2px solid ${C.slate200}`, borderTopColor:C.violet, borderRadius:"50%", animation:"spin .7s linear infinite" },
};

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = C.violet }) {
  return (
    <div style={S.card}>
      <div style={S.cardPad}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:C.slate400, letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:8 }}>{label}</div>
            <div style={{ fontSize:30, fontWeight:700, color:C.slate900, letterSpacing:-1, lineHeight:1 }}>{value}</div>
            {sub && <div style={{ fontSize:12, color:C.slate400, marginTop:6 }}>{sub}</div>}
          </div>
          <div style={{ width:42, height:42, borderRadius:10, background:`${color}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>{icon}</div>
        </div>
      </div>
    </div>
  );
}

// ── Radial ATS gauge ──────────────────────────────────────────────────────────
function ATSRadialGauge({ score, grade }) {
  const data = [{ value: score, fill: scoreColor(score) }];
  return (
    <div style={{ position:"relative", height:180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart cx="50%" cy="55%" innerRadius="65%" outerRadius="90%"
          startAngle={210} endAngle={-30} data={data} barSize={14}>
          <PolarAngleAxis type="number" domain={[0,100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill:C.slate100 }} dataKey="value" cornerRadius={7} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-40%)", textAlign:"center" }}>
        <div style={{ fontSize:36, fontWeight:700, color:scoreColor(score), letterSpacing:-2, lineHeight:1 }}>{score.toFixed(0)}</div>
        <div style={{ fontSize:11, color:C.slate400, fontWeight:500, marginTop:2, letterSpacing:"0.05em" }}>ATS SCORE</div>
        <div style={{ ...S.badge(scoreColor(score), scoreBg(score)), display:"inline-block", marginTop:6, fontSize:13, fontWeight:700 }}>Grade {grade}</div>
      </div>
    </div>
  );
}

// ── Radar chart for skill categories ─────────────────────────────────────────
function SkillRadar({ byCategory }) {
  const cats = Object.keys(byCategory);
  const data = cats.map(c => ({ category: CAT_LABELS[c]||c, count: byCategory[c].length, fullMark: 6 }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
        <PolarGrid stroke={C.slate200} />
        <PolarAngleAxis dataKey="category" tick={{ fill:C.slate500, fontSize:10, fontWeight:500 }} />
        <PolarRadiusAxis angle={30} domain={[0,6]} tick={false} axisLine={false} />
        <Radar name="Skills" dataKey="count" stroke={C.violet} fill={C.violet} fillOpacity={0.15} strokeWidth={2} dot={{ fill:C.violet, strokeWidth:0, r:3 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ── Component score bar chart ─────────────────────────────────────────────────
function ComponentChart({ components }) {
  const data = components.map(c => ({
    name: { "Skill Match":"Skills", "Experience Relevance":"Experience", "Keyword Optimisation":"Keywords", "Education Fit":"Education" }[c.name] || c.name,
    score: Math.round(c.raw_score),
    weight: Math.round(c.weight * 100),
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background:C.white, border:`1px solid ${C.slate200}`, borderRadius:8, padding:"10px 14px", boxShadow:"0 4px 16px rgba(0,0,0,0.08)" }}>
        <div style={{ fontSize:12, fontWeight:600, color:C.slate700, marginBottom:4 }}>{label}</div>
        <div style={{ fontSize:13, fontWeight:700, color:scoreColor(payload[0].value) }}>{payload[0].value}/100</div>
        <div style={{ fontSize:11, color:C.slate400 }}>Weight: {payload[0].payload.weight}%</div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} barCategoryGap="30%" margin={{ top:4, right:4, left:-20, bottom:0 }}>
        <XAxis dataKey="name" tick={{ fontSize:11, fill:C.slate500, fontWeight:500 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0,100]} tick={{ fontSize:10, fill:C.slate400 }} axisLine={false} tickLine={false} ticks={[0,50,100]} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill:`${C.violet}08` }} />
        <Bar dataKey="score" radius={[6,6,0,0]}>
          {data.map((d,i) => <Cell key={i} fill={scoreColor(d.score)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Skill gap visualization ───────────────────────────────────────────────────
function SkillGapChart({ matched, missing, bonus }) {
  const allSkills = [
    ...matched.map(s => ({ name:s, type:"matched", val:100 })),
    ...missing.map(s => ({ name:s, type:"missing", val:100 })),
    ...bonus.map(s => ({ name:s, type:"bonus", val:100 })),
  ].slice(0, 10);

  return (
    <ResponsiveContainer width="100%" height={Math.max(120, allSkills.length * 28)}>
      <BarChart data={allSkills} layout="vertical" barCategoryGap="25%" margin={{ top:0, right:40, left:10, bottom:0 }}>
        <XAxis type="number" hide domain={[0,100]} />
        <YAxis type="category" dataKey="name" tick={{ fontSize:11, fill:C.slate600, fontWeight:500 }} width={80} axisLine={false} tickLine={false} />
        <Bar dataKey="val" radius={[0,4,4,0]}>
          {allSkills.map((s,i) => (
            <Cell key={i} fill={s.type==="matched"?C.green:s.type==="bonus"?C.violet:C.red} opacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Job match card ────────────────────────────────────────────────────────────
function JobMatchCard({ job, selected, onSelect }) {
  return (
    <div style={S.jobCard(selected)} onClick={() => onSelect(job.job_id)}>
      <span style={S.rankBadge(job.rank)}>#{job.rank}</span>
      <div style={{ marginBottom:8, paddingRight:50 }}>
        <div style={{ fontSize:14, fontWeight:600, color:C.slate800, marginBottom:2 }}>{job.title}</div>
        <div style={{ fontSize:12, color:C.slate500 }}>{job.company} · {job.location}</div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <div style={{ fontSize:22, fontWeight:700, color:scoreColor(job.match_pct), letterSpacing:-0.5 }}>
          {job.match_pct.toFixed(0)}%
        </div>
        <div style={{ flex:1 }}>
          <div style={S.progressBar}>
            <div style={S.progressFill(job.match_pct, scoreColor(job.match_pct))} />
          </div>
          <div style={{ fontSize:11, color:C.slate400, marginTop:3 }}>Match score</div>
        </div>
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
        {job.matched_skills.slice(0,5).map(s => (
          <span key={s} style={S.chip("matched")}>{s}</span>
        ))}
        {job.missing_skills.slice(0,2).map(s => (
          <span key={s} style={S.chip("missing")}>−{s}</span>
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <span style={{ fontSize:11, color:C.slate400 }}>💰 {job.salary_range}</span>
        <span style={{ fontSize:11, color:C.slate400 }}>⏱ {job.experience_required}yr exp.</span>
      </div>
    </div>
  );
}

// ── Upload panel ──────────────────────────────────────────────────────────────
function UploadPanel({ onResult }) {
  const [drag, setDrag] = useState(false);
  const [stage, setStage] = useState("idle");
  const [prog, setProg] = useState(0);
  const [stageMsg, setStageMsg] = useState("");
  const [error, setError] = useState(null);
  const ref = useRef();

  const run = useCallback(async f => {
    setError(null); setStage("running"); setProg(5); setStageMsg("Uploading…");
    try {
      const form = new FormData(); form.append("file", f);
      const ur = await fetch(`${API}/upload-resume`,{method:"POST",body:form});
      if (!ur.ok) throw new Error((await ur.json()).detail||"Upload failed");
      const ud = await ur.json();
      setProg(30); setStageMsg("Extracting skills…");
      const ar = await fetch(`${API}/analyze?resume_id=${ud.resume_id}`);
      if (!ar.ok) throw new Error((await ar.json()).detail||"Analysis failed");
      const ad = await ar.json();
      setProg(65); setStageMsg("Matching jobs…");
      const mr = await fetch(`${API}/match-jobs?resume_id=${ud.resume_id}&top_n=5`);
      if (!mr.ok) throw new Error((await mr.json()).detail||"Match failed");
      const md = await mr.json();
      setProg(100); setStage("done");
      onResult({ upload:ud, analysis:ad, matches:md });
    } catch(e) {
      setError(e.message||"Something went wrong."); setStage("idle"); setProg(0);
    }
  }, [onResult]);

  const onFiles = f => {
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["pdf","docx"].includes(ext)) { setError("Only PDF and DOCX supported."); return; }
    run(f);
  };

  return (
    <div style={{ maxWidth:520, margin:"0 auto" }}>
      <div style={{ ...S.card, padding:32 }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:18, fontWeight:700, color:C.slate900, marginBottom:6 }}>Analyse Your Resume</div>
          <div style={{ fontSize:13, color:C.slate400 }}>Upload your CV to get instant ATS scoring, skill gap analysis, and job matches</div>
        </div>

        <div
          style={{ ...S.uploadZone, borderColor:drag?C.violet:C.slate200, background:drag?`${C.violet}04`:C.white }}
          onDragOver={e=>{e.preventDefault();setDrag(true)}}
          onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);onFiles(e.dataTransfer.files[0])}}
          onClick={()=>ref.current?.click()}>
          <input ref={ref} type="file" accept=".pdf,.docx" style={{display:"none"}} onChange={e=>onFiles(e.target.files[0])} />
          <div style={S.uploadIcon}>📄</div>
          <div style={S.uploadTitle}>Drop your resume here</div>
          <div style={S.uploadSub}>or <span style={{color:C.violet,fontWeight:600}}>browse files</span> · PDF or DOCX · max 10 MB</div>
        </div>

        {stage === "running" && (
          <div style={{ marginTop:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
              <span style={{ fontSize:12, fontWeight:500, color:C.slate600 }}>{stageMsg}</span>
              <span style={{ fontSize:12, color:C.slate400 }}>{prog}%</span>
            </div>
            <div style={S.progressBar}><div style={S.progressFill(prog)} /></div>
          </div>
        )}

        {error && <div style={{ marginTop:16, padding:"10px 14px", borderRadius:8, background:C.redLight, color:C.red, fontSize:13 }}>⚠ {error}</div>}

        <div style={{ marginTop:24, textAlign:"center" }}>
          <div style={{ fontSize:12, color:C.slate400, marginBottom:12 }}>Or try with demo data</div>
          <button style={S.btn("outline")} onClick={() => onResult(DEMO)}>Load Demo Resume ✨</button>
        </div>
      </div>

      <div style={{ ...S.grid(3), marginTop:20 }}>
        {[["🎯","ATS Scoring","Get your score against real job descriptions"],
          ["🔍","Skill Gap Analysis","See exactly what you're missing"],
          ["💼","Job Matching","Find roles that fit your profile"]].map(([ic,t,d])=>(
          <div key={t} style={{ ...S.card, padding:"16px" }}>
            <div style={{ fontSize:22, marginBottom:8 }}>{ic}</div>
            <div style={{ fontSize:13, fontWeight:600, color:C.slate700, marginBottom:4 }}>{t}</div>
            <div style={{ fontSize:11, color:C.slate400, lineHeight:1.5 }}>{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ data, onReset }) {
  const [selJob, setSelJob] = useState(null);
  const { upload, analysis, matches } = data;
  const ats = analysis.ats_score;
  const nlp = analysis.analysis;
  const jobs = matches.matches;
  const activeJob = jobs.find(j => j.job_id === selJob) || jobs[0];

  return (
    <div>
      {/* Stats row */}
      <div style={S.grid(4)}>
        <StatCard icon="🎯" label="ATS Score" value={`${ats.ats_score.toFixed(0)}`} sub={`Grade ${ats.grade} · ${ats.education_met?"Education met":"Education gap"}`} color={scoreColor(ats.ats_score)} />
        <StatCard icon="⚡" label="Skills Found" value={nlp.skill_count} sub={`Across ${Object.keys(nlp.skills_by_category).length} categories`} color={C.violet} />
        <StatCard icon="💼" label="Top Match" value={`${jobs[0]?.match_pct.toFixed(0)}%`} sub={`${jobs[0]?.title} @ ${jobs[0]?.company}`} color={C.blue} />
        <StatCard icon="📚" label="Experience" value={`${nlp.total_experience_years}yr`} sub={ats.experience_gap > 0 ? `${ats.experience_gap}yr below top match` : "Meets requirements"} color={ats.experience_gap>0?C.amber:C.green} />
      </div>

      {/* Main grid: ATS + Components */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1.6fr 1.3fr", gap:20, marginBottom:20 }}>
        {/* ATS ring */}
        <div style={S.card}>
          <div style={S.cardPad}>
            <div style={S.cardHead}>
              <div>
                <div style={S.cardTitle}>Overall Score</div>
                <div style={S.cardSub}>vs best job match</div>
              </div>
            </div>
            <ATSRadialGauge score={ats.ats_score} grade={ats.grade} />
            <div style={S.divider} />
            <div style={{ display:"flex", justifyContent:"space-around", textAlign:"center" }}>
              <div><div style={{ fontSize:16, fontWeight:700, color:C.green }}>{ats.matched_skills.length}</div><div style={{ fontSize:10, color:C.slate400 }}>Matched</div></div>
              <div style={{ width:1, background:C.slate100 }} />
              <div><div style={{ fontSize:16, fontWeight:700, color:C.red }}>{ats.missing_skills.length}</div><div style={{ fontSize:10, color:C.slate400 }}>Missing</div></div>
              <div style={{ width:1, background:C.slate100 }} />
              <div><div style={{ fontSize:16, fontWeight:700, color:C.violet }}>{ats.bonus_skills.length}</div><div style={{ fontSize:10, color:C.slate400 }}>Bonus</div></div>
            </div>
          </div>
        </div>

        {/* Component bar chart */}
        <div style={S.card}>
          <div style={S.cardPad}>
            <div style={S.cardHead}>
              <div>
                <div style={S.cardTitle}>Score Breakdown</div>
                <div style={S.cardSub}>4 weighted components</div>
              </div>
            </div>
            <ComponentChart components={ats.components} />
            <div style={S.divider} />
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {ats.components.map(c => (
                <div key={c.name} style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:3, height:28, borderRadius:2, background:scoreColor(c.raw_score) }} />
                  <div>
                    <div style={{ fontSize:11, fontWeight:600, color:C.slate700 }}>{c.raw_score.toFixed(0)}/100</div>
                    <div style={{ fontSize:10, color:C.slate400 }}>{{ "Skill Match":"Skills","Experience Relevance":"Experience","Keyword Optimisation":"Keywords","Education Fit":"Education" }[c.name]}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Skill radar */}
        <div style={S.card}>
          <div style={S.cardPad}>
            <div style={S.cardHead}>
              <div>
                <div style={S.cardTitle}>Skill Distribution</div>
                <div style={S.cardSub}>By category</div>
              </div>
            </div>
            <SkillRadar byCategory={nlp.skills_by_category} />
            <div style={S.divider} />
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {Object.entries(nlp.skills_by_category).map(([cat, skills]) => (
                <div key={cat} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:C.slate500 }}>
                  <span style={S.dot(CAT_COLORS[cat])} />
                  {skills.length} {CAT_LABELS[cat]||cat}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom grid: Skill gap + Job matches + Suggestions */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1.2fr 1fr", gap:20, marginBottom:20 }}>
        {/* Skill gap */}
        <div style={S.card}>
          <div style={S.cardPad}>
            <div style={S.cardHead}>
              <div>
                <div style={S.cardTitle}>Skill Gap Analysis</div>
                <div style={S.cardSub}>vs top match</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:12, marginBottom:14 }}>
              {[["✓ Matched", ats.matched_skills.length, C.green, C.greenLight],
                ["− Missing", ats.missing_skills.length, C.red, C.redLight],
                ["+ Bonus", ats.bonus_skills.length, C.violet, C.violetDim]].map(([l,v,c,bg])=>(
                <div key={l} style={{ flex:1, textAlign:"center", padding:"8px 0", borderRadius:8, background:bg }}>
                  <div style={{ fontSize:18, fontWeight:700, color:c }}>{v}</div>
                  <div style={{ fontSize:10, color:c, fontWeight:500 }}>{l}</div>
                </div>
              ))}
            </div>
            <SkillGapChart matched={ats.matched_skills} missing={ats.missing_skills} bonus={ats.bonus_skills} />
            <div style={S.divider} />
            <div style={{ fontSize:12, fontWeight:600, color:C.slate600, marginBottom:8 }}>Missing keywords</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
              {ats.missing_keywords.map(k => <span key={k} style={{ ...S.chip("missing"), fontSize:10 }}>{k}</span>)}
            </div>
          </div>
        </div>

        {/* Job matches */}
        <div style={S.card}>
          <div style={S.cardPad}>
            <div style={S.cardHead}>
              <div>
                <div style={S.cardTitle}>Job Matches</div>
                <div style={S.cardSub}>Top {jobs.length} of {matches.total_jobs_searched} positions</div>
              </div>
            </div>
            <div style={{ maxHeight:440, overflowY:"auto", paddingRight:2 }}>
              {jobs.map(j => <JobMatchCard key={j.job_id} job={j} selected={selJob===j.job_id||(selJob===null&&j.rank===1)} onSelect={setSelJob} />)}
            </div>
          </div>
        </div>

        {/* Job detail + Suggestions */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {/* Selected job detail */}
          <div style={{ ...S.card, flex:"0 0 auto" }}>
            <div style={S.cardPad}>
              <div style={S.cardHead}>
                <div>
                  <div style={S.cardTitle}>{activeJob?.title}</div>
                  <div style={S.cardSub}>{activeJob?.company} · {activeJob?.location}</div>
                </div>
                <div style={{ ...S.badge(scoreColor(activeJob?.match_pct||0), scoreBg(activeJob?.match_pct||0)), fontSize:13, fontWeight:700 }}>
                  {activeJob?.match_pct.toFixed(0)}%
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
                {[["Skill",activeJob?.skill_score],["Semantic",activeJob?.semantic_score],["Experience",activeJob?.experience_score]].map(([l,v])=>(
                  <div key={l} style={{ background:C.slate50, borderRadius:8, padding:"8px 10px", textAlign:"center" }}>
                    <div style={{ fontSize:15, fontWeight:700, color:scoreColor(v||0) }}>{(v||0).toFixed(0)}</div>
                    <div style={{ fontSize:10, color:C.slate400 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                {activeJob?.reasons?.map((r,i) => <div key={i} style={{ fontSize:11, color:C.slate500, padding:"2px 0", width:"100%" }}>• {r}</div>)}
              </div>
            </div>
          </div>

          {/* Suggestions */}
          <div style={{ ...S.card, flex:1 }}>
            <div style={S.cardPad}>
              <div style={S.cardHead}>
                <div>
                  <div style={S.cardTitle}>Suggestions</div>
                  <div style={S.cardSub}>{ats.suggestions.length} improvements</div>
                </div>
              </div>
              {ats.suggestions.map((s,i) => (
                <div key={i} style={{ ...S.sugItem, ...(i===ats.suggestions.length-1?{borderBottom:"none"}:{}) }}>
                  <div style={{ ...S.sugNum, ...(i===0?{background:`${C.violet}20`,color:C.violet}:{}) }}>{i+1}</div>
                  <div style={{ ...S.sugText, ...(i===0?{color:C.slate800,fontWeight:500}:{}) }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Skills catalog */}
      <div style={S.card}>
        <div style={S.cardPad}>
          <div style={{ ...S.cardHead, marginBottom:20 }}>
            <div>
              <div style={S.cardTitle}>Extracted Skills</div>
              <div style={S.cardSub}>{nlp.skill_count} skills detected across {Object.keys(nlp.skills_by_category).length} categories</div>
            </div>
            <button style={S.btn("ghost")} onClick={onReset}>↑ Upload New Resume</button>
          </div>
          {CAT_ORDER.filter(c => nlp.skills_by_category[c]).map(cat => (
            <div key={cat} style={{ marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                <span style={S.dot(CAT_COLORS[cat])} />
                <span style={{ fontSize:11, fontWeight:600, color:C.slate600, letterSpacing:"0.05em", textTransform:"uppercase" }}>{CAT_LABELS[cat]}</span>
                <span style={{ fontSize:10, color:C.slate400 }}>{nlp.skills_by_category[cat].length}</span>
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {nlp.skills_by_category[cat].map(name => {
                  const sk = nlp.skills.find(s => s.name === name);
                  return (
                    <span key={name} style={S.skillTag(cat)}>
                      {name}{sk?.occurrences > 1 && <span style={{ opacity:.6, fontSize:10 }}>×{sk.occurrences}</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
const NAV = [
  { id:"dashboard", icon:"⊞", label:"Dashboard" },
  { id:"resumes", icon:"📄", label:"Resumes" },
  { id:"jobs", icon:"💼", label:"Job Board" },
  { id:"analytics", icon:"📊", label:"Analytics" },
];

export default function App() {
  const [nav, setNav] = useState("dashboard");
  const [result, setResult] = useState(null);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        html,body,#root { min-height:100vh; }
        @keyframes spin { to { transform:rotate(360deg) } }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:3px; }
        ::-webkit-scrollbar-thumb:hover { background:#cbd5e1; }
        button { font-family:inherit; }
      `}</style>

      <div style={S.shell}>
        {/* Sidebar */}
        <aside style={S.sidebar}>
          <div style={S.sideHead}>
            <div style={S.logo}>
              <div style={S.logoMark}>R</div>
              <div>
                <div style={S.logoText}>ResumeAI</div>
                <div style={S.logoSub}>Analytics Platform</div>
              </div>
            </div>
          </div>

          <div style={{ flex:1, overflowY:"auto" }}>
            <div style={S.navSection}>
              <div style={S.navLabel}>Main</div>
              {NAV.map(n => (
                <div key={n.id} style={S.navItem(nav===n.id)} onClick={() => setNav(n.id)}>
                  <span style={S.navIcon}>{n.icon}</span>
                  {n.label}
                </div>
              ))}
            </div>

            <div style={S.navSection}>
              <div style={S.navLabel}>Account</div>
              {[{id:"settings",icon:"⚙",label:"Settings"},{id:"help",icon:"?",label:"Help & Docs"}].map(n => (
                <div key={n.id} style={S.navItem(false)} onClick={()=>{}}>
                  <span style={S.navIcon}>{n.icon}</span>
                  {n.label}
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding:"16px", borderTop:`1px solid ${C.slate100}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={S.avatar}>A</div>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:C.slate700 }}>Alice Zhang</div>
                <div style={{ fontSize:11, color:C.slate400 }}>alice@example.com</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Content */}
        <div style={S.content}>
          <header style={S.topbar}>
            <div style={S.topbarTitle}>
              {{ dashboard:"Dashboard", resumes:"My Resumes", jobs:"Job Board", analytics:"Analytics" }[nav]}
            </div>
            <div style={S.topbarRight}>
              {result && (
                <span style={S.badge(scoreColor(result.analysis.ats_score.ats_score), scoreBg(result.analysis.ats_score.ats_score))}>
                  ATS: {result.analysis.ats_score.ats_score.toFixed(0)} · Grade {result.analysis.ats_score.grade}
                </span>
              )}
              <div style={S.avatar}>A</div>
            </div>
          </header>

          <main style={S.main}>
            <div style={S.pageHeader}>
              <div style={S.pageTitle}>
                {result ? "Resume Analysis" : "Upload Resume"}
              </div>
              <div style={S.pageSub}>
                {result
                  ? `${result.upload.filename} · ${result.upload.word_count.toLocaleString()} words · ${result.matches.total_jobs_searched} jobs scanned`
                  : "Upload your resume to get instant ATS scoring, skill gap analysis, and job matching"}
              </div>
            </div>

            {result
              ? <Dashboard data={result} onReset={() => setResult(null)} />
              : <UploadPanel onResult={setResult} />}
          </main>
        </div>
      </div>
    </>
  );
}
