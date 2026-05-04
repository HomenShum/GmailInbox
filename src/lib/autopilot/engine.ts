import {
  db,
  finishAutopilotRun,
  insertJob,
  insertOpportunity,
  latestAutopilotRun,
  listAutopilotRuns,
  recordAction,
  reviewQueueSummary,
  startAutopilotRun,
  upsertClassification,
  type AutopilotRunRow,
  type EmailRow,
  type LaneCard,
} from "@/lib/db";
import { heuristicClassify } from "@/lib/heuristic";

export type AutopilotMode = "suggest" | "local";

interface AutopilotOptions {
  mode?: AutopilotMode;
  trigger?: string;
  limits?: Partial<{
    classify: number;
    archive: number;
    jobs: number;
    opportunities: number;
    lowConfidence: number;
  }>;
}

interface AutopilotResult {
  run: AutopilotRunRow | null;
  mode: AutopilotMode;
  trigger: string;
  classified: number;
  jobsCreated: number;
  opportunitiesCreated: number;
  recommendationsCreated: number;
  summary: {
    archiveCandidates: number;
    lowConfidenceReview: number;
    reviewQueues: ReturnType<typeof reviewQueueSummary>;
  };
  errors: string[];
}

const DEFAULT_LIMITS = {
  classify: 3000,
  archive: 75,
  jobs: 100,
  opportunities: 50,
  lowConfidence: 75,
};

export async function runAutopilot(options: AutopilotOptions = {}): Promise<AutopilotResult> {
  const mode = options.mode === "suggest" ? "suggest" : "local";
  const trigger = options.trigger ?? "manual";
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const runId = startAutopilotRun(mode, trigger);

  let classified = 0;
  let jobsCreated = 0;
  let opportunitiesCreated = 0;
  let recommendationsCreated = 0;
  const errors: string[] = [];

  try {
    classified = processUnclassified(mode, limits.classify);
    const archiveRecommendations = processArchiveCandidates(mode, limits.archive);
    const lowConfidenceRecommendations = processLowConfidence(mode, limits.lowConfidence);
    jobsCreated = processJobAlerts(mode, limits.jobs);
    opportunitiesCreated = processOpportunities(mode, limits.opportunities);
    recommendationsCreated = archiveRecommendations + lowConfidenceRecommendations;

    const summary = {
      archiveCandidates: archiveRecommendations,
      lowConfidenceReview: lowConfidenceRecommendations,
      reviewQueues: reviewQueueSummary(),
    };

    finishAutopilotRun(runId, {
      summary,
      classified,
      jobs_created: jobsCreated,
      opportunities_created: opportunitiesCreated,
      recommendations_created: recommendationsCreated,
    });

    return {
      run: latestAutopilotRun(),
      mode,
      trigger,
      classified,
      jobsCreated,
      opportunitiesCreated,
      recommendationsCreated,
      summary,
      errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    const summary = {
      archiveCandidates: 0,
      lowConfidenceReview: 0,
      reviewQueues: reviewQueueSummary(),
    };
    finishAutopilotRun(runId, {
      summary,
      classified,
      jobs_created: jobsCreated,
      opportunities_created: opportunitiesCreated,
      recommendations_created: recommendationsCreated,
      errors: message,
    });
    return {
      run: latestAutopilotRun(),
      mode,
      trigger,
      classified,
      jobsCreated,
      opportunitiesCreated,
      recommendationsCreated,
      summary,
      errors,
    };
  }
}

export function autopilotStatus() {
  return {
    latest: latestAutopilotRun(),
    runs: listAutopilotRuns(8),
    reviewQueues: reviewQueueSummary(),
  };
}

function processUnclassified(mode: AutopilotMode, limit: number): number {
  const rows = db().prepare(`
    SELECT e.*
    FROM emails e
    LEFT JOIN latest_classifications c ON c.email_id = e.id
    WHERE c.email_id IS NULL
      AND COALESCE(e.labels, '') != 'ARCHIVED'
    ORDER BY e.internal_date DESC
    LIMIT ?
  `).all(limit) as EmailRow[];

  let count = 0;
  for (const email of rows) {
    const result = heuristicClassify(email.from_addr, email.subject);
    if (!result) continue;
    count += 1;
    if (mode === "suggest") continue;
    upsertClassification({
      email_id: email.id,
      lane: result.lane,
      urgency: result.urgency,
      action: result.lane === "auto_archive" ? "archive_candidate" : "review",
      confidence: result.confidence,
      model: "autopilot-heuristic",
      rationale: result.rule,
    });
  }
  return count;
}

function processArchiveCandidates(mode: AutopilotMode, limit: number): number {
  const rows = db().prepare(`
    SELECT e.*, c.lane, c.urgency, c.action, c.rationale, c.confidence, c.model AS classifier
    FROM latest_classifications c
    JOIN emails e ON e.id = c.email_id
    WHERE c.lane = 'auto_archive'
      AND c.confidence >= 0.7
      AND COALESCE(e.labels, '') != 'ARCHIVED'
    ORDER BY c.confidence DESC, e.internal_date DESC
    LIMIT ?
  `).all(limit) as LaneCard[];

  let count = 0;
  for (const email of rows) {
    if (hasAction(email.id, "autopilot_archive_candidate")) continue;
    count += 1;
    if (mode === "local") {
      recordAction(email.id, "autopilot_archive_candidate", {
        lane: email.lane,
        confidence: email.confidence,
        subject: email.subject,
      });
    }
  }
  return count;
}

function processLowConfidence(mode: AutopilotMode, limit: number): number {
  const rows = db().prepare(`
    SELECT e.*, c.lane, c.urgency, c.action, c.rationale, c.confidence, c.model AS classifier
    FROM latest_classifications c
    JOIN emails e ON e.id = c.email_id
    WHERE c.confidence < 0.5
      AND COALESCE(e.labels, '') != 'ARCHIVED'
    ORDER BY e.internal_date DESC
    LIMIT ?
  `).all(limit) as LaneCard[];

  let count = 0;
  for (const email of rows) {
    if (hasAction(email.id, "autopilot_review_candidate")) continue;
    count += 1;
    if (mode === "local") {
      recordAction(email.id, "autopilot_review_candidate", {
        lane: email.lane,
        confidence: email.confidence,
        subject: email.subject,
      });
    }
  }
  return count;
}

function processJobAlerts(mode: AutopilotMode, limit: number): number {
  const rows = db().prepare(`
    SELECT e.*, c.lane, c.urgency, c.action, c.rationale, c.confidence, c.model AS classifier
    FROM latest_classifications c
    JOIN emails e ON e.id = c.email_id
    LEFT JOIN job_matches j ON j.email_id = e.id
    WHERE c.lane = 'job_alerts'
      AND j.id IS NULL
      AND COALESCE(e.labels, '') != 'ARCHIVED'
    ORDER BY e.internal_date DESC
    LIMIT ?
  `).all(limit) as LaneCard[];

  let count = 0;
  for (const email of rows) {
    const job = extractJob(email);
    if (!job) continue;
    count += 1;
    if (mode === "local") {
      insertJob(job);
      recordAction(email.id, "autopilot_job_extracted", { job_id: job.id, title: job.title, company: job.company });
    }
  }
  return count;
}

function processOpportunities(mode: AutopilotMode, limit: number): number {
  const rows = db().prepare(`
    SELECT e.*, c.lane, c.urgency, c.action, c.rationale, c.confidence, c.model AS classifier
    FROM latest_classifications c
    JOIN emails e ON e.id = c.email_id
    LEFT JOIN opportunities o ON o.email_id = e.id
    WHERE c.lane IN ('career', 'reply_now')
      AND o.id IS NULL
      AND COALESCE(e.labels, '') != 'ARCHIVED'
    ORDER BY c.urgency DESC, e.internal_date DESC
    LIMIT ?
  `).all(limit) as LaneCard[];

  let count = 0;
  for (const email of rows) {
    const opportunity = extractOpportunity(email);
    if (!opportunity) continue;
    count += 1;
    if (mode === "local") {
      insertOpportunity(opportunity);
      recordAction(email.id, "autopilot_opportunity_extracted", {
        opportunity_id: opportunity.id,
        name: opportunity.name,
        score: opportunity.score,
      });
    }
  }
  return count;
}

function extractJob(email: LaneCard) {
  const text = `${email.subject} ${email.snippet}`;
  const title = cleanTitle(email.subject)
    .replace(/^new jobs?:\s*/i, "")
    .replace(/^job alert:\s*/i, "")
    .replace(/^your application to\s*/i, "");
  if (title.length < 8) return null;

  const companyMatch = text.match(/\bat\s+([A-Z][A-Za-z0-9&.\- ]{2,40})/);
  const locationMatch = text.match(/\b(Remote|San Francisco|New York|Los Angeles|Seattle|Austin|Bay Area|United States)\b/i);
  const compMatch = text.match(/\$([0-9]{2,3})(?:[,0-9]{0,4})?\s?[kK]?\s*(?:-|to|–)\s*\$?([0-9]{2,3})(?:[,0-9]{0,4})?\s?[kK]?/);

  return {
    id: `job_${email.id}`,
    email_id: email.id,
    company: companyMatch ? companyMatch[1].trim() : senderOrg(email),
    title: title.slice(0, 160),
    location: locationMatch ? locationMatch[1] : null,
    comp_low: compMatch ? normalizeComp(compMatch[1]) : null,
    comp_high: compMatch ? normalizeComp(compMatch[2]) : null,
    fit_score: Math.max(0.35, Math.min(0.95, email.confidence + 0.1)),
    status: "new" as const,
    source: "autopilot",
    next_step: "Review role details and decide whether to save or apply.",
  };
}

function extractOpportunity(email: LaneCard) {
  const subject = cleanTitle(email.subject);
  const opportunitySignals = /\b(opportunity|role|hiring|partnership|pitch|proposal|founding|contract|consulting|intro|interview)\b/i;
  if (!opportunitySignals.test(`${subject} ${email.snippet}`)) return null;

  const score = Math.max(0.45, Math.min(0.95, email.urgency * 0.55 + email.confidence * 0.45));
  return {
    id: `opp_${email.id}`,
    email_id: email.id,
    name: subject.slice(0, 160),
    sender_org: senderOrg(email),
    score,
    est_value_usd: null,
    deadline: null,
    status: "new" as const,
    next_action: "Review the thread, then draft a response or mark as not relevant.",
    source: "autopilot",
  };
}

function hasAction(emailId: string, action: string): boolean {
  const row = db().prepare(`
    SELECT id FROM actions
    WHERE email_id = ? AND action = ? AND reverted_at IS NULL
    LIMIT 1
  `).get(emailId, action);
  return Boolean(row);
}

function cleanTitle(subject: string): string {
  return subject
    .replace(/^(re|fw|fwd):\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function senderOrg(email: EmailRow): string | null {
  if (email.from_name) return email.from_name.slice(0, 80);
  const domain = email.from_addr.split("@")[1];
  if (!domain) return null;
  return domain.split(".").filter((part) => !["com", "net", "org", "io", "co"].includes(part)).join(" ").slice(0, 80) || domain;
}

function normalizeComp(value: string): number {
  const parsed = Number(value.replace(/,/g, ""));
  return parsed < 1000 ? parsed * 1000 : parsed;
}
