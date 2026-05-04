import { listLaneCards, type LaneCard } from "./db";
import { buildResearchView, getResearchViewMap, type JobResearchView } from "./nodebench/job-research";
import { getPinnedContextSummary } from "./pinned-artifacts";
import type { PinnedArtifactView, PinnedContextSummary } from "./pinned-types";

export type CareerFitItem = {
  email: LaneCard;
  fitScore: number;
  fitLabel: "strong" | "good" | "maybe" | "low";
  reasons: string[];
  matchedSignals: string[];
  artifactIds: string[];
  ageDays: number;
  research: JobResearchView;
};

export type CareerFitSummary = {
  generatedAt: number;
  context: PinnedContextSummary;
  items: CareerFitItem[];
  totals: {
    scanned: number;
    strong: number;
    good: number;
    pinnedArtifacts: number;
  };
};

const DEFAULT_SIGNALS = [
  "agentic workflow systems",
  "AI engineer",
  "full-stack engineering",
  "field deployment engineering",
  "research pipelines",
  "automation",
  "product execution",
  "startup",
  "finance workflow",
];

export function buildCareerFitSummary(limit = 30): CareerFitSummary {
  const context = getPinnedContextSummary();
  const artifacts = context.artifacts.filter((artifact) => artifact.approved_for_matching);
  const candidates = uniqueById([
    ...listLaneCards("job_alerts", 160, 0),
    ...listLaneCards("career", 80, 0),
    ...listLaneCards("reply_now", 40, 0),
  ]).filter((email) => looksCareerRelevant(email));

  const researchById = getResearchViewMap(candidates);
  const scored = candidates
    .map((email) => scoreEmail(email, artifacts, researchById[email.id]))
    .sort((a, b) => b.fitScore - a.fitScore || b.email.internal_date - a.email.internal_date)
    .slice(0, Math.max(1, Math.min(limit, 60)));

  return {
    generatedAt: Math.floor(Date.now() / 1000),
    context,
    items: scored,
    totals: {
      scanned: candidates.length,
      strong: scored.filter((item) => item.fitScore >= 80).length,
      good: scored.filter((item) => item.fitScore >= 65).length,
      pinnedArtifacts: artifacts.length,
    },
  };
}

function scoreEmail(email: LaneCard, artifacts: PinnedArtifactView[], research = buildResearchView(email)): CareerFitItem {
  const text = normalizeText(`${email.subject} ${email.snippet} ${email.from_name ?? ""} ${email.from_addr}`);
  const signals = buildSignals(artifacts);
  const matchedSignals = signals
    .filter((signal) => signal.tokens.some((token) => text.includes(token)))
    .slice(0, 8);
  const ageDays = Math.max(0, Math.floor((Date.now() / 1000 - email.internal_date) / 86_400));
  const recency = Math.max(0, 12 - Math.min(ageDays, 12));
  const careerBoost = email.lane === "career" || email.lane === "reply_now" ? 8 : 0;
  const highIntent = /(interview|recruiter|hiring|founding|founder|opportunity|role|engineer|application|next step|schedule)/i.test(`${email.subject} ${email.snippet}`) ? 10 : 0;
  const seniority = /(lead|senior|staff|principal|founding|full.?stack|ai|agent|platform|product)/i.test(`${email.subject} ${email.snippet}`) ? 7 : 0;
  const noisePenalty = /(unsubscribe|digest|newsletter|recommended jobs|saved search)/i.test(`${email.subject} ${email.snippet}`) ? 8 : 0;
  const researchBoost = research.status === "verified" ? 5 : research.status === "needs_review" ? 2 : 0;
  const signalScore = Math.min(36, matchedSignals.length * 7);
  const confidenceScore = Math.round((email.confidence ?? 0.5) * 14);
  const fitScore = clamp(Math.round(34 + signalScore + confidenceScore + recency + careerBoost + highIntent + seniority + researchBoost - noisePenalty), 1, 99);

  return {
    email,
    fitScore,
    fitLabel: fitScore >= 80 ? "strong" : fitScore >= 65 ? "good" : fitScore >= 48 ? "maybe" : "low",
    reasons: buildReasons(email, matchedSignals.map((signal) => signal.label), ageDays, highIntent > 0, noisePenalty > 0),
    matchedSignals: matchedSignals.map((signal) => signal.label),
    artifactIds: artifacts.map((artifact) => artifact.id),
    ageDays,
    research,
  };
}

function buildSignals(artifacts: PinnedArtifactView[]) {
  const phrases = [
    ...DEFAULT_SIGNALS,
    ...artifacts.flatMap((artifact) => [
      ...artifact.preview.signals,
      ...artifact.tags.filter((tag) => !GENERIC_TAGS.has(tag.toLowerCase())),
    ]),
  ];
  const seen = new Set<string>();
  return phrases
    .map((phrase) => phrase.trim())
    .filter(Boolean)
    .map((phrase) => ({ label: phrase, tokens: tokenize(phrase) }))
    .filter((signal) => signal.tokens.length > 0)
    .filter((signal) => {
      const key = signal.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildReasons(email: LaneCard, signals: string[], ageDays: number, highIntent: boolean, noisy: boolean) {
  const reasons: string[] = [];
  if (signals.length) reasons.push(`Matches pinned context: ${signals.slice(0, 2).join(", ")}`);
  if (email.lane === "career" || email.lane === "reply_now") reasons.push("Recruiter or direct career thread");
  else reasons.push("Job email lane");
  if (highIntent) reasons.push("Contains an active hiring or scheduling signal");
  if (ageDays <= 3) reasons.push("Recent enough to act on now");
  if (noisy) reasons.push("May be a bulk alert; verify before spending time");
  return reasons.slice(0, 4);
}

function looksCareerRelevant(email: LaneCard) {
  if (email.lane === "job_alerts" || email.lane === "career" || email.lane === "reply_now") return true;
  return /(job|role|career|recruit|interview|hiring|engineer|founder|application)/i.test(`${email.subject} ${email.snippet}`);
}

function uniqueById(items: LaneCard[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => (token.length >= 3 || token === "ai") && !STOP_WORDS.has(token));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const STOP_WORDS = new Set([
  "and",
  "for",
  "the",
  "with",
  "from",
  "this",
  "that",
  "your",
  "you",
  "resume",
  "context",
  "primary",
  "full",
  "matching",
]);

const GENERIC_TAGS = new Set([
  "resume",
  "career",
  "matching",
  "background",
  "full",
]);
