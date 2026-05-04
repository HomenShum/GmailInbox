import { buildBriefingSummary, buildCalendarSummary, buildPlannerSummary } from "./operating-system";

export type PulseCadence = "daily" | "weekly";
export type PulseCardKind = "focus" | "schedule" | "career" | "admin" | "risk" | "progress";

export type PulseEvidence = {
  id: string;
  title: string;
  source: string;
  dateLabel: string;
  lane: string;
};

export type PulseCard = {
  id: string;
  cadence: PulseCadence;
  kind: PulseCardKind;
  title: string;
  summary: string;
  why: string;
  confidence: number;
  primaryAction: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
  evidence: PulseEvidence[];
};

export type PulseSummary = {
  generatedAt: number;
  dayLabel: string;
  weekLabel: string;
  nextRefreshLabel: string;
  signals: Array<{ label: string; value: string; detail: string; tone: string }>;
  daily: PulseCard[];
  weekly: PulseCard[];
  curationPrompts: string[];
  principles: string[];
};

export function buildPulseSummary(): PulseSummary {
  const briefing = buildBriefingSummary();
  const calendar = buildCalendarSummary();
  const planner = buildPlannerSummary();
  const confidence = briefing.executive.confidence;
  const evidence = briefing.evidence;
  const replyCount = Number(briefing.executive.followUps.find((item) => item.label === "Waiting for your reply")?.value ?? 0);
  const scheduleCount = calendar.stats.needsScheduling;
  const riskCount = Number(briefing.stats.find((item) => item.id === "risks")?.value ?? 0);
  const recommended = planner.recommendedActions;

  const daily: PulseCard[] = [
    {
      id: "daily-start",
      cadence: "daily",
      kind: "focus",
      title: "Start with the smallest decision queue",
      summary: `${replyCount} reply items and ${riskCount} uncertain labels are the fastest way to reduce inbox drag today.`,
      why: "Pulse prioritizes tasks that can unblock other workflows before adding more planning surface.",
      confidence,
      primaryAction: { label: "Open reply queue", href: "/inbox?tab=reply_now" },
      secondaryAction: { label: "Review uncertain", href: "/inbox?tab=triage" },
      evidence: evidence.slice(0, 3),
    },
    {
      id: "daily-schedule",
      cadence: "daily",
      kind: "schedule",
      title: "Convert email into time blocks",
      summary: `${scheduleCount} items look schedule-worthy, with ${calendar.stats.timeBlockedHours} hours represented in this week's candidate blocks.`,
      why: "ChatGPT Pulse is useful when it turns context into a next move. Here, the next move is placing decisions on the calendar.",
      confidence: clamp(confidence - 4, 55, 98),
      primaryAction: { label: "Open Calendar", href: "/calendar" },
      secondaryAction: { label: "Open Briefing", href: "/briefings" },
      evidence: evidence.slice(3, 6),
    },
    {
      id: "daily-career",
      cadence: "daily",
      kind: "career",
      title: "Move one career thread forward",
      summary: briefing.sections.find((section) => section.id === "recruiters")?.items[0]?.title ?? "Review recruiter and opportunity messages before passive job alerts.",
      why: "Career items have compounding upside, so Pulse should repeatedly surface the best next thread until it closes.",
      confidence: clamp(confidence - 8, 50, 96),
      primaryAction: { label: "Open Career Mail", href: "/inbox?tab=career" },
      secondaryAction: { label: "Draft follow-ups", href: "/inbox?tab=reply_now" },
      evidence: briefing.sections.find((section) => section.id === "recruiters")?.items.slice(0, 3).map((item, index) => ({
        id: item.emailId ?? `career-${index}`,
        title: item.title,
        source: item.meta,
        dateLabel: "Career",
        lane: item.badge ?? "Career",
      })) ?? evidence.slice(0, 2),
    },
    {
      id: "daily-admin",
      cadence: "daily",
      kind: "admin",
      title: "Keep admin from becoming background anxiety",
      summary: "Review bills, subscriptions, tax evidence, travel, and renewals as one ledger instead of separate rabbit holes.",
      why: "Pulse should preserve attention by grouping small obligations into one narrow review loop.",
      confidence: clamp(confidence - 10, 50, 95),
      primaryAction: { label: "Open Admin Mail", href: "/inbox?tab=admin" },
      secondaryAction: { label: "Find tax evidence", href: "/inbox?q=tax" },
      evidence: briefing.sections.find((section) => section.id === "bills")?.items.slice(0, 3).map((item, index) => ({
        id: item.emailId ?? `admin-${index}`,
        title: item.title,
        source: item.meta,
        dateLabel: "Admin",
        lane: item.badge ?? "Admin",
      })) ?? evidence.slice(0, 2),
    },
  ];

  const weekly: PulseCard[] = [
    {
      id: "weekly-reset",
      cadence: "weekly",
      kind: "progress",
      title: "Run a weekly reset before planning more work",
      summary: recommended[0] ?? "Review open replies, deadlines, and uncertain labels before expanding scope.",
      why: "Pulse should make recurring review cheap: what changed, what is blocked, what needs to move next.",
      confidence: clamp(confidence - 3, 58, 98),
      primaryAction: { label: "Open Goals", href: "/goals" },
      secondaryAction: { label: "Open Briefing", href: "/briefings" },
      evidence: evidence.slice(0, 4),
    },
    {
      id: "weekly-career",
      cadence: "weekly",
      kind: "career",
      title: "Review pipeline velocity once a week",
      summary: `${planner.stats.find((stat) => stat.id === "velocity")?.value ?? "Live"} opportunity velocity with ${planner.stats.find((stat) => stat.id === "interviews")?.value ?? "0"} active interview signals.`,
      why: "A weekly Pulse should prevent career momentum from being buried under inbox volume.",
      confidence: clamp(confidence - 6, 55, 97),
      primaryAction: { label: "Open Career Mail", href: "/inbox?tab=career" },
      secondaryAction: { label: "Open Top Jobs", href: "/jobs" },
      evidence: evidence.filter((item) => item.lane === "Career" || item.lane === "Job Alerts").slice(0, 4),
    },
    {
      id: "weekly-admin",
      cadence: "weekly",
      kind: "admin",
      title: "Batch admin decisions into one review",
      summary: "Finance, renewals, shopping, and travel should be cleared as a ledger, then archived safely.",
      why: "Weekly batching reduces context switching while keeping high-consequence items visible.",
      confidence: clamp(confidence - 9, 52, 95),
      primaryAction: { label: "Open Admin Mail", href: "/inbox?tab=admin" },
      secondaryAction: { label: "Archive review", href: "/?lane=auto_archive" },
      evidence: evidence.filter((item) => item.lane !== "Career").slice(0, 4),
    },
  ];

  return {
    generatedAt: Math.floor(Date.now() / 1000),
    dayLabel: briefing.dayLabel,
    weekLabel: planner.range.week,
    nextRefreshLabel: "Tomorrow morning",
    signals: [
      { label: "Daily cards", value: String(daily.length), detail: "scan first", tone: "#6366f1" },
      { label: "Weekly cards", value: String(weekly.length), detail: "reset rhythm", tone: "#8b5cf6" },
      { label: "Calendar candidates", value: String(calendar.stats.thisWeek), detail: "from email", tone: "#06b6d4" },
      { label: "Brief confidence", value: `${confidence}%`, detail: "evidence-backed", tone: "#10b981" },
    ],
    daily,
    weekly,
    curationPrompts: [
      "Focus tomorrow on career follow-ups and interview prep.",
      "Give me a weekly admin packet with tax, bills, renewals, and travel.",
      "Surface only items with a real deadline or a person waiting on me.",
    ],
    principles: [
      "Generated from local inbox, briefing, planner, and calendar read models.",
      "Scan cards first, open details only when needed.",
      "External actions remain suggestions until explicitly approved.",
      "Feedback and curation should tune tomorrow's cards.",
    ],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
