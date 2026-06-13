/** Client-side insight helpers — derived from existing API responses only. */

export type HeatmapStatus = "strong" | "average" | "weak";

export interface HeatmapSection {
  id: string;
  label: string;
  score: number;
  status: HeatmapStatus;
  summary: string;
}

export interface RecruiterInsights {
  strengths: string[];
  weaknesses: string[];
  red_flags: string[];
}

export interface CustomJdMatch {
  match_pct: number;
  matched_skills: string[];
  missing_in_resume: string[];
  matched_keywords: string[];
  missing_keywords: string[];
  summary: string;
}

interface AtsLike {
  ats_score: number;
  components: { name: string; raw_score: number }[];
  matched_skills: string[];
  missing_skills: string[];
  bonus_skills: string[];
  matched_keywords: string[];
  missing_keywords: string[];
  experience_gap: number;
  education_met: boolean;
}

interface NlpLike {
  skill_count: number;
  total_experience_years: number;
  skills: { name: string }[];
  education: unknown[];
  experience: unknown[];
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "for", "to", "in", "on", "at", "with", "of",
  "is", "are", "be", "as", "by", "from", "that", "this", "will", "you", "your",
  "we", "our", "have", "has", "had", "using", "use", "used", "ability", "experience",
]);

function scoreStatus(score: number): HeatmapStatus {
  if (score >= 75) return "strong";
  if (score >= 50) return "average";
  return "weak";
}

function componentScore(ats: AtsLike, name: string): number {
  return ats.components.find((c) => c.name === name)?.raw_score ?? 0;
}

export function buildSectionHeatmap(
  ats: AtsLike,
  nlp: NlpLike,
  wordCount: number,
): HeatmapSection[] {
  const skillScore = componentScore(ats, "Skill Match");
  const expScore = componentScore(ats, "Experience Relevance");
  const kwScore = componentScore(ats, "Keyword Optimisation");
  const eduScore = componentScore(ats, "Education Fit");

  let formatScore = 70;
  if (wordCount < 250) formatScore -= 25;
  else if (wordCount < 400) formatScore -= 10;
  if (nlp.experience.length === 0) formatScore -= 20;
  if (nlp.education.length === 0) formatScore -= 15;
  if (nlp.skill_count < 5) formatScore -= 15;
  formatScore = Math.max(0, Math.min(100, formatScore));

  const sections: HeatmapSection[] = [
    {
      id: "skills",
      label: "Skills",
      score: skillScore,
      status: scoreStatus(skillScore),
      summary: `${ats.matched_skills.length} matched · ${ats.missing_skills.length} gaps`,
    },
    {
      id: "experience",
      label: "Experience",
      score: expScore,
      status: scoreStatus(expScore),
      summary: `${nlp.total_experience_years} yrs · ${nlp.experience.length} role(s)`,
    },
    {
      id: "keywords",
      label: "Keywords",
      score: kwScore,
      status: scoreStatus(kwScore),
      summary: `${ats.matched_keywords.length} matched · ${ats.missing_keywords.length} missing`,
    },
    {
      id: "education",
      label: "Education",
      score: eduScore,
      status: scoreStatus(eduScore),
      summary: ats.education_met ? "Requirement met" : "Below requirement",
    },
    {
      id: "formatting",
      label: "Structure",
      score: formatScore,
      status: scoreStatus(formatScore),
      summary: `${wordCount} words · ${nlp.skill_count} skills listed`,
    },
  ];

  return sections;
}

export function buildRecruiterInsights(
  ats: AtsLike,
  nlp: NlpLike,
  wordCount: number,
): RecruiterInsights {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const red_flags: string[] = [];

  if (ats.matched_skills.length > 0) {
    strengths.push(
      `Strong skill overlap: ${ats.matched_skills.slice(0, 5).join(", ")}`,
    );
  }
  if (ats.bonus_skills.length > 0) {
    strengths.push(`Bonus capabilities: ${ats.bonus_skills.slice(0, 4).join(", ")}`);
  }
  if (ats.education_met) {
    strengths.push("Education level meets the target role requirement.");
  }
  if (nlp.total_experience_years >= 3) {
    strengths.push(`${nlp.total_experience_years} years of relevant experience documented.`);
  }
  if (ats.ats_score >= 75) {
    strengths.push(`High ATS score (${ats.ats_score.toFixed(0)}) — competitive for screening.`);
  }

  if (ats.missing_skills.length > 0) {
    weaknesses.push(
      `Missing required skills: ${ats.missing_skills.slice(0, 4).join(", ")}`,
    );
  }
  if (ats.missing_keywords.length > 0) {
    weaknesses.push(
      `JD keywords absent from resume: ${ats.missing_keywords.slice(0, 5).join(", ")}`,
    );
  }
  if (ats.experience_gap > 0) {
    weaknesses.push(
      `Experience gap of ${ats.experience_gap.toFixed(1)} year(s) vs top role.`,
    );
  }
  const lowComponents = ats.components.filter((c) => c.raw_score < 55);
  for (const c of lowComponents) {
    weaknesses.push(`Low ${c.name} score (${c.raw_score.toFixed(0)}%) — needs improvement.`);
  }

  if (ats.ats_score < 50) {
    red_flags.push("ATS score below 50 — likely filtered by automated screening.");
  }
  if (wordCount < 250) {
    red_flags.push("Resume is very short — may lack depth for recruiter review.");
  }
  if (nlp.experience.length === 0) {
    red_flags.push("No work experience entries detected.");
  }
  if (!ats.education_met && nlp.education.length === 0) {
    red_flags.push("No education section detected.");
  }
  if (ats.missing_skills.length >= 4) {
    red_flags.push(`${ats.missing_skills.length} required skills missing — high rejection risk.`);
  }

  if (strengths.length === 0) {
    strengths.push("Upload complete — review gaps below to strengthen the profile.");
  }

  return { strengths, weaknesses, red_flags };
}

function extractJdTerms(jdText: string): string[] {
  return jdText
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export function computeCustomJdMatch(
  jdText: string,
  resumeSkills: string[],
  resumeKeywords: string[],
): CustomJdMatch | null {
  const trimmed = jdText.trim();
  if (!trimmed) return null;

  const jdLower = trimmed.toLowerCase();
  const jdTerms = new Set(extractJdTerms(trimmed));

  const matched_skills = resumeSkills.filter((s) => jdLower.includes(s.toLowerCase()));
  const missing_in_resume = resumeSkills.filter((s) => !jdLower.includes(s.toLowerCase()));

  const matched_keywords = resumeKeywords.filter((k) => jdLower.includes(k.toLowerCase()));
  const missing_keywords = [...jdTerms]
    .filter((t) => !resumeKeywords.some((k) => k.toLowerCase().includes(t) || t.includes(k.toLowerCase())))
    .filter((t) => !resumeSkills.some((s) => s.toLowerCase().includes(t) || t.includes(s.toLowerCase())))
    .slice(0, 12);

  const skillPct = resumeSkills.length
    ? (matched_skills.length / resumeSkills.length) * 100
    : 0;
  const kwDenom = Math.max(jdTerms.size, 1);
  const kwHits = [...jdTerms].filter((t) =>
    resumeKeywords.some((k) => k.toLowerCase().includes(t)) ||
    resumeSkills.some((s) => s.toLowerCase().includes(t)),
  ).length;
  const kwPct = (kwHits / kwDenom) * 100;

  const match_pct = Math.round(skillPct * 0.55 + kwPct * 0.45);

  let summary = "Moderate alignment with your pasted job description.";
  if (match_pct >= 80) summary = "Strong alignment — resume closely matches this JD.";
  else if (match_pct >= 60) summary = "Good fit — address missing keywords to improve odds.";
  else if (match_pct < 40) summary = "Weak fit — significant gaps vs this job description.";

  return {
    match_pct,
    matched_skills,
    missing_in_resume,
    matched_keywords,
    missing_keywords,
    summary,
  };
}

export const HEATMAP_COLORS: Record<HeatmapStatus, string> = {
  strong: "#10b981",
  average: "#f59e0b",
  weak: "#ef4444",
};
