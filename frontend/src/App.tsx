import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  buildSectionHeatmap,
  buildRecruiterInsights,
  computeCustomJdMatch,
  HEATMAP_COLORS,
  type HeatmapSection,
} from "./insights";
import { motion, AnimatePresence } from "framer-motion";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  Cell, RadialBarChart, RadialBar
} from "recharts";
import {
  UploadCloud, CheckCircle2, AlertTriangle, FileText, Sparkles,
  Clock, Award, Search, Settings, Briefcase, BarChart3,
  ChevronDown, ChevronUp, Moon, Sun, RefreshCw, User,
  Plus, Minus, BookOpen, Building2, MapPin, DollarSign,
  Activity, GraduationCap, ArrowRight, Database, Code2, Globe, Cpu,
  Sparkle, Check, AlertCircle, FileSpreadsheet, Send
} from "lucide-react";

// API endpoints connection config
const API = import.meta.env.VITE_API_URL || "/api/v1";

// TypeScript Interfaces
interface Skill {
  name: string;
  category: string;
  occurrences: number;
}

interface Education {
  degree: string;
  field?: string;
  institution?: string;
  year?: number;
}

interface Experience {
  title: string;
  company?: string;
  start_year?: number;
  end_year?: number;
  years?: number;
}

interface AtsComponent {
  name: string;
  raw_score: number;
  weight: number;
  weighted: number;
  detail?: string;
}

interface AtsScore {
  ats_score: number;
  grade: string;
  components: AtsComponent[];
  matched_skills: string[];
  missing_skills: string[];
  bonus_skills: string[];
  matched_keywords: string[];
  missing_keywords: string[];
  suggestions: string[];
  experience_gap: number;
  education_met: boolean;
}

interface JobMatch {
  rank: number;
  job_id: string;
  title: string;
  company: string;
  location?: string;
  job_type?: string;
  salary_range?: string;
  match_pct: number;
  skill_score: number;
  semantic_score: number;
  experience_score: number;
  matched_skills: string[];
  missing_skills: string[];
  bonus_skills: string[];
  reasons: string[];
  experience_required: number;
}

interface AnalysisData {
  resume_id: string;
  analysis: {
    skill_count: number;
    total_experience_years: number;
    skills: Skill[];
    skills_by_category: Record<string, string[]>;
    education: Education[];
    experience: Experience[];
  };
  ats_score: AtsScore;
  top_match?: {
    rank: number;
    title: string;
    company: string;
    match_pct: number;
  };
}

interface MatchData {
  resume_id: string;
  total_jobs_searched: number;
  matches: JobMatch[];
}

interface FullData {
  upload: {
    resume_id: string;
    filename: string;
    file_type: string;
    word_count: number;
  };
  analysis: AnalysisData;
  matches: MatchData;
}

// ── Mock data for demo/preview mode ──────────────────────────────────────────
const DEMO_DATA: FullData = {
  upload: { resume_id: "demo-001", filename: "alex_mercer_resume.pdf", file_type: "pdf", word_count: 512 },
  analysis: {
    resume_id: "demo-001",
    analysis: {
      skill_count: 22,
      total_experience_years: 5,
      skills: [
        { name: "Python", category: "languages", occurrences: 4 },
        { name: "TypeScript", category: "languages", occurrences: 3 },
        { name: "Rust", category: "languages", occurrences: 1 },
        { name: "React", category: "web_frameworks", occurrences: 3 },
        { name: "FastAPI", category: "web_frameworks", occurrences: 2 },
        { name: "Next.js", category: "web_frameworks", occurrences: 2 },
        { name: "PostgreSQL", category: "databases", occurrences: 3 },
        { name: "Redis", category: "databases", occurrences: 2 },
        { name: "Elasticsearch", category: "databases", occurrences: 1 },
        { name: "AWS", category: "cloud_devops", occurrences: 3 },
        { name: "Docker", category: "cloud_devops", occurrences: 3 },
        { name: "Kubernetes", category: "cloud_devops", occurrences: 1 },
        { name: "Terraform", category: "cloud_devops", occurrences: 1 },
        { name: "PyTorch", category: "data_ml", occurrences: 1 },
        { name: "Pandas", category: "data_ml", occurrences: 2 },
        { name: "Git", category: "tools_practices", occurrences: 3 },
        { name: "REST APIs", category: "tools_practices", occurrences: 2 },
        { name: "CI/CD", category: "tools_practices", occurrences: 2 },
        { name: "Agile", category: "tools_practices", occurrences: 1 },
        { name: "System Design", category: "soft_skills", occurrences: 2 },
        { name: "Mentorship", category: "soft_skills", occurrences: 1 },
        { name: "Problem Solving", category: "soft_skills", occurrences: 2 }
      ],
      skills_by_category: {
        languages: ["Python", "TypeScript", "Rust"],
        web_frameworks: ["React", "FastAPI", "Next.js"],
        databases: ["PostgreSQL", "Redis", "Elasticsearch"],
        cloud_devops: ["AWS", "Docker", "Kubernetes", "Terraform"],
        data_ml: ["PyTorch", "Pandas"],
        tools_practices: ["Git", "REST APIs", "CI/CD", "Agile"],
        soft_skills: ["System Design", "Mentorship", "Problem Solving"]
      },
      education: [
        { degree: "Bachelor of Science", field: "Computer Science", institution: "UC Berkeley", year: 2021 }
      ],
      experience: [
        { title: "Software Engineer II", company: "Stripe", start_year: 2023, end_year: undefined, years: 3 },
        { title: "Software Engineer", company: "Acme Corp", start_year: 2021, end_year: 2023, years: 2 }
      ]
    },
    ats_score: {
      ats_score: 83.5,
      grade: "A",
      components: [
        { name: "Skill Match", raw_score: 89.0, weight: 0.40, weighted: 35.6, detail: "18/22 matching key job-description skills" },
        { name: "Experience Relevance", raw_score: 80.0, weight: 0.25, weighted: 20.0, detail: "5.0 yrs meets 6-yr senior requirement" },
        { name: "Keyword Optimisation", raw_score: 75.0, weight: 0.20, weighted: 15.0, detail: "15/20 highly targeted keywords present" },
        { name: "Education Fit", raw_score: 100.0, weight: 0.15, weighted: 15.0, detail: "B.S. degree matches requirement" }
      ],
      matched_skills: ["Python", "TypeScript", "React", "FastAPI", "PostgreSQL", "Redis", "AWS", "Docker", "Git", "REST APIs", "CI/CD"],
      missing_skills: ["GraphQL"],
      bonus_skills: ["Kubernetes", "Terraform", "Rust"],
      matched_keywords: ["payment", "apis", "fastapi", "scalable systems", "docker", "aws"],
      missing_keywords: ["high-throughput", "oauth2", "microservices"],
      suggestions: [
        "Excellent resume score! Focus on optimizing metrics in your job descriptions.",
        "Add missing critical skill: 'GraphQL' to your skills segment to increase alignment.",
        "Highlight 'high-throughput' or 'microservices' context in your recent role accomplishments.",
        "Include quantitative statistics for your accomplishments (e.g., 'reduced latency by 25%')."
      ],
      experience_gap: 1.0,
      education_met: true
    },
    top_match: { rank: 1, title: "Senior Full Stack Engineer", company: "Stripe", match_pct: 85.5 }
  },
  matches: {
    resume_id: "demo-001",
    total_jobs_searched: 12,
    matches: [
      { rank: 1, job_id: "JOB001", title: "Senior Full Stack Engineer", company: "Stripe", location: "San Francisco / Remote", job_type: "Full-time", salary_range: "$160k–$210k", match_pct: 85.5, skill_score: 89.0, semantic_score: 82.0, experience_score: 80.0, matched_skills: ["Python", "TypeScript", "React", "FastAPI", "AWS", "Docker", "Git"], missing_skills: ["GraphQL"], bonus_skills: ["Kubernetes", "Terraform"], reasons: ["Strong technical match with 89% skill overlap.", "Solid experience at reputable tech companies.", "Advanced database and cloud infrastructure experience matches Stripe's scale."], experience_required: 6 },
      { rank: 2, job_id: "JOB002", title: "Backend Engineer (Platform)", company: "Vercel", location: "Remote", job_type: "Full-time", salary_range: "$145k–$190k", match_pct: 78.2, skill_score: 81.0, semantic_score: 75.0, experience_score: 79.0, matched_skills: ["TypeScript", "Next.js", "Redis", "Docker", "Git", "CI/CD"], missing_skills: ["Serverless", "Edge Computing"], bonus_skills: ["Rust", "Terraform"], reasons: ["Good overlap with Next.js and frontend infrastructure.", "Platform-level tooling capabilities line up well.", "Missing serverless deployment-specific credentials."], experience_required: 4 },
      { rank: 3, job_id: "JOB003", title: "AI Full Stack Developer", company: "Linear", location: "Remote", job_type: "Full-time", salary_range: "$150k–$195k", match_pct: 72.4, skill_score: 74.0, semantic_score: 68.0, experience_score: 75.0, matched_skills: ["TypeScript", "React", "Next.js", "PostgreSQL", "Redis"], missing_skills: ["Electron", "Sync engines"], bonus_skills: ["Rust"], reasons: ["Solid framework alignment.", "Linear requires specialized synchronization/offline capabilities.", "Good fit for UI refinement with high fidelity."], experience_required: 5 },
      { rank: 4, job_id: "JOB004", title: "Machine Learning Platform Engineer", company: "Hugging Face", location: "Paris / Remote", job_type: "Full-time", salary_range: "$150k–$185k", match_pct: 63.8, skill_score: 61.0, semantic_score: 55.0, experience_score: 80.0, matched_skills: ["Python", "AWS", "Docker", "PyTorch", "Pandas"], missing_skills: ["MLflow", "CUDA", "Kubeflow"], bonus_skills: ["Rust"], reasons: ["Strong Python and basic ML packages background.", "Lacks specialized MLOps infrastructure scale experiences.", "Strong Docker/AWS orchestration proficiency."], experience_required: 4 }
    ]
  }
};

const labels: Record<string, string> = {
  idle: "Ready",
  uploading: "Uploading Resume...",
  analyzing: "Parsing & Extracting Text...",
  matching: "Calculating Job Alignment...",
  done: "Analysis Completed",
  error: "Failed to Process"
};

const getScoreColor = (v: number) => {
  if (v >= 80) return "#10b981"; // Emerald
  if (v >= 60) return "#f59e0b"; // Amber
  return "#ef4444"; // Red
};

const getScoreBgClass = (v: number) => {
  if (v >= 80) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (v >= 60) return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  return "bg-red-500/10 text-red-400 border-red-500/20";
};

const CAT_COLORS: Record<string, { badge: string; text: string; dot: string; border: string; bg: string }> = {
  languages: { badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20", text: "text-indigo-400", dot: "bg-indigo-400", border: "border-indigo-500/30", bg: "bg-indigo-500" },
  web_frameworks: { badge: "bg-pink-500/10 text-pink-400 border-pink-500/20", text: "text-pink-400", dot: "bg-pink-400", border: "border-pink-500/30", bg: "bg-pink-500" },
  databases: { badge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20", text: "text-cyan-400", dot: "bg-cyan-400", border: "border-cyan-500/30", bg: "bg-cyan-500" },
  cloud_devops: { badge: "bg-amber-500/10 text-amber-400 border-amber-500/20", text: "text-amber-400", dot: "bg-amber-400", border: "border-amber-500/30", bg: "bg-amber-500" },
  data_ml: { badge: "bg-red-500/10 text-red-400 border-red-500/20", text: "text-red-400", dot: "bg-red-400", border: "border-red-500/30", bg: "bg-red-500" },
  tools_practices: { badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", text: "text-emerald-400", dot: "bg-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500" },
  soft_skills: { badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20", text: "text-zinc-400", dot: "bg-zinc-400", border: "border-zinc-500/30", bg: "bg-zinc-500" },
};

const CAT_LABELS: Record<string, string> = {
  languages: "Languages",
  web_frameworks: "Frameworks",
  databases: "Databases",
  cloud_devops: "Cloud & DevOps",
  data_ml: "Data & ML",
  tools_practices: "Tools & Methods",
  soft_skills: "Soft Skills",
};

const CAT_ORDER = ["languages", "web_frameworks", "databases", "cloud_devops", "data_ml", "tools_practices", "soft_skills"];

export default function App() {
  // Application State
  const [stage, setStage] = useState<"idle" | "uploading" | "analyzing" | "matching" | "done" | "error">("idle");
  const [drag, setDrag] = useState(false);
  const [fname, setFname] = useState<string | null>(null);
  const [prog, setProg] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"skills" | "matches" | "suggestions" | "insights" | "heatmap">("skills");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [customJdText, setCustomJdText] = useState("");
  const [isDark, setIsDark] = useState(true);
  const [sidebarNav, setSidebarNav] = useState<"dashboard" | "history" | "settings">("dashboard");
  const [healthStatus, setHealthStatus] = useState<"online" | "offline">("online");

  // API Data
  const [uploadData, setUploadData] = useState<FullData["upload"] | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [matchesData, setMatchesData] = useState<MatchData | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync Dark/Light Mode
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  // Check backend health status on startup
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          setHealthStatus("online");
        } else {
          setHealthStatus("offline");
        }
      } catch (e) {
        setHealthStatus("offline");
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Execute Analysis Pipeline
  const runAnalysis = useCallback(async (file: File) => {
    setFname(file.name);
    setErr(null);
    setProg(5);
    setStage("uploading");
    setUploadData(null);
    setAnalysisData(null);
    setMatchesData(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const uploadRes = await fetch(`${API}/upload-resume`, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const data = await uploadRes.json();
        throw new Error(data.detail || "Upload failed. Please check the file format.");
      }
      const uploadJson = await uploadRes.json();
      setUploadData(uploadJson);
      setProg(30);

      setStage("analyzing");
      const analyzeRes = await fetch(`${API}/analyze?resume_id=${uploadJson.resume_id}`);
      if (!analyzeRes.ok) {
        const data = await analyzeRes.json();
        throw new Error(data.detail || "Analysis failed. Failed to parse resume text.");
      }
      const analyzeJson = await analyzeRes.json();
      setAnalysisData(analyzeJson);
      setProg(65);

      setStage("matching");
      const matchRes = await fetch(`${API}/match-jobs?resume_id=${uploadJson.resume_id}&top_n=5`);
      if (!matchRes.ok) {
        const data = await matchRes.json();
        throw new Error(data.detail || "Job matching failed.");
      }
      const matchJson = await matchRes.json();
      setMatchesData(matchJson);
      setProg(100);
      setStage("done");
    } catch (e: any) {
      setErr(e.message || "An unexpected error occurred during processing.");
      setStage("error");
      setProg(0);
    }
  }, []);

  // Handle Drag & Drop / File Select
  const handleFiles = useCallback((files: FileList) => {
    const file = files[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "docx") {
      setErr("Invalid file type. Only PDF and DOCX files are supported.");
      setStage("error");
      return;
    }
    runAnalysis(file);
  }, [runAnalysis]);

  // Load Demo Data for presentation
  const handleLoadDemo = () => {
    setStage("uploading");
    setProg(10);
    setTimeout(() => {
      setProg(45);
      setStage("analyzing");
      setTimeout(() => {
        setProg(80);
        setStage("matching");
        setTimeout(() => {
          setProg(100);
          setFname(DEMO_DATA.upload.filename);
          setUploadData(DEMO_DATA.upload);
          setAnalysisData(DEMO_DATA.analysis);
          setMatchesData(DEMO_DATA.matches);
          setStage("done");
        }, 500);
      }, 600);
    }, 400);
  };

  // Reset Application State
  const handleReset = () => {
    setStage("idle");
    setProg(0);
    setFname(null);
    setErr(null);
    setUploadData(null);
    setAnalysisData(null);
    setMatchesData(null);
    setSelectedJobId(null);
    setCustomJdText("");
  };

  // Derived Variables
  const currentResult: FullData | null = uploadData && analysisData && matchesData ? {
    upload: uploadData,
    analysis: analysisData,
    matches: matchesData
  } : null;

  const ats = currentResult?.analysis.ats_score;
  const nlp = currentResult?.analysis.analysis;
  const jobs = currentResult?.matches.matches || [];
  const activeJob = jobs.find(j => j.job_id === selectedJobId) || jobs[0];

  const sectionHeatmap: HeatmapSection[] = useMemo(() => {
    if (!ats || !nlp || !currentResult) return [];
    return buildSectionHeatmap(ats, nlp, currentResult.upload.word_count);
  }, [ats, nlp, currentResult]);

  const recruiterInsights = useMemo(() => {
    if (!ats || !nlp || !currentResult) return null;
    return buildRecruiterInsights(ats, nlp, currentResult.upload.word_count);
  }, [ats, nlp, currentResult]);

  const customJdMatch = useMemo(() => {
    if (!customJdText.trim() || !nlp || !ats) return null;
    const skills = nlp.skills.map((s) => s.name);
    const keywords = [...ats.matched_keywords, ...ats.missing_keywords];
    return computeCustomJdMatch(customJdText, skills, keywords);
  }, [customJdText, nlp, ats]);

  const stageProgressSteps = [
    { label: "Uploading", threshold: 5, active: stage === "uploading" || stage === "analyzing" || stage === "matching" || stage === "done" },
    { label: "Parsing Resume", threshold: 30, active: stage === "analyzing" || stage === "matching" || stage === "done" },
    { label: "ATS Calculation", threshold: 65, active: stage === "matching" || stage === "done" },
    { label: "Predicting Matches", threshold: 100, active: stage === "done" }
  ];

  return (
    <div className={`min-h-screen relative overflow-x-hidden font-sans transition-colors duration-300 ${
      isDark ? "bg-[#030303] text-zinc-100 dark" : "bg-[#f8f9fa] text-zinc-800"
    }`}>
      
      {/* Dynamic Animated Ambient Glow Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            x: [0, 40, 0],
            y: [0, -30, 0]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-200px] left-[10%] w-[500px] h-[500px] rounded-full bg-indigo-500/10 blur-[120px]"
        />
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            x: [0, -60, 0],
            y: [0, 50, 0]
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[-100px] right-[5%] w-[600px] h-[600px] rounded-full bg-purple-500/10 blur-[130px]"
        />
        <div className="absolute top-[30%] left-[50%] -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-blue-500/5 blur-[100px]" />
      </div>

      {/* Main Structural Frame */}
      <div className="relative flex min-h-screen z-10">
        
        {/* Left Navigation Sidebar */}
        <aside className={`w-[260px] flex-shrink-0 border-r ${
          isDark ? "bg-black/40 border-zinc-800/80 backdrop-blur-xl" : "bg-white/70 border-zinc-200/80 backdrop-blur-xl"
        } flex flex-col justify-between hidden lg:flex`}>
          <div>
            {/* Sidebar Logo Header */}
            <div className={`p-6 border-b ${isDark ? "border-zinc-800/80" : "border-zinc-100"}`}>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute -inset-1 rounded-xl bg-gradient-to-tr from-brand-600 to-violet-500 opacity-70 blur-sm animate-pulse-slow" />
                  <div className="relative w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-400 flex items-center justify-center text-white font-black text-xl shadow-lg">
                    R
                  </div>
                </div>
                <div>
                  <h1 className={`text-sm font-extrabold tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
                    RECRUIT.AI
                  </h1>
                  <span className="text-[9px] text-brand-400 font-mono tracking-widest uppercase block">
                    Enterprise SaaS
                  </span>
                </div>
              </div>
            </div>

            {/* Sidebar Menu items */}
            <nav className="p-4 space-y-6">
              <div>
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase px-3 mb-3 font-mono">
                  ATS Workspace
                </div>
                <div className="space-y-1">
                  <button
                    onClick={() => setSidebarNav("dashboard")}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                      sidebarNav === "dashboard"
                        ? isDark ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 shadow-sm" : "bg-indigo-50 text-indigo-700 border border-indigo-100/60 shadow-sm"
                        : isDark ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 border border-transparent" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <BarChart3 className="w-4 h-4" />
                      <span>Screener Dashboard</span>
                    </div>
                    {currentResult && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    )}
                  </button>

                  <button
                    onClick={() => setSidebarNav("history")}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                      sidebarNav === "history"
                        ? isDark ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/25" : "bg-indigo-50 text-indigo-700 border border-indigo-100/60"
                        : isDark ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 border border-transparent" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border border-transparent"
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    <span>Scanned Pipelines</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase px-3 mb-3 font-mono">
                  Platform Setup
                </div>
                <div className="space-y-1">
                  <button
                    onClick={() => setSidebarNav("settings")}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                      sidebarNav === "settings"
                        ? isDark ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/25" : "bg-indigo-50 text-indigo-700 border border-indigo-100/60"
                        : isDark ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 border border-transparent" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border border-transparent"
                    }`}
                  >
                    <Settings className="w-4 h-4" />
                    <span>Weight Parameters</span>
                  </button>
                </div>
              </div>
            </nav>
          </div>

          {/* Recruiter active profile card */}
          <div className={`p-4 border-t ${isDark ? "border-zinc-800/80" : "border-zinc-200"}`}>
            <div className={`p-3 rounded-2xl border flex items-center gap-3 ${
              isDark ? "bg-zinc-900/30 border-zinc-800/60" : "bg-zinc-50 border-zinc-100"
            }`}>
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                  A
                </div>
                <span className="absolute bottom-[-2px] right-[-2px] w-3 h-3 rounded-full bg-emerald-500 border-2 border-dark-surface" />
              </div>
              <div className="truncate">
                <div className={`text-xs font-bold truncate ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                  Alex Mercer
                </div>
                <div className="text-[10px] text-zinc-500 truncate font-mono">
                  Lead Talent Scout
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Core View Controller Wrapper */}
        <div className="flex-1 flex flex-col min-w-0">
          
          {/* Main Top Header Navbar */}
          <header className={`h-16 flex items-center justify-between px-6 border-b sticky top-0 backdrop-blur-xl z-40 ${
            isDark ? "bg-black/35 border-zinc-800/80" : "bg-white/60 border-zinc-200/80"
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex lg:hidden items-center justify-center text-white font-extrabold text-sm shadow-md shadow-indigo-500/20">R</div>
              <span className={`text-[10px] font-mono tracking-wider font-semibold uppercase ${
                isDark ? "bg-zinc-900 border-zinc-800 text-indigo-400" : "bg-zinc-100 border-zinc-200 text-zinc-600"
              } border px-3 py-1 rounded-lg`}>
                SYSTEM NODE: ACTIVE
              </span>
            </div>

            <div className="flex items-center gap-4">
              {/* API Connection pulses */}
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${
                isDark ? "bg-zinc-900/50 border-zinc-800/80" : "bg-zinc-50 border-zinc-200/50"
              }`}>
                <span className="relative flex h-2 w-2">
                  {healthStatus === "online" && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${healthStatus === "online" ? "bg-emerald-500" : "bg-red-500"}`}></span>
                </span>
                <span className="text-[10px] font-mono font-bold text-zinc-500">
                  {healthStatus === "online" ? "GATEWAY_UP" : "GATEWAY_DOWN"}
                </span>
              </div>

              {/* Theme toggles */}
              <button
                onClick={() => setIsDark(!isDark)}
                className={`p-2 rounded-xl border transition-all duration-200 ${
                  isDark
                    ? "bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                    : "bg-white border-zinc-200 text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100"
                }`}
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </header>

          {/* Scrollable View Area */}
          <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
            
            {/* View router for historical list / configuration mock page */}
            {sidebarNav !== "dashboard" ? (
              <div className="max-w-2xl mx-auto py-16">
                <div className={`p-10 rounded-3xl border text-center ${
                  isDark ? "bg-zinc-900/30 border-zinc-800/80 backdrop-blur-xl" : "bg-white border-zinc-200 backdrop-blur-xl"
                } shadow-2xl`}>
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-6">
                    <Activity className="w-7 h-7 text-indigo-400 animate-pulse" />
                  </div>
                  <h3 className={`text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
                    {sidebarNav === "history" ? "Candidate Pipelines Log" : "Algorithm Settings"}
                  </h3>
                  <p className="text-sm text-zinc-500 mt-3 max-w-md mx-auto leading-relaxed">
                    {sidebarNav === "history"
                      ? "Track, filter, and rank historical resumes processed across your enterprise portal database."
                      : "Adjust semantic weights, required keyword thresholds, and education weighting rules."}
                  </p>
                  <button
                    onClick={() => setSidebarNav("dashboard")}
                    className="mt-8 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all duration-200"
                  >
                    Go back to Dashboard
                  </button>
                </div>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                
                {/* VIEW: UPLOAD & HERO LANDING (No resume selected yet) */}
                {stage !== "done" ? (
                  <motion.div
                    key="upload-landing"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.4 }}
                    className="max-w-4xl mx-auto py-8 space-y-12"
                  >
                    
                    {/* SaaS Premium Hero Header */}
                    <div className="text-center space-y-4 max-w-2xl mx-auto">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold font-mono tracking-wider bg-brand-500/10 text-brand-400 border border-brand-500/20 shadow-md">
                        <Sparkle className="w-3.5 h-3.5 animate-spin" />
                        <span>NEXT-GENERATION AI RECRUITING CO-PILOT</span>
                      </div>
                      
                      <h2 className={`text-4xl md:text-5xl font-black tracking-tight leading-[1.15] bg-clip-text text-transparent bg-gradient-to-b ${
                        isDark ? "from-white to-zinc-400" : "from-zinc-950 to-zinc-600"
                      }`}>
                        Sift candidates with deep semantic intelligence.
                      </h2>
                      
                      <p className="text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">
                        Say goodbye to simple word-matching. Parse complex engineering resumes, spot talent gaps, and rank roles instantly.
                      </p>
                    </div>

                    {/* Interactive Dropzone & Upload Block */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch">
                      
                      {/* Left: Dropzone File upload box */}
                      <div className="md:col-span-7 flex">
                        <div className={`w-full p-8 rounded-3xl border flex flex-col justify-between ${
                          isDark ? "bg-zinc-900/40 border-zinc-800/80 backdrop-blur-xl shadow-2xl" : "bg-white border-zinc-200/80 shadow-xl"
                        } transition-all duration-300 relative overflow-hidden`}>
                          
                          {stage === "idle" || stage === "error" ? (
                            <div className="space-y-6 flex flex-col justify-between h-full">
                              <div
                                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                                onDragLeave={() => setDrag(false)}
                                onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col justify-center items-center text-center cursor-pointer transition-all duration-300 min-h-[220px] ${
                                  drag
                                    ? isDark ? "border-brand-500 bg-brand-500/5 shadow-[0_0_30px_rgba(99,102,241,0.1)]" : "border-brand-500 bg-brand-50"
                                    : isDark ? "border-zinc-800 hover:border-zinc-700 bg-zinc-950/45" : "border-zinc-200 hover:border-zinc-300 bg-zinc-50/50"
                                }`}
                              >
                                <input
                                  type="file"
                                  ref={fileInputRef}
                                  accept=".pdf,.docx"
                                  className="hidden"
                                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                                />
                                
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300 ${
                                  drag ? "scale-110 bg-brand-500 text-white shadow-lg" : "bg-zinc-900 text-zinc-400 border border-zinc-800"
                                }`}>
                                  <UploadCloud className="w-6 h-6" />
                                </div>
                                <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                                  Upload candidate resume
                                </h3>
                                <p className="text-xs text-zinc-500 mt-1.5 max-w-[200px] leading-relaxed">
                                  Drag PDF or DOCX file here or click to browse.
                                </p>
                              </div>

                              <div className="space-y-4">
                                <div className="relative flex py-2 items-center">
                                  <div className={`flex-grow border-t ${isDark ? "border-zinc-800" : "border-zinc-200"}`} />
                                  <span className="flex-shrink mx-4 text-[9px] text-zinc-500 font-bold uppercase tracking-widest font-mono">Developer Playground</span>
                                  <div className={`flex-grow border-t ${isDark ? "border-zinc-800" : "border-zinc-200"}`} />
                                </div>
                                
                                <button
                                  onClick={handleLoadDemo}
                                  className={`w-full py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all duration-200 shadow-md ${
                                    isDark
                                      ? "bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-indigo-500/20 shadow-indigo-950/20"
                                      : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-100 shadow-indigo-100/10"
                                  }`}
                                >
                                  <Sparkles className="w-4 h-4 text-indigo-500" />
                                  <span>Simulate Sandbox Pipeline (Demo)</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            // Loader workflow
                            <div className="space-y-6 py-4 flex flex-col justify-between h-full">
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h3 className={`text-sm font-extrabold ${isDark ? "text-white" : "text-zinc-900"}`}>
                                    {labels[stage]}
                                  </h3>
                                  <span className="text-xs font-mono font-bold text-brand-400">{prog}%</span>
                                </div>
                                
                                {/* Progress slider */}
                                <div className={`h-1.5 w-full rounded-full overflow-hidden ${isDark ? "bg-zinc-800/80" : "bg-zinc-100"}`}>
                                  <div
                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                                    style={{ width: `${prog}%` }}
                                  />
                                </div>
                              </div>

                              {/* Stages checkboxes */}
                              <div className="space-y-3">
                                {stageProgressSteps.map((step, idx) => (
                                  <div key={step.label} className="flex items-center gap-3">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all ${
                                      step.active
                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                        : isDark ? "bg-zinc-900 border-zinc-800 text-zinc-500" : "bg-zinc-100 border-zinc-200 text-zinc-400"
                                    }`}>
                                      {step.active ? <Check className="w-3 h-3" /> : (idx + 1)}
                                    </div>
                                    <span className={`text-xs font-semibold ${
                                      step.active
                                        ? isDark ? "text-zinc-200" : "text-zinc-800"
                                        : "text-zinc-500"
                                    }`}>
                                      {step.label}
                                    </span>
                                  </div>
                                ))}
                              </div>

                              {/* Skeletons block */}
                              <div className="space-y-2 border-t border-zinc-800/60 pt-4 animate-pulse">
                                <div className={`h-3 rounded w-3/4 ${isDark ? "bg-zinc-800/50" : "bg-zinc-100"}`} />
                                <div className={`h-3 rounded w-1/2 ${isDark ? "bg-zinc-800/50" : "bg-zinc-100"}`} />
                              </div>
                            </div>
                          )}

                          {/* Error notifications */}
                          {err && (
                            <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-3 text-red-400">
                              <AlertCircle className="w-5 h-5 flex-shrink-0" />
                              <div className="text-xs">
                                <span className="font-bold block">Fatal analysis error</span>
                                {err}
                              </div>
                            </div>
                          )}

                        </div>
                      </div>

                      {/* Right: Quick stats highlights side cards */}
                      <div className="md:col-span-5 flex flex-col justify-between gap-6">
                        {[
                          { title: "Deep Semantic Scanning", desc: "Checks technical concepts beyond exact spelling overlaps.", tag: "ATS v2.0", bg: "from-indigo-600/10 to-indigo-500/5", icon: <Database className="w-5 h-5 text-indigo-400" /> },
                          { title: "Smart Skill Categorization", desc: "Sorts skills automatically into languages, databases, or soft skills.", tag: "NLP Engine", bg: "from-purple-600/10 to-purple-500/5", icon: <Code2 className="w-5 h-5 text-purple-400" /> },
                          { title: "Ranked Hiring Matches", desc: "Compares experience and certifications against active positions.", tag: "Score Engine", bg: "from-emerald-600/10 to-emerald-500/5", icon: <Cpu className="w-5 h-5 text-emerald-400" /> }
                        ].map((card) => (
                          <div key={card.title} className={`p-6 rounded-3xl border flex-1 flex flex-col justify-between ${
                            isDark ? "bg-zinc-950/40 border-zinc-800/80 backdrop-blur-xl" : "bg-white border-zinc-200/80"
                          } hover:border-zinc-700/50 transition-all duration-200`}>
                            <div className="flex items-start justify-between">
                              <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                                {card.icon}
                              </div>
                              <span className="text-[9px] font-bold font-mono tracking-widest text-zinc-500 uppercase">
                                {card.tag}
                              </span>
                            </div>
                            <div className="mt-4">
                              <h4 className={`text-xs font-extrabold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                                {card.title}
                              </h4>
                              <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                                {card.desc}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>

                    </div>

                  </motion.div>
                ) : (
                  
                  // VIEW: PREMIUM COMPREHENSIVE DASHBOARD
                  <motion.div
                    key="dashboard-view"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.4 }}
                    className="max-w-[1400px] mx-auto space-y-8"
                  >
                    
                    {/* Header bar */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className={`text-2xl font-black tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
                            Recruiter Co-Pilot Screen
                          </h2>
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase ${
                            isDark ? "bg-zinc-900 text-indigo-400 border border-zinc-800" : "bg-indigo-50 text-indigo-700 border border-indigo-100"
                          }`}>
                            ACTIVE PROFILE
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">
                          File: <span className="font-mono font-semibold text-zinc-400">{fname}</span> &bull; {currentResult?.upload.word_count.toLocaleString()} words parsed.
                        </p>
                      </div>
                      
                      <button
                        onClick={handleReset}
                        className={`py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all duration-200 ${
                          isDark
                            ? "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850 hover:text-white"
                            : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
                        }`}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Screener New Candidate</span>
                      </button>
                    </div>

                    {/* Stats Metrics Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                      {[
                        { label: "ats scoring profile", val: ats?.ats_score.toFixed(0), icon: <Award className="w-5 h-5" />, color: getScoreColor(ats?.ats_score || 0), sub: `Grade ${ats?.grade}`, bg: getScoreBgClass(ats?.ats_score || 0), spark: [40, 50, 45, 60, 55, 75, 83.5] },
                        { label: "capabilities mapped", val: nlp?.skill_count, icon: <Activity className="w-5 h-5" />, color: "#6366f1", sub: `Across ${nlp?.skills_by_category ? Object.keys(nlp.skills_by_category).length : 0} domains`, bg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20", spark: [10, 15, 12, 18, 16, 20, 22] },
                        { label: "top role compatibility", val: jobs[0] ? `${jobs[0].match_pct.toFixed(0)}%` : "N/A", icon: <Briefcase className="w-5 h-5" />, color: "#10b981", sub: jobs[0] ? jobs[0].company : "N/A", bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", spark: [60, 65, 70, 68, 75, 82, 85.5] },
                        { label: "experience years", val: `${nlp?.total_experience_years} Years`, icon: <Clock className="w-5 h-5" />, color: "#f59e0b", sub: ats && ats.experience_gap > 0 ? `${ats.experience_gap}y gap vs top matches` : "Requirements met", bg: "bg-amber-500/10 text-amber-400 border-amber-500/20", spark: [2, 3, 3.5, 4, 4.2, 4.8, 5] }
                      ].map((met) => (
                        <div key={met.label} className={`p-6 rounded-3xl border relative overflow-hidden ${
                          isDark ? "bg-zinc-950/45 border-zinc-800/80 shadow-2xl backdrop-blur-xl" : "bg-white border-zinc-200/80 shadow-md"
                        }`}>
                          
                          {/* Sparkline overlay */}
                          <div className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none opacity-20">
                            <svg className="w-full h-full" viewBox="0 0 100 20" preserveAspectRatio="none">
                              <path
                                d={`M ${met.spark.map((v, i) => `${(i / (met.spark.length - 1)) * 100} ${20 - (v / 100) * 18}`).join(" L ")}`}
                                fill="none"
                                stroke={met.color}
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                          </div>

                          <div className="flex items-start justify-between relative z-10">
                            <div>
                              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block font-mono">
                                {met.label}
                              </span>
                              <span className="text-3xl font-extrabold tracking-tight mt-2 block" style={{ color: met.color }}>
                                {met.val}
                              </span>
                            </div>
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${met.bg}`}>
                              {met.icon}
                            </div>
                          </div>

                          <div className="mt-4 flex items-center gap-1.5 text-[11px] text-zinc-500 relative z-10">
                            <span className={`px-1.5 py-0.5 rounded font-bold text-[9px] ${met.bg}`}>
                              {met.sub}
                            </span>
                          </div>

                        </div>
                      ))}
                    </div>

                    {/* Dashboard Evaluation Visualizers Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                      
                      {/* Left: 4/12 width - Bespoke SVG ATS Evaluation Ring */}
                      <div className={`lg:col-span-4 p-6 rounded-3xl border flex flex-col justify-between ${
                        isDark ? "bg-zinc-950/45 border-zinc-800/80 backdrop-blur-xl shadow-2xl" : "bg-white border-zinc-200 shadow-md"
                      }`}>
                        <div>
                          <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>ATS Validation</h3>
                          <p className="text-[11px] text-zinc-500 mt-1">Aggregated scoring vs target candidate profiles.</p>
                        </div>

                        {/* Custom SVG gauge with gradients and glows */}
                        <div className="relative h-[220px] w-full flex items-center justify-center my-4">
                          <svg className="w-48 h-48 transform -rotate-90">
                            {/* Gradients definitions */}
                            <defs>
                              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#818cf8" />
                                <stop offset="100%" stopColor={getScoreColor(ats?.ats_score || 0)} />
                              </linearGradient>
                              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="6" result="blur" />
                                <feMerge>
                                  <feMergeNode in="blur" />
                                  <feMergeNode in="SourceGraphic" />
                                </feMerge>
                              </filter>
                            </defs>
                            
                            {/* Background track ring */}
                            <circle
                              cx="96"
                              cy="96"
                              r="76"
                              stroke={isDark ? "#1f1f23" : "#f1f5f9"}
                              strokeWidth="12"
                              fill="transparent"
                            />
                            
                            {/* Foreground indicator ring */}
                            <circle
                              cx="96"
                              cy="96"
                              r="76"
                              stroke="url(#ringGrad)"
                              strokeWidth="12"
                              fill="transparent"
                              strokeDasharray={2 * Math.PI * 76}
                              strokeDashoffset={2 * Math.PI * 76 - ((ats?.ats_score || 0) / 100) * (2 * Math.PI * 76)}
                              strokeLinecap="round"
                              filter="url(#glow)"
                            />
                          </svg>

                          {/* Center textual metrics */}
                          <div className="absolute text-center">
                            <span className={`text-5xl font-black tracking-tight ${isDark ? "text-white" : "text-zinc-950"}`}>
                              {ats?.ats_score.toFixed(0)}
                            </span>
                            <span className="text-[9px] text-zinc-500 block font-mono font-bold tracking-widest mt-1">ATS SCORE</span>
                            <div className="mt-3">
                              <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${getScoreBgClass(ats?.ats_score || 0)}`}>
                                Grade {ats?.grade}
                              </span>
                            </div>
                            {(ats?.ats_score ?? 100) < 70 && (
                              <button
                                type="button"
                                onClick={() => setActiveTab("suggestions")}
                                className="mt-4 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 font-mono uppercase tracking-wider"
                              >
                                View optimization tips →
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Ring summaries list */}
                        <div className={`grid grid-cols-3 gap-2 text-center p-3.5 rounded-2xl ${isDark ? "bg-zinc-900/35 border border-zinc-800/60" : "bg-zinc-50 border border-zinc-200/50"}`}>
                          <div>
                            <span className="text-emerald-400 font-extrabold block text-sm">{ats?.matched_skills.length}</span>
                            <span className="text-[9px] text-zinc-500 font-bold uppercase font-mono">Matched</span>
                          </div>
                          <div className={`border-r ${isDark ? "border-zinc-800" : "border-zinc-200"}`} />
                          <div>
                            <span className="text-red-400 font-extrabold block text-sm">{ats?.missing_skills.length}</span>
                            <span className="text-[9px] text-zinc-500 font-bold uppercase font-mono">Missing</span>
                          </div>
                          <div className={`border-r ${isDark ? "border-zinc-800" : "border-zinc-200"}`} />
                          <div>
                            <span className="text-indigo-400 font-extrabold block text-sm">{ats?.bonus_skills.length}</span>
                            <span className="text-[9px] text-zinc-500 font-bold uppercase font-mono">Bonus</span>
                          </div>
                        </div>
                      </div>

                      {/* Middle: 4/12 width - Components score chart */}
                      <div className={`lg:col-span-4 p-6 rounded-3xl border flex flex-col justify-between ${
                        isDark ? "bg-zinc-950/45 border-zinc-800/80 backdrop-blur-xl shadow-2xl" : "bg-white border-zinc-200 shadow-md"
                      }`}>
                        <div>
                          <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>Score Components</h3>
                          <p className="text-[11px] text-zinc-500 mt-1">Weighted assessment metrics across core zones.</p>
                        </div>

                        {/* Vertical Custom Component bars */}
                        <div className="space-y-4 my-6">
                          {ats?.components.map(c => {
                            const name = { "Skill Match": "Skills Match", "Experience Relevance": "Experience Fit", "Keyword Optimisation": "Keyword Density", "Education Fit": "Education Match" }[c.name] || c.name;
                            return (
                              <div key={c.name} className="space-y-1.5">
                                <div className="flex justify-between items-center text-xs">
                                  <span className={`font-semibold ${isDark ? "text-zinc-400" : "text-zinc-700"}`}>{name}</span>
                                  <span className="font-mono font-bold" style={{ color: getScoreColor(c.raw_score) }}>{c.raw_score.toFixed(0)}%</span>
                                </div>
                                <div className={`h-2 w-full rounded-full overflow-hidden ${isDark ? "bg-zinc-900/60" : "bg-zinc-100"}`}>
                                  <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{
                                      width: `${c.raw_score}%`,
                                      backgroundColor: getScoreColor(c.raw_score),
                                      boxShadow: `0 0 10px ${getScoreColor(c.raw_score)}50`
                                    }}
                                  />
                                </div>
                                {c.detail && (
                                  <p className="text-[10px] text-zinc-500 leading-relaxed mt-1 font-mono">
                                    {String(c.detail)}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Weighted components details */}
                        <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-500 pt-3 border-t border-zinc-800/50">
                          <div>
                            Skill Weight: <strong className="text-zinc-300">40%</strong>
                          </div>
                          <div>
                            Exp Weight: <strong className="text-zinc-300">25%</strong>
                          </div>
                          <div>
                            Keywords Weight: <strong className="text-zinc-300">20%</strong>
                          </div>
                          <div>
                            Education Weight: <strong className="text-zinc-300">15%</strong>
                          </div>
                        </div>
                      </div>

                      {/* Right: 4/12 width - Radar chart for skill domains */}
                      <div className={`lg:col-span-4 p-6 rounded-3xl border flex flex-col justify-between ${
                        isDark ? "bg-zinc-950/45 border-zinc-800/80 backdrop-blur-xl shadow-2xl" : "bg-white border-zinc-200 shadow-md"
                      }`}>
                        <div>
                          <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>Capability Spectrum</h3>
                          <p className="text-[11px] text-zinc-500 mt-1">Skills density mappings categorized across domains.</p>
                        </div>

                        {/* Recharts Radar chart */}
                        <div className="h-[210px] w-full flex items-center justify-center my-3 relative z-10">
                          {nlp && nlp.skills_by_category ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart cx="50%" cy="50%" outerRadius="65%" data={
                                Object.keys(nlp.skills_by_category).map(cat => ({
                                  subject: CAT_LABELS[cat] || cat,
                                  count: nlp.skills_by_category[cat].length,
                                }))
                              }>
                                <PolarGrid stroke={isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"} />
                                <PolarAngleAxis
                                  dataKey="subject"
                                  tick={{ fill: "#888888", fontSize: 9, fontWeight: 600 }}
                                />
                                <PolarRadiusAxis angle={30} domain={[0, 6]} tick={false} axisLine={false} />
                                <Radar
                                  name="Skills"
                                  dataKey="count"
                                  stroke="#6366f1"
                                  fill="#6366f1"
                                  fillOpacity={isDark ? 0.15 : 0.06}
                                  strokeWidth={2}
                                />
                              </RadarChart>
                            </ResponsiveContainer>
                          ) : (
                            <span className="text-zinc-500 text-xs">No capability mapping detected.</span>
                          )}
                        </div>

                        {/* Domains indicators */}
                        <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-3 border-t border-zinc-800/50">
                          {nlp && Object.entries(nlp.skills_by_category).map(([cat, sks]) => (
                            <div key={cat} className="flex items-center gap-1.5 text-[9px] text-zinc-400">
                              <span className={`w-1.5 h-1.5 rounded-full ${CAT_COLORS[cat]?.dot || "bg-zinc-400"}`} />
                              <span>{sks.length} {CAT_LABELS[cat] || cat}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>

                    {/* Phase 1: Custom JD, Heatmap, Recruiter Insights */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Custom Job Description */}
                      <div className={`p-6 rounded-3xl border flex flex-col ${
                        isDark ? "bg-zinc-950/45 border-zinc-800/80 backdrop-blur-xl shadow-2xl" : "bg-white border-zinc-200 shadow-md"
                      }`}>
                        <div className="flex items-center gap-2 mb-3">
                          <FileSpreadsheet className="w-4 h-4 text-indigo-400" />
                          <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>Custom Job Description</h3>
                        </div>
                        <p className="text-[11px] text-zinc-500 mb-3 leading-relaxed">
                          Paste a job posting to compare against this resume (client-side, no API change).
                        </p>
                        <textarea
                          value={customJdText}
                          onChange={(e) => setCustomJdText(e.target.value)}
                          placeholder="Paste job description here…"
                          rows={5}
                          className={`w-full rounded-xl border px-3 py-2.5 text-xs resize-y min-h-[100px] ${
                            isDark
                              ? "bg-zinc-900/60 border-zinc-800 text-zinc-200 placeholder:text-zinc-600"
                              : "bg-zinc-50 border-zinc-200 text-zinc-800 placeholder:text-zinc-400"
                          }`}
                        />
                        {customJdMatch ? (
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`mt-4 p-4 rounded-2xl border ${isDark ? "bg-zinc-900/40 border-zinc-800/60" : "bg-indigo-50/40 border-indigo-100"}`}
                          >
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-[10px] font-bold text-zinc-500 uppercase font-mono">JD Match</span>
                              <span className="text-xl font-black" style={{ color: getScoreColor(customJdMatch.match_pct) }}>
                                {customJdMatch.match_pct}%
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 leading-relaxed">{customJdMatch.summary}</p>
                            {customJdMatch.matched_skills.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {customJdMatch.matched_skills.slice(0, 6).map((s) => (
                                  <span key={s} className="px-2 py-0.5 rounded-lg text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{s}</span>
                                ))}
                              </div>
                            )}
                            {customJdMatch.missing_keywords.length > 0 && (
                              <p className="text-[10px] text-zinc-500 mt-2 font-mono">
                                Gaps: {customJdMatch.missing_keywords.slice(0, 5).join(", ")}
                              </p>
                            )}
                          </motion.div>
                        ) : (
                          <p className="text-[10px] text-zinc-600 mt-3 font-mono">Paste text to see match %</p>
                        )}
                      </div>

                      {/* Resume Heatmap */}
                      <div className={`p-6 rounded-3xl border ${
                        isDark ? "bg-zinc-950/45 border-zinc-800/80 backdrop-blur-xl shadow-2xl" : "bg-white border-zinc-200 shadow-md"
                      }`}>
                        <div className="flex items-center gap-2 mb-4">
                          <Activity className="w-4 h-4 text-amber-400" />
                          <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>Resume Heatmap</h3>
                        </div>
                        <div className="space-y-3">
                          {sectionHeatmap.map((sec) => (
                            <div key={sec.id} className={`p-3 rounded-xl border ${
                              isDark ? "bg-zinc-900/35 border-zinc-800/50" : "bg-zinc-50 border-zinc-200/50"
                            }`}>
                              <div className="flex justify-between items-center mb-1.5">
                                <span className="text-xs font-semibold text-zinc-400">{sec.label}</span>
                                <span
                                  className="text-[9px] font-bold uppercase font-mono px-2 py-0.5 rounded"
                                  style={{
                                    color: HEATMAP_COLORS[sec.status],
                                    backgroundColor: `${HEATMAP_COLORS[sec.status]}18`,
                                  }}
                                >
                                  {sec.status}
                                </span>
                              </div>
                              <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-zinc-200"}`}>
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${sec.score}%` }}
                                  transition={{ duration: 0.7, ease: "easeOut" }}
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: HEATMAP_COLORS[sec.status] }}
                                />
                              </div>
                              <p className="text-[10px] text-zinc-500 mt-1.5 font-mono">{sec.summary}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Recruiter Insights */}
                      <div className={`p-6 rounded-3xl border ${
                        isDark ? "bg-zinc-950/45 border-zinc-800/80 backdrop-blur-xl shadow-2xl" : "bg-white border-zinc-200 shadow-md"
                      }`}>
                        <div className="flex items-center gap-2 mb-4">
                          <User className="w-4 h-4 text-purple-400" />
                          <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>Recruiter Insights</h3>
                        </div>
                        {recruiterInsights && (
                          <div className="space-y-4">
                            <div>
                              <span className="text-[9px] font-bold text-emerald-500 uppercase font-mono tracking-widest">Strengths</span>
                              <ul className="mt-2 space-y-1.5">
                                {recruiterInsights.strengths.map((s, i) => (
                                  <li key={i} className="text-[11px] text-zinc-400 flex gap-2 leading-relaxed">
                                    <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                    {s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-amber-500 uppercase font-mono tracking-widest">Weaknesses</span>
                              <ul className="mt-2 space-y-1.5">
                                {recruiterInsights.weaknesses.map((s, i) => (
                                  <li key={i} className="text-[11px] text-zinc-400 flex gap-2 leading-relaxed">
                                    <Minus className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                                    {s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            {recruiterInsights.red_flags.length > 0 && (
                              <div>
                                <span className="text-[9px] font-bold text-red-400 uppercase font-mono tracking-widest">Red Flags</span>
                                <ul className="mt-2 space-y-1.5">
                                  {recruiterInsights.red_flags.map((s, i) => (
                                    <li key={i} className="text-[11px] text-red-400/90 flex gap-2 leading-relaxed">
                                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                      {s}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Detail Grid: Tab selections + Job Matches list + AI suggestions */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      
                      {/* Left: 8/12 width - Tab inventory panels */}
                      <div className="lg:col-span-8 space-y-6">
                        
                        {/* Tab selectors bar */}
                        <div className={`p-1.5 rounded-2xl border flex gap-1.5 ${
                          isDark ? "bg-zinc-950/45 border-zinc-800/80" : "bg-zinc-100 border-zinc-200"
                        }`}>
                          {[
                            { id: "skills", label: "Skills", count: nlp?.skill_count },
                            { id: "matches", label: "Matches", count: jobs.length },
                            { id: "suggestions", label: "Suggestions", count: ats?.suggestions.length },
                            { id: "insights", label: "Insights", count: recruiterInsights ? recruiterInsights.strengths.length + recruiterInsights.weaknesses.length : 0 },
                            { id: "heatmap", label: "Heatmap", count: sectionHeatmap.length },
                          ].map(t => (
                            <button
                              key={t.id}
                              onClick={() => setActiveTab(t.id as any)}
                              className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all duration-200 ${
                                activeTab === t.id
                                  ? isDark ? "bg-zinc-900 border border-zinc-800 text-white shadow-lg" : "bg-white border border-zinc-200 text-zinc-950 shadow-sm"
                                  : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-600 hover:text-zinc-950"
                              }`}
                            >
                              <span>{t.label}</span>
                              {t.count !== undefined && t.count > 0 && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                                  activeTab === t.id
                                    ? isDark ? "bg-indigo-500/20 text-indigo-400" : "bg-indigo-100 text-indigo-700"
                                    : isDark ? "bg-zinc-900 text-zinc-600" : "bg-zinc-200 text-zinc-500"
                                }`}>
                                  {t.count}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>

                        {/* Display Tab component */}
                        <div className={`p-6 rounded-3xl border ${
                          isDark ? "bg-zinc-950/45 border-zinc-800/80 shadow-2xl backdrop-blur-xl" : "bg-white border-zinc-200 shadow-md"
                        } min-h-[350px]`}>
                          
                          {/* TAB CONTENT: SKILLS */}
                          {activeTab === "skills" && (
                            <div className="space-y-6">
                              <div>
                                <h3 className={`text-sm font-bold mb-4 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>Skills Profiles</h3>
                                <div className="space-y-4">
                                  {nlp && CAT_ORDER.filter(c => nlp.skills_by_category[c]?.length > 0).map(cat => (
                                    <div key={cat} className={`p-4 rounded-2xl border ${isDark ? "bg-zinc-900/35 border-zinc-800/60" : "bg-zinc-50 border-zinc-200/50"}`}>
                                      <div className="flex items-center gap-2 mb-3">
                                        <span className={`w-2 h-2 rounded-full ${CAT_COLORS[cat]?.dot || "bg-zinc-400"}`} />
                                        <h4 className={`text-[10px] font-bold uppercase tracking-widest font-mono ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                                          {CAT_LABELS[cat]}
                                        </h4>
                                        <span className="text-[10px] text-zinc-500 font-mono">({nlp.skills_by_category[cat].length})</span>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {nlp.skills_by_category[cat].map(skillName => {
                                          const sk = nlp.skills.find(s => s.name === skillName);
                                          return (
                                            <span
                                              key={skillName}
                                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border transition-all duration-150 ${
                                                CAT_COLORS[cat]?.badge || "bg-zinc-900 text-zinc-450 border-zinc-800"
                                              }`}
                                            >
                                              {skillName}
                                              {sk && sk.occurrences > 1 && (
                                                <span className="text-[9px] opacity-60 font-bold font-mono">×{sk.occurrences}</span>
                                              )}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Timelines split layout */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-zinc-800/50">
                                
                                {/* Experience timelines */}
                                <div>
                                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 flex items-center gap-2 font-mono">
                                    <Briefcase className="w-4 h-4 text-indigo-400" />
                                    <span>Experience History</span>
                                  </h4>
                                  
                                  {nlp && nlp.experience && nlp.experience.length > 0 ? (
                                    <div className="space-y-6 border-l border-zinc-800/80 pl-4 ml-2 mt-2">
                                      {nlp.experience.map((exp, idx) => (
                                        <div key={idx} className="relative">
                                          <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-indigo-500 bg-dark-surface" />
                                          <h5 className={`text-xs font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{exp.title}</h5>
                                          <p className="text-[11px] text-zinc-500 mt-0.5">{exp.company}</p>
                                          <span className="inline-block mt-1 px-2 py-0.5 text-[9px] text-zinc-500 font-mono bg-zinc-900/60 rounded border border-zinc-800/50">
                                            {exp.start_year} &ndash; {exp.end_year || "Present"} {exp.years && `(${exp.years} yrs)`}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-zinc-500 italic">No experience mapped.</p>
                                  )}
                                </div>

                                {/* Education timelines */}
                                <div>
                                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 flex items-center gap-2 font-mono">
                                    <GraduationCap className="w-4 h-4 text-emerald-400" />
                                    <span>Education History</span>
                                  </h4>
                                  
                                  {nlp && nlp.education && nlp.education.length > 0 ? (
                                    <div className="space-y-6 border-l border-zinc-800/80 pl-4 ml-2 mt-2">
                                      {nlp.education.map((edu, idx) => (
                                        <div key={idx} className="relative">
                                          <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-emerald-500 bg-dark-surface" />
                                          <h5 className={`text-xs font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{edu.degree}</h5>
                                          <p className="text-[11px] text-zinc-550 mt-0.5">{edu.field}</p>
                                          <p className="text-[10px] text-zinc-500 mt-0.5">{edu.institution} {edu.year && `(${edu.year})`}</p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-zinc-500 italic">No education mapped.</p>
                                  )}
                                </div>

                              </div>

                            </div>
                          )}

                          {/* TAB CONTENT: MATCHED ROLES */}
                          {activeTab === "matches" && (
                            <div className="space-y-4">
                              <div className="flex justify-between items-center mb-2">
                                <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>Target Position Matching</h3>
                                <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase">Searched {currentResult?.matches.total_jobs_searched} active openings</span>
                              </div>

                              <div className="space-y-3.5">
                                {jobs.map((job) => {
                                  const isSelected = selectedJobId === job.job_id || (!selectedJobId && job.rank === 1);
                                  return (
                                    <div
                                      key={job.job_id}
                                      onClick={() => setSelectedJobId(job.job_id)}
                                      className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                                        isSelected
                                          ? isDark ? "bg-indigo-500/5 border-brand-500/50 shadow-[0_0_25px_rgba(99,102,241,0.05)]" : "bg-indigo-50/40 border-brand-500/50 shadow-md"
                                          : isDark ? "bg-zinc-900/40 border-zinc-850 hover:bg-zinc-900/70" : "bg-zinc-50 border-zinc-200/50 hover:bg-zinc-100/60"
                                      }`}
                                    >
                                      {/* Header information */}
                                      <div className="flex justify-between items-start gap-4">
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-mono font-bold uppercase ${
                                              job.rank === 1
                                                ? "bg-brand-500/15 text-brand-400 border border-brand-500/20"
                                                : "bg-zinc-850 text-zinc-450 border border-zinc-800"
                                            }`}>
                                              Fit Rank #{job.rank}
                                            </span>
                                            <h4 className={`text-sm font-bold truncate ${isDark ? "text-white" : "text-zinc-950"}`}>{job.title}</h4>
                                          </div>
                                          <p className="text-xs text-zinc-500 mt-1">{job.company} &bull; {job.location || "Remote"}</p>
                                        </div>
                                        <div className="text-right">
                                          <span className="text-2xl font-black tracking-tight" style={{ color: getScoreColor(job.match_pct) }}>
                                            {job.match_pct.toFixed(0)}%
                                          </span>
                                          <span className="text-[9px] text-zinc-500 block font-mono font-bold">MATCH SCORE</span>
                                        </div>
                                      </div>

                                      {/* Progression slider */}
                                      <div className="mt-4 flex items-center gap-3">
                                        <div className={`h-1.5 flex-1 rounded-full overflow-hidden ${isDark ? "bg-zinc-900" : "bg-zinc-200"}`}>
                                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${job.match_pct}%`, backgroundColor: getScoreColor(job.match_pct) }} />
                                        </div>
                                        <span className="text-[10px] text-zinc-500 font-mono">
                                          {job.experience_required}yr exp required
                                        </span>
                                      </div>

                                      {/* Expanded job specifics */}
                                      {isSelected && (
                                        <motion.div
                                          initial={{ opacity: 0, height: 0 }}
                                          animate={{ opacity: 1, height: "auto" }}
                                          transition={{ duration: 0.25 }}
                                          className="mt-5 pt-5 border-t border-zinc-800/80 space-y-4"
                                        >
                                          {/* Mini stats widgets */}
                                          <div className="grid grid-cols-3 gap-3">
                                            {[
                                              { label: "SKILL INDEX", val: job.skill_score },
                                              { label: "CONTEXT CLARITY", val: job.semantic_score },
                                              { label: "EXPERIENCE FIT", val: job.experience_score }
                                            ].map(s => (
                                              <div key={s.label} className={`p-3 rounded-xl text-center ${isDark ? "bg-zinc-900/60 border border-zinc-800/50" : "bg-zinc-100"}`}>
                                                <span className="text-sm font-black font-mono block" style={{ color: getScoreColor(s.val) }}>
                                                  {s.val.toFixed(0)}%
                                                </span>
                                                <span className="text-[9px] text-zinc-500 font-bold uppercase block mt-1 font-mono tracking-widest">{s.label}</span>
                                              </div>
                                            ))}
                                          </div>

                                          {/* Skills gaps matching tags */}
                                          <div className="space-y-2">
                                            <div className="text-[9px] font-bold text-zinc-500 uppercase font-mono tracking-widest">Job Skills Coverage</div>
                                            <div className="flex flex-wrap gap-1.5">
                                              {job.matched_skills.slice(0, 8).map(s => (
                                                <span key={s} className="px-2.5 py-0.5 rounded-lg text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                  {s}
                                                </span>
                                              ))}
                                              {job.missing_skills.slice(0, 4).map(s => (
                                                <span key={s} className="px-2.5 py-0.5 rounded-lg text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                                                  &minus; {s}
                                                </span>
                                              ))}
                                            </div>
                                          </div>

                                          {/* AI reasons list */}
                                          {job.reasons && job.reasons.length > 0 && (
                                            <div className="space-y-2 pt-1">
                                              <div className="text-[9px] font-bold text-zinc-500 uppercase font-mono tracking-widest">Analysis Reasoning</div>
                                              <ul className="space-y-2 pl-0">
                                                {job.reasons.map((r, rIdx) => (
                                                  <li key={rIdx} className="text-xs text-zinc-400 flex items-start gap-2.5 leading-relaxed">
                                                    <span className="text-indigo-400 mt-1 font-bold">&rarr;</span>
                                                    <span>{r}</span>
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}

                                          {/* Extra metadata specifications */}
                                          <div className="flex justify-between text-[10px] text-zinc-500 pt-3 border-t border-zinc-800/40 font-mono">
                                            <span>TARGET COMP: <strong className="text-zinc-300 font-bold">{job.salary_range || "N/A"}</strong></span>
                                            <span>ROLE FORMAT: <strong className="text-zinc-300 font-bold">{job.job_type || "N/A"}</strong></span>
                                          </div>
                                        </motion.div>
                                      )}

                                    </div>
                                  );
                                })}
                              </div>

                            </div>
                          )}

                          {/* TAB CONTENT: RECRUITER INSIGHTS */}
                          {activeTab === "insights" && recruiterInsights && (
                            <div className="space-y-6">
                              <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>Recruiter Insights</h3>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {[
                                  { title: "Strengths", items: recruiterInsights.strengths, iconClass: "text-emerald-400", icon: <Check className="w-4 h-4" /> },
                                  { title: "Weaknesses", items: recruiterInsights.weaknesses, iconClass: "text-amber-400", icon: <Minus className="w-4 h-4" /> },
                                  { title: "Red Flags", items: recruiterInsights.red_flags, iconClass: "text-red-400", icon: <AlertTriangle className="w-4 h-4" /> },
                                ].map((col) => (
                                  <div key={col.title} className={`p-4 rounded-2xl border ${isDark ? "bg-zinc-900/35 border-zinc-800/60" : "bg-zinc-50 border-zinc-200/50"}`}>
                                    <div className={`flex items-center gap-2 mb-3 ${col.iconClass}`}>
                                      {col.icon}
                                      <span className="text-xs font-bold uppercase font-mono tracking-widest">{col.title}</span>
                                    </div>
                                    <ul className="space-y-2">
                                      {(col.items.length ? col.items : ["None identified"]).map((item, i) => (
                                        <li key={i} className="text-xs text-zinc-400 leading-relaxed">{item}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* TAB CONTENT: RESUME HEATMAP */}
                          {activeTab === "heatmap" && (
                            <div className="space-y-4">
                              <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>Section Heatmap</h3>
                              <div className="h-[220px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={sectionHeatmap} layout="vertical" margin={{ left: 8, right: 16 }}>
                                    <XAxis type="number" domain={[0, 100]} hide />
                                    <YAxis type="category" dataKey="label" width={72} tick={{ fill: "#888", fontSize: 11 }} />
                                    <Tooltip
                                      contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11 }}
                                      formatter={(v: number) => [`${v.toFixed(0)}%`, "Score"]}
                                    />
                                    <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={14}>
                                      {sectionHeatmap.map((entry) => (
                                        <Cell key={entry.id} fill={HEATMAP_COLORS[entry.status]} />
                                      ))}
                                    </Bar>
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                              <div className="flex gap-4 text-[10px] font-mono text-zinc-500">
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Strong ≥75</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Average ≥50</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Weak &lt;50</span>
                              </div>
                            </div>
                          )}

                          {/* TAB CONTENT: AI RECOMMENDATIONS */}
                          {activeTab === "suggestions" && (
                            <div className="space-y-5">
                              <h3 className={`text-sm font-bold mb-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>AI Prioritized Recommendations</h3>
                              <div className="space-y-4">
                                {ats?.suggestions.map((sug, idx) => (
                                  <div
                                    key={idx}
                                    className={`p-5 rounded-2xl border flex gap-4 ${
                                      idx === 0
                                        ? isDark ? "bg-gradient-to-r from-indigo-500/5 to-purple-500/5 border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.02)]" : "bg-indigo-50/30 border-indigo-200"
                                        : isDark ? "bg-zinc-900/35 border-zinc-800/60" : "bg-zinc-50 border-zinc-200/50"
                                    }`}
                                  >
                                    <div className={`w-7 h-7 rounded-xl font-mono text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                                      idx === 0
                                        ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20"
                                        : isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-200 text-zinc-650"
                                    }`}>
                                      {String(idx + 1).padStart(2, "0")}
                                    </div>
                                    <div className="flex-1 text-xs leading-relaxed">
                                      {idx === 0 && (
                                        <span className="text-[9px] font-bold font-mono tracking-widest text-indigo-400 uppercase block mb-1">
                                          CRITICAL IMPROVEMENT ACTION
                                        </span>
                                      )}
                                      <p className={idx === 0 ? "font-bold text-zinc-250 text-xs" : "text-zinc-400"}>
                                        {sug}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                        </div>

                      </div>

                      {/* Right: 4/12 width - Gap summaries and targets panel */}
                      <div className="lg:col-span-4 space-y-6">
                        
                        {/* ATS Delta Analysis cards */}
                        {ats && (ats.missing_skills.length > 0 || ats.bonus_skills.length > 0) && (
                          <div className={`p-6 rounded-3xl border ${isDark ? "bg-zinc-950/45 border-zinc-800/80 shadow-2xl backdrop-blur-xl" : "bg-white border-zinc-200 shadow-md"}`}>
                            <h3 className={`text-sm font-bold mb-4 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>ATS Delta Analysis</h3>
                            
                            {/* Missing core skillsets */}
                            {ats.missing_skills.length > 0 && (
                              <div className="mb-4">
                                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block font-mono mb-2">missing core requirements</span>
                                <div className="flex flex-wrap gap-2">
                                  {ats.missing_skills.map(s => (
                                    <span key={s} className="px-3 py-1 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                                      &minus; {s}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Bonus skills detected */}
                            {ats.bonus_skills.length > 0 && (
                              <div className="mb-4">
                                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block font-mono mb-2">bonus capabilities detected</span>
                                <div className="flex flex-wrap gap-2">
                                  {ats.bonus_skills.map(s => (
                                    <span key={s} className="px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                      + {s}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Missing keywords */}
                            {ats.missing_keywords.length > 0 && (
                              <div className="pt-3 border-t border-zinc-800/60">
                                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block font-mono mb-2">missing recruiter keywords</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {ats.missing_keywords.map(k => (
                                    <span key={k} className="px-2.5 py-0.5 rounded-lg text-[10px] bg-zinc-900/70 text-zinc-450 border border-zinc-800/50">
                                      {k}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Top Match Spec details card */}
                        <div className={`p-6 rounded-3xl border ${isDark ? "bg-zinc-950/45 border-zinc-800/80 shadow-2xl backdrop-blur-xl" : "bg-white border-zinc-200 shadow-md"} space-y-4`}>
                          <div className="flex items-center gap-2.5">
                            <Sparkle className="w-4 h-4 text-indigo-400 animate-spin" />
                            <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>Hiring Compatibility</h3>
                          </div>
                          
                          <div className={`p-4 rounded-2xl border ${isDark ? "bg-zinc-900/35 border-zinc-800/50" : "bg-zinc-50 border-zinc-200/50"}`}>
                            <h4 className={`text-xs font-extrabold ${isDark ? "text-white" : "text-zinc-900"}`}>{activeJob?.title || "Target Position"}</h4>
                            <p className="text-[11px] text-zinc-500 mt-1">{activeJob?.company || "Target Hub"}</p>
                            
                            <div className="mt-4 flex items-center justify-between">
                              <span className="text-xs text-zinc-500">Compatibility Index:</span>
                              <span className="text-sm font-black text-indigo-400">{activeJob?.match_pct.toFixed(0)}%</span>
                            </div>
                            
                            <p className="text-[11px] text-zinc-500 leading-relaxed mt-3.5 pt-3.5 border-t border-zinc-800/40">
                              {activeJob?.reasons && activeJob.reasons[0] ? activeJob.reasons[0] : "Compatible engineering profile matching requirements."}
                            </p>
                          </div>

                          <div className="space-y-2.5">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Job Specifications</h4>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className={`p-3 rounded-xl border flex flex-col justify-between ${isDark ? "bg-zinc-900/30 border-zinc-800" : "bg-white border-zinc-200"}`}>
                                <span className="text-[9px] text-zinc-500 font-mono uppercase font-bold">Office format</span>
                                <span className={`font-bold mt-1 truncate ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                                  <MapPin className="w-3 h-3 inline mr-1 text-zinc-500" />
                                  {activeJob?.location || "Remote"}
                                </span>
                              </div>
                              <div className={`p-3 rounded-xl border flex flex-col justify-between ${isDark ? "bg-zinc-900/30 border-zinc-800" : "bg-white border-zinc-200"}`}>
                                <span className="text-[9px] text-zinc-500 font-mono uppercase font-bold">Salary index</span>
                                <span className={`font-bold mt-1 truncate ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                                  <DollarSign className="w-3 h-3 inline mr-1 text-zinc-500" />
                                  {activeJob?.salary_range || "N/A"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                      </div>

                    </div>

                  </motion.div>
                )}

              </AnimatePresence>
            )}

          </main>
        </div>

      </div>
    </div>
  );
}
