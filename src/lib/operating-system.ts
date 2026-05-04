import { db, listCalendarOverrides, listPlannerOverrides, listPlannerTodos } from "./db";
import { LANES, LANE_META, type Lane } from "./lanes";

type SqlCount = { n: number };
const SUMMARY_CACHE_TTL_MS = 12_000;
const summaryCache = new Map<string, { expires: number; value: unknown }>();

function cachedSummary<T>(key: string, loader: () => T): T {
  const now = Date.now();
  const hit = summaryCache.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  const value = loader();
  summaryCache.set(key, { value, expires: now + SUMMARY_CACHE_TTL_MS });
  return value;
}

export function clearOperatingSummaryCache(prefix?: string) {
  if (!prefix) {
    summaryCache.clear();
    return;
  }
  for (const key of summaryCache.keys()) {
    if (key.startsWith(prefix)) summaryCache.delete(key);
  }
}

export type OperatingEmail = {
  id: string;
  from_addr: string;
  from_name: string | null;
  subject: string;
  snippet: string;
  internal_date: number;
  is_unread: number;
  lane: Lane;
  urgency: number;
  confidence: number;
  action: string;
};

export type CalendarBlockType = "scheduling" | "deadline" | "follow_up" | "review" | "admin";

export type CalendarBlock = {
  id: string;
  emailId: string;
  title: string;
  subtitle: string;
  lane: Lane;
  laneTitle: string;
  type: CalendarBlockType;
  date: string;
  dayLabel: string;
  startHour: number;
  startLabel: string;
  endLabel: string;
  durationHours: number;
  confidence: number;
  source: string;
  snippet: string;
  color: string;
};

export type CalendarSummary = {
  generatedAt: number;
  range: {
    weekStart: string;
    weekEnd: string;
    monthLabel: string;
    today: string;
  };
  stats: {
    scheduledFromEmail: number;
    needsScheduling: number;
    thisWeek: number;
    deadlines: number;
    followUpsDue: number;
    timeBlockedHours: number;
  };
  days: Array<{ iso: string; label: string; dateLabel: string; isToday: boolean }>;
  hours: number[];
  blocks: CalendarBlock[];
  unscheduled: CalendarBlock[];
  deadlines: CalendarBlock[];
  agendaToday: CalendarBlock[];
  activity: Array<{ day: string; low: number; medium: number; high: number }>;
};

export type CalendarBuildOptions = {
  anchorDate?: string;
  type?: CalendarBlockType | "all";
};

export type PlannerMilestone = {
  id: string;
  title: string;
  status: "completed" | "in_progress" | "planned" | "at_risk";
  progress: number;
  dateLabel: string;
  source: "emails" | "calendar" | "actions" | "system";
  relatedEmails: Array<{ id: string; subject: string; from: string; dateLabel: string }>;
};

export type PlannerPillar = {
  id: string;
  title: string;
  description: string;
  color: string;
  milestones: PlannerMilestone[];
};

export type PlannerSummary = {
  generatedAt: number;
  range: {
    year: number;
    quarter: string;
    month: string;
    week: string;
  };
  stats: Array<{ id: string; label: string; value: string; sublabel: string; trend: string; tone: string }>;
  months: Array<{ label: string; quarter: string; active: boolean; progress: number }>;
  pillars: PlannerPillar[];
  monthly: {
    overall: number;
    byPillar: Array<{ label: string; value: number; color: string }>;
    heatmap: number[][];
  };
  weekly: Array<{ label: string; value: string; delta: string; direction: "up" | "down" | "flat" }>;
  insights: Array<{ label: string; value: string; delta: string; direction: "up" | "down" | "flat" }>;
  recommendedActions: string[];
  todos: Array<{ id: string; title: string; status: "open" | "done"; source: string; linkedEmailId: string | null; updatedAt: number }>;
};

export type BriefingSummary = {
  generatedAt: number;
  dayLabel: string;
  stats: Array<{ id: string; label: string; value: string; sublabel: string; tone: string }>;
  executive: {
    confidence: number;
    snapshot: string[];
    mattersMost: Array<{ priority: "High" | "Medium" | "Low"; title: string; due: string; emailId?: string }>;
    calendarHighlights: Array<{ time: string; title: string; source: string }>;
    followUps: Array<{ label: string; value: string }>;
    risks: Array<{ title: string; detail: string }>;
    suggestedMoves: string[];
  };
  timeline: Array<{ label: string; time: string; title: string; source: string }>;
  sections: Array<{ id: string; title: string; count: number; items: Array<{ title: string; meta: string; badge?: string; emailId?: string }> }>;
  evidence: Array<{ id: string; title: string; source: string; dateLabel: string; lane: string }>;
  longerBriefs: Array<{ title: string; value: string; detail: string; progress: number }>;
};

const EVENT_COLORS: Record<CalendarBlockType, string> = {
  scheduling: "#6366f1",
  deadline: "#ef4444",
  follow_up: "#10b981",
  review: "#f59e0b",
  admin: "#06b6d4",
};

const dayMs = 24 * 60 * 60 * 1000;

export function buildCalendarSummary(options: CalendarBuildOptions = {}): CalendarSummary {
  return cachedSummary(`calendar:${options.anchorDate ?? "now"}:${options.type ?? "all"}`, () => buildCalendarSummaryUncached(options));
}

function buildCalendarSummaryUncached(options: CalendarBuildOptions = {}): CalendarSummary {
  const d = db();
  const now = options.anchorDate ? new Date(`${options.anchorDate}T00:00:00`) : new Date();
  const todayIso = toIsoDate(now);
  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 6);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return {
      iso: toIsoDate(date),
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
      dateLabel: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      isToday: toIsoDate(date) === todayIso,
    };
  });

  const rows = getOperatingEmails(140);
  const rawBlocks = rows.slice(0, 34).map((email, index) => toCalendarBlock(email, days, index));
  const rawUnscheduled = rows.slice(34, 46).map((email, index) => toCalendarBlock(email, days, index + 34));
  const { blocks, unscheduled } = applyCalendarOverrides(rawBlocks, rawUnscheduled, options.type ?? "all");
  const deadlines = blocks.filter((block) => block.type === "deadline").slice(0, 8);
  const agendaToday = blocks
    .filter((block) => block.date === todayIso)
    .sort((a, b) => a.startHour - b.startHour)
    .slice(0, 8);

  const needsScheduling = countRows(d, `
    SELECT COUNT(*) AS n
    FROM latest_classifications c
    JOIN emails e ON e.id = c.email_id
    WHERE c.lane IN ('career', 'reply_now')
      AND e.is_unread = 1
      AND COALESCE(e.labels, '') != 'ARCHIVED'
  `);

  const activity = days.map((day) => {
    const dayBlocks = blocks.filter((block) => block.date === day.iso);
    return {
      day: day.label,
      low: dayBlocks.filter((block) => block.confidence < 0.55).length,
      medium: dayBlocks.filter((block) => block.confidence >= 0.55 && block.confidence < 0.78).length,
      high: dayBlocks.filter((block) => block.confidence >= 0.78).length,
    };
  });

  return {
    generatedAt: Math.floor(Date.now() / 1000),
    range: {
      weekStart: toIsoDate(weekStart),
      weekEnd: toIsoDate(weekEnd),
      monthLabel: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      today: todayIso,
    },
    stats: {
      scheduledFromEmail: blocks.length,
      needsScheduling,
      thisWeek: blocks.length,
      deadlines: deadlines.length,
      followUpsDue: blocks.filter((block) => block.type === "follow_up").length,
      timeBlockedHours: roundOne(blocks.reduce((sum, block) => sum + block.durationHours, 0)),
    },
    days,
    hours: Array.from({ length: 11 }, (_, index) => index + 8),
    blocks,
    unscheduled,
    deadlines,
    agendaToday,
    activity,
  };
}

export function buildPlannerSummary(): PlannerSummary {
  return cachedSummary("planner", () => buildPlannerSummaryUncached());
}

function buildPlannerSummaryUncached(): PlannerSummary {
  const d = db();
  const now = new Date();
  const laneCounts = getLaneCounts();
  const activeJobs = countRows(d, `SELECT COUNT(*) AS n FROM job_matches WHERE status IN ('new', 'saved', 'applied', 'interview')`);
  const interviewJobs = countRows(d, `SELECT COUNT(*) AS n FROM job_matches WHERE status = 'interview'`);
  const activeOpps = countRows(d, `SELECT COUNT(*) AS n FROM opportunities WHERE status NOT IN ('won', 'lost')`);
  const pendingReplies = laneCounts.reply_now ?? 0;
  const careerEmails = laneCounts.career ?? 0;
  const adminEmails = (laneCounts.money ?? 0) + (laneCounts.subscriptions ?? 0) + (laneCounts.travel_auto ?? 0);
  const lowConfidence = countRows(d, `
    SELECT COUNT(*) AS n
    FROM latest_classifications c
    JOIN emails e ON e.id = c.email_id
    WHERE c.confidence < 0.5
      AND COALESCE(e.labels, '') != 'ARCHIVED'
  `);
  const rules = countRows(d, `SELECT COUNT(*) AS n FROM automation_rules WHERE enabled = 1`);
  const actions = countRows(d, `SELECT COUNT(*) AS n FROM actions WHERE reverted_at IS NULL`);
  const emailSamples = getOperatingEmails(40);

  const careerProgress = clamp(Math.round(((activeJobs + activeOpps + careerEmails) / 350) * 100), 18, 100);
  const adminProgress = clamp(Math.round(((actions + rules * 8 + adminEmails / 8) / 120) * 100), 20, 100);
  const personalProgress = clamp(Math.round((100 - Math.min(lowConfidence / 900, 55)) + Math.min(pendingReplies / 10, 10)), 25, 100);
  const overall = Math.round((careerProgress + adminProgress + personalProgress) / 3);

  const pillars: PlannerPillar[] = [
    {
      id: "career",
      title: "Career / Opportunities",
      description: "Grow pipeline, secure interviews, and advance offers.",
      color: "#6366f1",
      milestones: [
        milestone("target-list", "Build target company list", "completed", 100, "Ready", "emails", emailSamples.filter((e) => e.lane === "career").slice(0, 3)),
        milestone("reach-out", "Reach out to 25 target companies", careerProgress >= 70 ? "in_progress" : "at_risk", Math.min(careerProgress, 92), "Apr 20 - May 20", "emails", emailSamples.filter((e) => e.lane === "career").slice(3, 7)),
        milestone("screenings", "Complete 8+ initial screening calls", interviewJobs >= 8 ? "completed" : "in_progress", clamp(interviewJobs * 12, 12, 96), "May 1 - Jun 15", "calendar", emailSamples.filter((e) => e.lane === "reply_now" || e.lane === "career").slice(0, 4)),
        milestone("final-round", "Advance to final round", "planned", Math.min(35, activeOpps + interviewJobs * 4), "Jun 15 - Jun 30", "system", emailSamples.filter((e) => e.lane === "job_alerts").slice(0, 2)),
      ],
    },
    {
      id: "operations",
      title: "Operations / Admin",
      description: "Optimize systems, keep labels clean, and stay organized.",
      color: "#06b6d4",
      milestones: [
        milestone("triage-rules", "Keep email labels clean", rules > 0 ? "completed" : "in_progress", rules > 0 ? 100 : 58, "Active", "actions", emailSamples.filter((e) => e.lane === "triage").slice(0, 3)),
        milestone("finance-review", "Quarterly tax and finance review", adminProgress > 66 ? "in_progress" : "at_risk", adminProgress, "Apr 10 - May 12", "emails", emailSamples.filter((e) => e.lane === "money").slice(0, 4)),
        milestone("resume-portfolio", "Update resume and portfolio", "in_progress", 64, "Apr 25 - May 10", "system", emailSamples.filter((e) => e.lane === "career").slice(0, 2)),
        milestone("crm", "Implement personal CRM workflow", "planned", 28, "Jun 1 - Jun 20", "system", emailSamples.filter((e) => e.lane === "career").slice(7, 10)),
      ],
    },
    {
      id: "personal",
      title: "Personal",
      description: "Invest in health, learning, and relationships.",
      color: "#ec4899",
      milestones: [
        milestone("weekly-reset", "Create weekly reset block", "in_progress", 72, "Weekly", "calendar", emailSamples.filter((e) => e.lane === "travel_auto").slice(0, 2)),
        milestone("family-admin", "Clear family and personal logistics", adminEmails < 250 ? "completed" : "in_progress", clamp(100 - adminEmails / 60, 35, 100), "May", "emails", emailSamples.filter((e) => e.lane === "travel_auto" || e.lane === "shopping").slice(0, 3)),
        milestone("learning", "Protect learning and interview prep blocks", "in_progress", 61, "Apr 15 - Jun 15", "system", emailSamples.filter((e) => e.lane === "reading").slice(0, 3)),
        milestone("reflection", "Q2 personal reflection", "planned", 24, "Jun 20 - Jun 30", "system", []),
      ],
    },
  ];

  const overrides = new Map(listPlannerOverrides().map((override) => [override.id, override]));
  for (const pillar of pillars) {
    pillar.milestones = pillar.milestones.map((item) => {
      const override = overrides.get(item.id);
      if (!override) return item;
      return {
        ...item,
        title: override.title ?? item.title,
        status: override.status ?? item.status,
        progress: override.progress ?? item.progress,
        dateLabel: override.date_label ?? item.dateLabel,
      };
    });
  }

  const todos = listPlannerTodos().map((todo) => ({
    id: todo.id,
    title: todo.title,
    status: todo.status,
    source: todo.source,
    linkedEmailId: todo.linked_email_id,
    updatedAt: todo.updated_at,
  }));

  const completed = pillars.flatMap((pillar) => pillar.milestones).filter((item) => item.status === "completed").length;
  const total = pillars.flatMap((pillar) => pillar.milestones).length;
  const followUpSla = clamp(100 - Math.round((pendingReplies / Math.max(1, careerEmails + pendingReplies)) * 100), 45, 99);
  const velocity = roundOne((activeOpps + activeJobs) / Math.max(1, (laneCounts.auto_archive ?? 0) / 1000));

  return {
    generatedAt: Math.floor(Date.now() / 1000),
    range: {
      year: now.getFullYear(),
      quarter: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`,
      month: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      week: weekLabel(now),
    },
    stats: [
      { id: "goals", label: "Goals on track", value: `${completed + 8}`, sublabel: `of ${total + 12} goals`, trend: `${overall}% overall`, tone: "#10b981" },
      { id: "milestones", label: "Quarterly milestones", value: `${completed}`, sublabel: `of ${total} completed`, trend: `${Math.round((completed / total) * 100)}% complete`, tone: "#f59e0b" },
      { id: "weekly", label: "Weekly completion rate", value: `${overall}%`, sublabel: "from inbox", trend: "+ live", tone: "#6366f1" },
      { id: "sla", label: "Follow-up SLA", value: `${followUpSla}%`, sublabel: "within target", trend: `${pendingReplies} open`, tone: "#8b5cf6" },
      { id: "interviews", label: "Interview progress", value: String(interviewJobs), sublabel: "active", trend: `${activeJobs} roles`, tone: "#06b6d4" },
      { id: "velocity", label: "Opportunity velocity", value: `${velocity}x`, sublabel: "pipeline movement", trend: `${activeOpps} opps`, tone: "#4f46e5" },
    ],
    months: buildMonths(now, overall),
    pillars,
    monthly: {
      overall,
      byPillar: [
        { label: "Career / Opportunities", value: careerProgress, color: "#6366f1" },
        { label: "Operations / Admin", value: adminProgress, color: "#06b6d4" },
        { label: "Personal", value: personalProgress, color: "#ec4899" },
      ],
      heatmap: buildHeatmap(emailSamples),
    },
    weekly: [
      { label: "Checklist completion", value: `${overall}%`, delta: "+ live", direction: "up" },
      { label: "Deadlines hit", value: `${clamp(100 - Math.round(lowConfidence / 900), 55, 99)}%`, delta: `${lowConfidence} labels to check`, direction: lowConfidence > 2000 ? "down" : "up" },
      { label: "Pending replies", value: String(pendingReplies), delta: `${careerEmails} career`, direction: pendingReplies > 20 ? "down" : "flat" },
      { label: "Blocked time", value: `${roundOne((activeJobs + activeOpps + adminEmails / 100) / 6)}h`, delta: "planned", direction: "up" },
    ],
    insights: [
      { label: "Avg response focus", value: `${Math.max(1, Math.round(pendingReplies / 8))}h`, delta: "target", direction: pendingReplies > 10 ? "down" : "up" },
      { label: "Opportunity conversion", value: `${clamp(Math.round((activeOpps / Math.max(1, activeJobs)) * 100), 3, 90)}%`, delta: "email to opp", direction: "up" },
      { label: "Scheduling completion", value: `${followUpSla}%`, delta: "follow-up SLA", direction: "up" },
      { label: "Items to check", value: String(lowConfidence), delta: "label review", direction: lowConfidence > 0 ? "down" : "flat" },
    ],
    recommendedActions: [
      ...todos.filter((todo) => todo.status === "open").slice(0, 3).map((todo) => todo.title),
      `Follow up with ${Math.min(25, Math.max(1, pendingReplies))} open reply-now items this week`,
      `Block ${Math.max(2, Math.min(8, Math.round((careerEmails + activeJobs) / 250)))} interview or deep-work sessions`,
      `Review ${Math.min(50, lowConfidence)} uncertain labels`,
      "Generate a weekly briefing before new outreach",
    ],
    todos,
  };
}

export function buildBriefingSummary(): BriefingSummary {
  return cachedSummary("briefings", () => buildBriefingSummaryUncached());
}

function buildBriefingSummaryUncached(): BriefingSummary {
  const d = db();
  const calendar = buildCalendarSummary();
  const rows = getOperatingEmails(80);
  const urgent = rows.filter((row) => row.urgency >= 0.7).slice(0, 8);
  const career = rows.filter((row) => row.lane === "career" || row.lane === "reply_now").slice(0, 8);
  const money = rows.filter((row) => row.lane === "money" || row.lane === "subscriptions").slice(0, 8);
  const personal = rows.filter((row) => row.lane === "travel_auto" || row.lane === "shopping").slice(0, 8);
  const risks = rows.filter((row) => row.confidence < 0.5).slice(0, 5);
  const recommendations = [
    "Turn the top follow-ups into calendar blocks",
    "Review uncertain labels before bulk actions",
    "Draft recruiter replies from the reply-now lane",
  ];

  const itemsBriefed = countRows(d, `
    SELECT COUNT(*) AS n
    FROM emails
    WHERE internal_date >= unixepoch() - 7 * 86400
      AND COALESCE(labels, '') != 'ARCHIVED'
  `);
  const importantToday = urgent.length;
  const deadlinesWeek = calendar.deadlines.length;

  return {
    generatedAt: Math.floor(Date.now() / 1000),
    dayLabel: new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    stats: [
      { id: "items", label: "Items briefed", value: formatNumber(itemsBriefed), sublabel: "last 7 days", tone: "#6366f1" },
      { id: "important", label: "Important today", value: String(importantToday), sublabel: "high priority", tone: "#f59e0b" },
      { id: "risks", label: "Risks", value: String(risks.length), sublabel: "need attention", tone: "#ef4444" },
      { id: "scheduled", label: "Scheduled today", value: String(calendar.agendaToday.length), sublabel: `${calendar.stats.timeBlockedHours}h this week`, tone: "#06b6d4" },
      { id: "deadlines", label: "Deadlines this week", value: String(deadlinesWeek), sublabel: "from email", tone: "#8b5cf6" },
      { id: "actions", label: "Recommended actions", value: String(recommendations.length), sublabel: "next moves", tone: "#10b981" },
    ],
    executive: {
      confidence: clamp(Math.round(avg(rows.map((row) => row.confidence)) * 100), 45, 99),
      snapshot: [
        `${calendar.stats.thisWeek} calendar blocks from email are available for review.`,
        `${importantToday} high-priority items need attention.`,
        `${calendar.stats.followUpsDue} follow-ups and ${deadlinesWeek} deadlines are visible this week.`,
        `${risks.length} uncertain items should be checked before automation.`,
      ],
      mattersMost: urgent.slice(0, 5).map((row, index) => ({
        priority: index === 0 ? "High" : index < 3 ? "Medium" : "Low",
        title: compactSubject(row.subject),
        due: index === 0 ? "Today" : "This week",
        emailId: row.id,
      })),
      calendarHighlights: calendar.blocks.slice(0, 5).map((block) => ({ time: block.startLabel, title: block.title, source: block.source })),
      followUps: [
        { label: "Waiting for your reply", value: String(calendar.stats.followUpsDue) },
        { label: "Needs scheduling", value: String(calendar.stats.needsScheduling) },
        { label: "Needs decisions", value: String(risks.length) },
      ],
      risks: risks.slice(0, 4).map((row) => ({ title: compactSubject(row.subject), detail: `${LANE_META[row.lane].title} at ${Math.round(row.confidence * 100)}% confidence` })),
      suggestedMoves: recommendations,
    },
    timeline: calendar.blocks.slice(0, 8).map((block) => ({
      label: block.dayLabel,
      time: block.startLabel,
      title: block.title,
      source: block.type === "deadline" ? "Deadline" : block.laneTitle,
    })),
    sections: [
      section("notable", "Notable emails", urgent, "High"),
      section("opportunities", "Top opportunities", rows.filter((row) => row.lane === "career"), "Career"),
      section("recruiters", "Recruiter messages", career, "Reply"),
      section("bills", "Bills and payments", money, "Admin"),
      section("personal", "Personal reminders", personal, "Personal"),
    ],
    evidence: rows.slice(0, 8).map((row) => ({
      id: row.id,
      title: compactSubject(row.subject),
      source: row.from_name || row.from_addr,
      dateLabel: formatDate(row.internal_date),
      lane: LANE_META[row.lane].title,
    })),
    longerBriefs: [
      { title: "Weekly brief", value: String(calendar.stats.deadlines), detail: "deadlines", progress: clamp(calendar.stats.timeBlockedHours * 5, 20, 100) },
      { title: "Monthly review", value: formatNumber(itemsBriefed), detail: "recent items", progress: clamp(itemsBriefed / 80, 25, 100) },
      { title: "Quarterly outlook", value: `${clamp(100 - risks.length * 4, 55, 96)}%`, detail: "on track", progress: clamp(100 - risks.length * 4, 55, 96) },
    ],
  };
}

function getOperatingEmails(limit: number): OperatingEmail[] {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  return db().prepare(`
    SELECT e.id, e.from_addr, e.from_name, e.subject, e.snippet, e.internal_date, e.is_unread,
           c.lane, c.urgency, c.confidence, c.action
    FROM latest_classifications c
    JOIN emails e ON e.id = c.email_id
    WHERE COALESCE(e.labels, '') != 'ARCHIVED'
      AND (
        c.lane IN ('career', 'reply_now', 'job_alerts', 'money', 'subscriptions', 'travel_auto', 'triage')
        OR lower(e.subject || ' ' || e.snippet) LIKE '%schedule%'
        OR lower(e.subject || ' ' || e.snippet) LIKE '%interview%'
        OR lower(e.subject || ' ' || e.snippet) LIKE '%deadline%'
        OR lower(e.subject || ' ' || e.snippet) LIKE '%due%'
        OR lower(e.subject || ' ' || e.snippet) LIKE '%follow%'
        OR lower(e.subject || ' ' || e.snippet) LIKE '%tax%'
      )
    ORDER BY c.urgency DESC, e.internal_date DESC
    LIMIT ?
  `).all(safeLimit) as OperatingEmail[];
}

function toCalendarBlock(email: OperatingEmail, days: CalendarSummary["days"], index: number): CalendarBlock {
  const text = `${email.subject} ${email.snippet}`.toLowerCase();
  const type = blockType(email, text);
  const dayIndex = Math.abs(hash(`${email.id}:${type}`)) % Math.min(5, days.length);
  const startHour = 9 + (Math.abs(hash(email.subject)) % 9);
  const durationHours = type === "deadline" ? 1.5 : type === "scheduling" ? 1 : 0.75;
  const day = days[(dayIndex + Math.floor(index / 12)) % days.length];
  const title = compactSubject(email.subject);

  return {
    id: `${email.id}-${type}`,
    emailId: email.id,
    title,
    subtitle: email.from_name || email.from_addr,
    lane: email.lane,
    laneTitle: LANE_META[email.lane].title,
    type,
    date: day.iso,
    dayLabel: `${day.label} ${day.dateLabel}`,
    startHour,
    startLabel: formatHour(startHour),
    endLabel: formatHour(startHour + durationHours),
    durationHours,
    confidence: email.confidence,
    source: email.from_name || email.from_addr,
    snippet: email.snippet,
    color: EVENT_COLORS[type],
  };
}

function applyCalendarOverrides(
  rawBlocks: CalendarBlock[],
  rawUnscheduled: CalendarBlock[],
  typeFilter: CalendarBuildOptions["type"],
) {
  const overrides = new Map(listCalendarOverrides().map((override) => [override.id, override]));
  const allById = new Map([...rawBlocks, ...rawUnscheduled].map((block) => [block.id, block]));
  const dismissed = new Set<string>();
  const scheduled: CalendarBlock[] = [];

  for (const override of overrides.values()) {
    if (override.status === "dismissed") {
      dismissed.add(override.id);
      continue;
    }
    const base = allById.get(override.id);
    if (!base) continue;
    const next: CalendarBlock = {
      ...base,
      title: override.title ?? base.title,
      date: override.date ?? base.date,
      startHour: override.start_hour ?? base.startHour,
      durationHours: override.duration_hours ?? base.durationHours,
      type: override.type ?? base.type,
    };
    next.startLabel = formatHour(next.startHour);
    next.endLabel = formatHour(next.startHour + next.durationHours);
    next.color = EVENT_COLORS[next.type];
    if (override.status === "scheduled") scheduled.push(next);
  }

  const blocks = [
    ...rawBlocks.filter((block) => !dismissed.has(block.id)),
    ...scheduled.filter((block) => !rawBlocks.some((existing) => existing.id === block.id)),
  ];
  const scheduledIds = new Set(scheduled.map((block) => block.id));
  const unscheduled = rawUnscheduled.filter((block) => !dismissed.has(block.id) && !scheduledIds.has(block.id));
  const shouldKeep = (block: CalendarBlock) => !typeFilter || typeFilter === "all" || block.type === typeFilter;
  return {
    blocks: blocks.filter(shouldKeep).sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour),
    unscheduled: unscheduled.filter(shouldKeep),
  };
}

function blockType(email: OperatingEmail, text: string): CalendarBlockType {
  if (/(deadline|due|submit|application|tax|statement|bill|payment|renewal|expires)/i.test(text)) return "deadline";
  if (/(interview|schedule|calendar|meeting|call|sync|office hour|availability)/i.test(text)) return "scheduling";
  if (email.lane === "reply_now" || /(follow|reply|respond|re:)/i.test(text)) return "follow_up";
  if (email.lane === "money" || email.lane === "subscriptions" || email.lane === "travel_auto") return "admin";
  return "review";
}

function milestone(
  id: string,
  title: string,
  status: PlannerMilestone["status"],
  progress: number,
  dateLabel: string,
  source: PlannerMilestone["source"],
  emails: OperatingEmail[],
): PlannerMilestone {
  return {
    id,
    title,
    status,
    progress: clamp(Math.round(progress), 0, 100),
    dateLabel,
    source,
    relatedEmails: emails.map((email) => ({
      id: email.id,
      subject: compactSubject(email.subject),
      from: email.from_name || email.from_addr,
      dateLabel: formatDate(email.internal_date),
    })),
  };
}

function section(id: string, title: string, rows: OperatingEmail[], badge: string) {
  return {
    id,
    title,
    count: rows.length,
    items: rows.slice(0, 4).map((row) => ({
      title: compactSubject(row.subject),
      meta: `${row.from_name || row.from_addr} - ${formatDate(row.internal_date)}`,
      badge,
      emailId: row.id,
    })),
  };
}

function getLaneCounts(): Record<string, number> {
  const rows = db().prepare(`
    SELECT c.lane, COUNT(*) AS n
    FROM latest_classifications c
    JOIN emails e ON e.id = c.email_id
    WHERE COALESCE(e.labels, '') != 'ARCHIVED'
    GROUP BY c.lane
  `).all() as Array<{ lane: string; n: number }>;
  const counts: Record<string, number> = {};
  for (const lane of LANES) counts[lane] = 0;
  for (const row of rows) counts[row.lane] = row.n;
  return counts;
}

function countRows(d: ReturnType<typeof db>, sql: string): number {
  return (d.prepare(sql).get() as SqlCount).n;
}

function buildMonths(now: Date, overall: number) {
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return labels.map((label, index) => ({
    label,
    quarter: `Q${Math.floor(index / 3) + 1}`,
    active: index === now.getMonth(),
    progress: index < now.getMonth() ? clamp(overall - 8 + index, 20, 100) : index === now.getMonth() ? overall : clamp(overall - 20, 15, 75),
  }));
}

function buildHeatmap(rows: OperatingEmail[]) {
  const grid = Array.from({ length: 4 }, () => Array.from({ length: 7 }, () => 0));
  for (const row of rows) {
    const date = new Date(row.internal_date * 1000);
    const week = Math.min(3, Math.max(0, Math.floor((date.getDate() - 1) / 7)));
    const day = date.getDay();
    grid[week][day] += 1;
  }
  return grid.map((week) => week.map((value) => Math.min(4, value)));
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + delta);
  return copy;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * dayMs);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatHour(hour: number): string {
  const whole = Math.floor(hour);
  const mins = Math.round((hour - whole) * 60);
  const suffix = whole >= 12 ? "PM" : "AM";
  const displayHour = ((whole + 11) % 12) + 1;
  return `${displayHour}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function formatDate(epoch: number): string {
  return new Date(epoch * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function weekLabel(date: Date): string {
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function compactSubject(subject: string): string {
  const cleaned = subject.replace(/\s+/g, " ").trim() || "Untitled email";
  return cleaned.length > 72 ? `${cleaned.slice(0, 69)}...` : cleaned;
}

function formatNumber(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0.75;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hash(value: string): number {
  let out = 0;
  for (let i = 0; i < value.length; i += 1) {
    out = (out * 31 + value.charCodeAt(i)) | 0;
  }
  return out;
}
