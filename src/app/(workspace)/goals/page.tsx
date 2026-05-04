"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Flag,
  ListChecks,
  Mail,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useCachedJson } from "@/lib/client-cache";
import type { PlannerMilestone, PlannerPillar, PlannerSummary } from "@/lib/operating-system";
import { ThreadView } from "@/components/inbox/ThreadView";

const horizons = ["Annual", "Quarter", "Month", "Week", "Todos"] as const;
type Horizon = (typeof horizons)[number];

type GoalRow = {
  milestone: PlannerMilestone;
  pillar: PlannerPillar;
};

export default function GoalsPage() {
  const searchParams = useSearchParams();
  const domain = searchParams.get("domain");
  const view = searchParams.get("view");
  const domainFilter = domain === "career" ? "career" : domain === "admin" ? "operations" : domain === "personal" ? "personal" : null;
  const { data: summary, loading, refresh } = useCachedJson<PlannerSummary>("planner:summary", "/api/planner", { ttlMs: 90_000 });
  const [horizon, setHorizon] = useState<Horizon>(view === "analytics" ? "Month" : "Quarter");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openedEmail, setOpenedEmail] = useState<any | null>(null);

  const rows = useMemo<GoalRow[]>(() => {
    if (!summary) return [];
    const limit = horizon === "Annual" ? 4 : horizon === "Quarter" ? 4 : horizon === "Month" ? 3 : horizon === "Week" ? 2 : 3;
    const pillars = domainFilter ? summary.pillars.filter((pillar) => pillar.id === domainFilter) : summary.pillars;
    return pillars.flatMap((pillar) =>
      pillar.milestones.slice(0, limit).map((milestone) => ({ milestone, pillar })),
    );
  }, [domainFilter, horizon, summary]);

  const selected = useMemo(() => {
    if (!summary) return null;
    const milestones = rows.map((row) => row.milestone);
    return milestones.find((milestone) => milestone.id === selectedId) ?? rows[0]?.milestone ?? milestones[0] ?? null;
  }, [rows, selectedId, summary]);

  if (loading && !summary) return <GoalsSkeleton />;

  if (!summary) {
    return (
      <div className="p-5">
        <div className="section-frame p-6 text-[13px]">Goals data could not load.</div>
      </div>
    );
  }

  const primaryStats = summary.stats.slice(0, 4);

  async function saveMilestone(input: { id: string; title: string; status: PlannerMilestone["status"]; progress: number; dateLabel: string }) {
    await fetch("/api/planner", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "ok", text: "Goal updated" } }));
    void refresh(true);
  }

  async function createTodo(title: string) {
    await fetch("/api/planner", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, source: "manual" }),
    });
    window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "ok", text: "Todo added" } }));
    setHorizon("Todos");
    void refresh(true);
  }

  async function toggleTodo(id: string, status: "open" | "done") {
    await fetch("/api/planner", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "todo", id, status }),
    });
    window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "ok", text: status === "done" ? "Todo completed" : "Todo reopened" } }));
    void refresh(true);
  }

  async function deleteTodo(id: string) {
    await fetch("/api/planner", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "ok", text: "Todo removed" } }));
    void refresh(true);
  }

  return (
    <div className="workspace-page space-y-3 p-4 xl:p-5" data-testid="goals-view">
      <header className="workspace-hero p-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(360px,1fr)_auto] xl:items-center">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-[var(--accent-50)] px-2 py-1 text-[11px] font-medium text-[var(--accent-600)]">
              <Target className="h-3.5 w-3.5" />
              Goals and todos
            </div>
            <h1 className="text-[20px] font-semibold leading-tight">{domainTitle(domainFilter, view)}</h1>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[var(--text-dim)]">
              {domainDescription(domainFilter, view)}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-[var(--text-dim)]">
              {primaryStats.map((stat) => (
                <span key={stat.id}>
                  <span className="font-semibold text-[var(--text)]">{stat.value}</span> {friendlyStatLabel(stat.label)}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {horizons.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setHorizon(item)}
                className="h-8 rounded-md border px-3 text-[12px] font-medium"
                style={{
                  borderColor: "var(--border)",
                  background: horizon === item ? "var(--accent)" : "white",
                  color: horizon === item ? "white" : "var(--text-dim)",
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid gap-3 xl:grid-cols-[minmax(720px,1fr)_340px]">
        <section className="section-frame overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "var(--border-muted)" }}>
            <div>
              <div className="text-[14px] font-semibold">{domainFilter ? `${domainTitle(domainFilter)} - ${horizonTitle(summary, horizon)}` : horizonTitle(summary, horizon)}</div>
              <div className="text-[11px] text-[var(--text-dim)]">{horizonDescription(horizon)}</div>
            </div>
            <Link href="/calendar" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent-600)]">
              Open calendar
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {horizon === "Todos" ? (
            <TodoList summary={summary} onCreate={createTodo} onToggle={toggleTodo} onDelete={deleteTodo} />
          ) : (
            <GoalTable rows={rows} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          )}
        </section>

        <aside className="space-y-3">
          <section className="inspector-panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <Target className="h-4 w-4 text-[var(--accent-600)]" />
              <div className="text-[13px] font-semibold">Selected goal</div>
            </div>
            {selected && (
              <MilestoneFocus
                milestone={selected}
                onSave={saveMilestone}
                onOpenEmail={(email) => setOpenedEmail(emailToThread(email))}
              />
            )}
          </section>

          <section className="inspector-panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[var(--accent-600)]" />
              <div className="text-[13px] font-semibold">Agent next moves</div>
            </div>
            <div className="mb-3 rounded-md bg-[var(--bg-subtle)] px-3 py-2 text-[11px] leading-snug text-[var(--text-dim)]">
              These are drafts only. You approve before any email, calendar, or mailbox action changes.
            </div>
            <div className="space-y-2">
              {summary.recommendedActions.slice(0, 4).map((action, index) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("workspace:agent-focus", {
                    detail: { prompt: `Review this goal recommendation and propose the next concrete action: ${action}` },
                  }))}
                  className="flex w-full gap-3 rounded-md border bg-white p-3 text-left text-[12px] hover:bg-[var(--bg-subtle)]"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="font-mono text-[var(--accent-600)]">{index + 1}</span>
                  <span className="leading-snug [overflow-wrap:anywhere]">{action}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="inspector-panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-[var(--accent-600)]" />
              <div className="text-[13px] font-semibold">Week summary</div>
            </div>
            <div className="space-y-3">
              {summary.weekly.map((item) => (
                <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-[12px]">
                  <div className="truncate text-[var(--text-dim)]">{item.label}</div>
                  <div className="font-semibold">{item.value}</div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <section className="section-frame p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[14px] font-semibold">Progress overview</div>
            <div className="text-[11px] text-[var(--text-dim)]">Month-by-month progress and active areas, kept below the tracker.</div>
          </div>
          <Link href="/inbox" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent-600)]">
            Review evidence
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <MonthRail summary={summary} />
          <PillarProgress summary={summary} />
        </div>
      </section>
      {openedEmail && <ThreadView thread={openedEmail} onClose={() => setOpenedEmail(null)} />}
    </div>
  );
}

function GoalTable({ rows, selectedId, onSelect }: {
  rows: GoalRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[780px]">
        <div className="grid grid-cols-[150px_minmax(260px,1fr)_120px_100px_86px_92px] border-b bg-[var(--bg-subtle)] px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-dim)]" style={{ borderColor: "var(--border-muted)" }}>
          <div>Area</div>
          <div>Goal</div>
          <div>Status</div>
          <div>Progress</div>
          <div>Due</div>
          <div>Evidence</div>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--border-muted)" }}>
          {rows.map(({ milestone, pillar }) => {
            const selected = milestone.id === selectedId;
            return (
              <button
                key={milestone.id}
                type="button"
                onClick={() => onSelect(milestone.id)}
                className="grid w-full grid-cols-[150px_minmax(260px,1fr)_120px_100px_86px_92px] items-center gap-0 px-4 py-3 text-left text-[12px] transition-colors hover:bg-[var(--bg-subtle)]"
                style={{ background: selected ? "var(--accent-50)" : "white" }}
              >
                <div className="flex min-w-0 items-center gap-2 pr-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: pillar.color }} />
                  <span className="truncate font-medium" style={{ color: pillar.color }}>{pillar.title}</span>
                </div>
                <div className="min-w-0 pr-3">
                  <div className="line-clamp-1 font-semibold [overflow-wrap:anywhere]">{milestone.title}</div>
                  <div className="mt-1 line-clamp-1 text-[11px] text-[var(--text-dim)]">{pillar.description}</div>
                </div>
                <div><StatusPill status={milestone.status} /></div>
                <div className="pr-4">
                  <ProgressBar value={milestone.progress} color={statusColor(milestone.status)} />
                </div>
                <div className="text-[11px] text-[var(--text-dim)]">{milestone.dateLabel}</div>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-dim)]">
                  <Mail className="h-3.5 w-3.5" />
                  {milestone.relatedEmails.length}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TodoList({ summary, onCreate, onToggle, onDelete }: {
  summary: PlannerSummary;
  onCreate: (title: string) => Promise<void>;
  onToggle: (id: string, status: "open" | "done") => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const todoRows = [
    ...summary.todos.map((item) => ({ id: item.id, title: item.title, source: item.source, status: item.status, tone: item.status === "done" ? "#10b981" : "#6366f1", persisted: true })),
    ...summary.recommendedActions.slice(0, 4).map((item, index) => ({ id: `suggestion-${index}`, title: item, source: "Agent suggestion", status: "open" as const, tone: "#f59e0b", persisted: false })),
  ];

  return (
    <div>
      <form
        className="flex gap-2 border-b p-4"
        style={{ borderColor: "var(--border-muted)" }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) return;
          void onCreate(title.trim()).then(() => setTitle(""));
        }}
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a concrete next action..."
          className="h-9 min-w-0 flex-1 rounded-md border bg-white px-3 text-[13px] outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-40"
          style={{ borderColor: "var(--border)" }}
        />
        <button type="submit" className="rounded-md bg-[var(--accent)] px-4 text-[12px] font-medium text-white">Add</button>
      </form>
      <div className="divide-y" style={{ borderColor: "var(--border-muted)" }}>
      {todoRows.map((item, index) => (
        <div
          key={`${item.title}-${index}`}
          className="grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left"
        >
          <button
            type="button"
            onClick={() => item.persisted ? void onToggle(item.id, item.status === "done" ? "open" : "done") : window.dispatchEvent(new CustomEvent("workspace:agent-focus", {
              detail: { prompt: `Turn this into a concrete next action: ${item.title}` },
            }))}
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{ background: `${item.tone}18`, color: item.tone }}
            aria-label={item.status === "done" ? "Reopen todo" : "Complete todo"}
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>
          <span className="min-w-0">
            <span className={`block text-[13px] font-semibold [overflow-wrap:anywhere] ${item.status === "done" ? "text-[var(--text-muted)] line-through" : ""}`}>{item.title}</span>
            <span className="mt-1 block text-[11px] text-[var(--text-dim)]">{item.source}</span>
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("workspace:agent-focus", {
                detail: { prompt: `Help me execute or refine this todo: ${item.title}` },
              }))}
              className="rounded-md p-2 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--accent-600)]"
              aria-label="Ask agent about todo"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            {item.persisted && (
              <button
                type="button"
                onClick={() => void onDelete(item.id)}
                className="rounded-md p-2 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--err)]"
                aria-label="Remove todo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </div>
      ))}
      </div>
    </div>
  );
}

function MilestoneFocus({ milestone, onSave, onOpenEmail }: {
  milestone: PlannerMilestone;
  onSave: (input: { id: string; title: string; status: PlannerMilestone["status"]; progress: number; dateLabel: string }) => Promise<void>;
  onOpenEmail: (email: PlannerMilestone["relatedEmails"][number]) => void;
}) {
  const [title, setTitle] = useState(milestone.title);
  const [status, setStatus] = useState<PlannerMilestone["status"]>(milestone.status);
  const [progress, setProgress] = useState(milestone.progress);
  const [dateLabel, setDateLabel] = useState(milestone.dateLabel);

  useEffect(() => {
    setTitle(milestone.title);
    setStatus(milestone.status);
    setProgress(milestone.progress);
    setDateLabel(milestone.dateLabel);
  }, [milestone]);

  return (
    <div>
      <StatusPill status={status} />
      <label className="mt-3 block">
        <span className="mb-1 block text-[10px] uppercase text-[var(--text-dim)]">Goal</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-md border bg-white px-2 py-2 text-[13px] font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-40"
          style={{ borderColor: "var(--border)" }}
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label>
          <span className="mb-1 block text-[10px] uppercase text-[var(--text-dim)]">Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as PlannerMilestone["status"])}
            className="h-8 w-full rounded-md border bg-white px-2 text-[12px]"
            style={{ borderColor: "var(--border)" }}
          >
            <option value="completed">Completed</option>
            <option value="in_progress">In progress</option>
            <option value="planned">Planned</option>
            <option value="at_risk">At risk</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[10px] uppercase text-[var(--text-dim)]">Due</span>
          <input
            value={dateLabel}
            onChange={(event) => setDateLabel(event.target.value)}
            className="h-8 w-full rounded-md border bg-white px-2 text-[12px]"
            style={{ borderColor: "var(--border)" }}
          />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="mb-1 block text-[10px] uppercase text-[var(--text-dim)]">Progress {progress}%</span>
        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          onChange={(event) => setProgress(Number(event.target.value))}
          className="w-full"
        />
      </label>
      <ProgressBar value={progress} color={statusColor(status)} />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onSave({ id: milestone.id, title, status, progress, dateLabel })}
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-[12px] font-medium text-white"
        >
          Save goal
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("workspace:agent-focus", {
            detail: { prompt: `Help me advance this goal: ${title}` },
          }))}
          className="rounded-md border px-3 py-2 text-[12px] font-medium text-[var(--accent-600)]"
          style={{ borderColor: "var(--border)" }}
        >
          Ask agent
        </button>
      </div>
      <div className="mt-4 text-[12px] font-semibold">Related emails</div>
      <div className="mt-2 space-y-2">
        {milestone.relatedEmails.length === 0 && <div className="rounded-md bg-[var(--bg-subtle)] p-3 text-[12px] text-[var(--text-dim)]">No related emails yet.</div>}
        {milestone.relatedEmails.slice(0, 4).map((email) => (
          <button key={email.id} type="button" onClick={() => onOpenEmail(email)} className="block w-full rounded-md border bg-white p-3 text-left hover:bg-[var(--bg-subtle)]" style={{ borderColor: "var(--border)" }}>
            <div className="text-[11px] font-medium leading-snug [overflow-wrap:anywhere]">{email.subject}</div>
            <div className="mt-1 text-[10px] text-[var(--text-dim)]">{email.from} - {email.dateLabel}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function emailToThread(email: PlannerMilestone["relatedEmails"][number]) {
  return {
    id: email.id,
    subject: email.subject,
    from_name: email.from,
    from_addr: email.from,
    snippet: email.subject,
    internal_date: Math.floor(Date.now() / 1000),
    lane: "career",
    urgency: 0.65,
    confidence: 0.9,
    action: "review",
  };
}

function MonthRail({ summary }: { summary: PlannerSummary }) {
  return (
    <div className="grid grid-cols-6 gap-2 xl:grid-cols-12">
      {summary.months.map((month) => (
        <div key={month.label} className="rounded-md border bg-white p-2 text-center" style={{ borderColor: month.active ? "var(--accent)" : "var(--border)" }}>
          <div className="text-[10px] text-[var(--text-dim)]">{month.quarter}</div>
          <div className={`mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ${month.active ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-subtle)]"}`}>
            {month.label}
          </div>
          <ProgressBar value={month.progress} color="var(--accent)" />
        </div>
      ))}
    </div>
  );
}

function PillarProgress({ summary }: { summary: PlannerSummary }) {
  return (
    <div className="rounded-md border bg-white p-4" style={{ borderColor: "var(--border)" }}>
      <div className="mb-3 flex items-center gap-2">
        <Flag className="h-4 w-4 text-[var(--accent-600)]" />
        <div className="text-[13px] font-semibold">Progress by area</div>
      </div>
      <div className="space-y-3">
        {summary.monthly.byPillar.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex justify-between gap-2 text-[11px]">
              <span className="truncate">{item.label}</span>
              <span>{item.value}%</span>
            </div>
            <ProgressBar value={item.value} color={item.color} />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: PlannerMilestone["status"] }) {
  const color = statusColor(status);
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize" style={{ color, background: `${color}14` }}>
      {status.replace("_", " ")}
    </span>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border-muted)]">
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

function statusColor(status: PlannerMilestone["status"]) {
  if (status === "completed") return "#10b981";
  if (status === "planned") return "#6366f1";
  if (status === "at_risk") return "#ef4444";
  return "#f59e0b";
}

function friendlyStatLabel(label: string) {
  if (label === "Follow-up SLA") return "reply speed";
  if (label === "Quarterly milestones") return "quarter checkpoints";
  if (label === "Weekly completion rate") return "week complete";
  if (label === "Interview progress") return "interviews";
  return label.toLowerCase();
}

function horizonTitle(summary: PlannerSummary, horizon: Horizon) {
  if (horizon === "Annual") return `${summary.range.year} operating plan`;
  if (horizon === "Quarter") return `${summary.range.quarter} goals`;
  if (horizon === "Month") return `${summary.range.month} plan`;
  if (horizon === "Week") return summary.range.week;
  return "Todos";
}

function horizonDescription(horizon: Horizon) {
  if (horizon === "Annual") return "North-star outcomes and the pillars that compound across the year.";
  if (horizon === "Quarter") return "Milestones that should move before the quarter closes.";
  if (horizon === "Month") return "The active month, compressed into only the milestones that need attention.";
  if (horizon === "Week") return "A weekly execution view for follow-ups, deadlines, and blocked time.";
  return "Actionable tasks derived from goals, email, and calendar evidence.";
}

function domainTitle(domain: string | null, view?: string | null) {
  if (view === "analytics") return "Progress Analytics";
  if (domain === "career") return "Career Plan";
  if (domain === "operations") return "Admin Plan";
  if (domain === "personal") return "Personal Plan";
  return "Operating Plan";
}

function domainDescription(domain: string | null, view?: string | null) {
  if (view === "analytics") return "Review progress signals, completion, evidence, and weekly movement without opening a separate analytics dashboard.";
  if (domain === "career") return "Track recruiter threads, job emails, interviews, opportunities, and resume-driven next steps.";
  if (domain === "operations") return "Track bills, tax evidence, label quality, subscriptions, travel, and system maintenance.";
  if (domain === "personal") return "Track personal logistics, weekly reset, learning, and health routines.";
  return "Track the few outcomes that matter, then open the evidence emails or ask the agent for a draft plan.";
}

function GoalsSkeleton() {
  return (
    <div className="space-y-4 p-4 xl:p-5" data-testid="goals-loading">
      <div className="skeleton h-28 rounded-lg" />
      <div className="skeleton h-[520px] rounded-lg" />
    </div>
  );
}
