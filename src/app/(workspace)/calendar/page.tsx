"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  Flag,
  Mail,
  RefreshCw,
} from "lucide-react";
import { useCachedJson } from "@/lib/client-cache";
import { ThreadView } from "@/components/inbox/ThreadView";

type CalendarBlockType = "scheduling" | "deadline" | "follow_up" | "review" | "admin";

type CalendarBlock = {
  id: string;
  emailId: string;
  title: string;
  subtitle: string;
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

type CalendarSummary = {
  generatedAt: number;
  range: { weekStart: string; weekEnd: string; monthLabel: string; today: string };
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

const viewModes = ["Week", "Day"] as const;
const typeFilters = [
  { id: "all", label: "All" },
  { id: "scheduling", label: "Scheduling" },
  { id: "deadline", label: "Deadlines" },
  { id: "follow_up", label: "Follow-ups" },
  { id: "admin", label: "Admin" },
] as const;

export default function CalendarPage() {
  const [view, setView] = useState<(typeof viewModes)[number]>("Week");
  const [anchorDate, setAnchorDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [typeFilter, setTypeFilter] = useState<(typeof typeFilters)[number]["id"]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openedEmail, setOpenedEmail] = useState<any | null>(null);
  const calendarUrl = `/api/calendar?date=${encodeURIComponent(anchorDate)}&type=${encodeURIComponent(typeFilter)}`;
  const { data: summary, loading, refresh } = useCachedJson<CalendarSummary>(`calendar:summary:${anchorDate}:${typeFilter}`, calendarUrl, { ttlMs: 60_000 });

  useEffect(() => {
    if (summary && !selectedId) setSelectedId(summary.blocks[0]?.id ?? null);
  }, [selectedId, summary]);

  function load() {
    void refresh(true).then((payload) => {
      if (payload) setSelectedId(payload.blocks[0]?.id ?? null);
    });
  }

  const selected = useMemo(() => {
    if (!summary) return null;
    return [...summary.blocks, ...summary.unscheduled].find((block) => block.id === selectedId) ?? summary.blocks[0] ?? null;
  }, [selectedId, summary]);
  const displayedSummary = useMemo(() => {
    if (!summary || view === "Week") return summary;
    const selectedDay = summary.days.find((day) => day.iso === anchorDate) ?? summary.days.find((day) => day.isToday) ?? summary.days[0];
    return { ...summary, days: selectedDay ? [selectedDay] : summary.days.slice(0, 1) };
  }, [anchorDate, summary, view]);

  async function patchBlock(block: CalendarBlock, status: "scheduled" | "dismissed") {
    await fetch("/api/calendar", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: block.id,
        emailId: block.emailId,
        title: block.title,
        date: block.date,
        startHour: block.startHour,
        durationHours: block.durationHours,
        type: block.type,
        status,
      }),
    });
    window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "ok", text: status === "scheduled" ? "Saved local calendar block" : "Dismissed suggestion" } }));
    void refresh(true);
  }

  if (loading && !summary) return <CalendarSkeleton />;

  if (!summary) {
    return (
      <div className="p-6">
        <div className="rounded-xl border bg-[var(--bg-elev)] p-6 text-[13px]" style={{ borderColor: "var(--border)" }}>
          Calendar data could not load.
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-page space-y-4 p-4 xl:p-5" data-testid="calendar-view">
      <header className="workspace-hero flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-[20px] font-semibold leading-tight">Calendar</h1>
          <p className="mt-1 text-[12px] text-[var(--text-dim)]">
            Turn email into time blocks. Review suggestions here, then approve scheduling changes.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-[var(--text-dim)]">
            <span><strong className="text-[var(--text)]">{summary.stats.thisWeek}</strong> this week</span>
            <span><strong className="text-[var(--text)]">{summary.stats.needsScheduling}</strong> need scheduling</span>
            <span><strong className="text-[var(--text)]">{summary.stats.deadlines}</strong> deadlines</span>
            <span><strong className="text-[var(--text)]">{summary.stats.timeBlockedHours}h</strong> blocked</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAnchorDate(addDaysIso(anchorDate, view === "Week" ? -7 : -1))} className="rounded-md border p-2 hover:bg-[var(--bg-subtle)]" style={{ borderColor: "var(--border)" }} aria-label="Previous period">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-44 text-center text-[12px] font-medium">
            {formatRange(summary.range.weekStart, summary.range.weekEnd)}
          </div>
          <button onClick={() => setAnchorDate(addDaysIso(anchorDate, view === "Week" ? 7 : 1))} className="rounded-md border p-2 hover:bg-[var(--bg-subtle)]" style={{ borderColor: "var(--border)" }} aria-label="Next period">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={load}
            className="rounded-md border p-2 hover:bg-[var(--bg-subtle)]"
            style={{ borderColor: "var(--border)" }}
            aria-label="Refresh calendar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid gap-3 xl:grid-cols-[minmax(760px,1fr)_340px]">
        <section className="min-w-0">
          <Panel className="p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {viewModes.map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setView(mode)}
                    className="rounded-md px-3 py-1.5 text-[12px] font-medium"
                    style={{
                      background: view === mode ? "var(--accent)" : "var(--bg-subtle)",
                      color: view === mode ? "white" : "var(--text-dim)",
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] text-[var(--text-dim)] hover:bg-[var(--bg-subtle)]" style={{ borderColor: "var(--border)" }}>
                <Filter className="h-3.5 w-3.5" />
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
                  className="bg-transparent text-[12px] outline-none"
                >
                  {typeFilters.map((filter) => <option key={filter.id} value={filter.id}>{filter.label}</option>)}
                </select>
              </label>
            </div>
            {displayedSummary && <WeekGrid summary={displayedSummary} selectedId={selectedId} onSelect={setSelectedId} />}
          </Panel>
        </section>

        <aside className="space-y-3">
          <Panel>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold">Today</div>
                <div className="text-[11px] text-[var(--text-dim)]">{summary.agendaToday.length} agenda items</div>
              </div>
              <CalendarCheck className="h-4 w-4 text-[var(--accent-600)]" />
            </div>
            <div className="space-y-2">
              {summary.agendaToday.slice(0, 5).map((block) => (
                <button key={block.id} onClick={() => setSelectedId(block.id)} className="grid w-full grid-cols-[54px_minmax(0,1fr)] gap-2 rounded-md border p-2 text-left hover:bg-[var(--bg-subtle)]" style={{ borderColor: selectedId === block.id ? block.color : "var(--border)" }}>
                  <span className="text-[10px] font-medium text-[var(--text-dim)]">{block.startLabel}</span>
                  <span className="min-w-0">
                    <span className="block line-clamp-1 text-[11px] font-semibold">{block.title}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-[var(--text-dim)]">{block.laneTitle}</span>
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[13px] font-semibold">Needs scheduling</div>
                <div className="text-[11px] text-[var(--text-dim)]">{summary.unscheduled.length} email items ready to place.</div>
              </div>
              <Link href="/inbox?tab=triage" className="text-[12px] font-medium text-[var(--accent-600)]">
                Review
              </Link>
            </div>
            <div className="space-y-2">
              {summary.unscheduled.slice(0, 5).map((block) => (
                <CalendarListButton key={block.id} block={block} selected={selectedId === block.id} onSelect={() => setSelectedId(block.id)} />
              ))}
            </div>
          </Panel>

          <Panel>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[13px] font-semibold">Deadlines</div>
              <Flag className="h-4 w-4 text-[var(--err)]" />
            </div>
            <div className="space-y-2">
              {summary.deadlines.length === 0 && <div className="text-[12px] text-[var(--text-dim)]">No deadline blocks detected.</div>}
              {summary.deadlines.slice(0, 4).map((block) => (
                <CalendarListButton key={block.id} block={block} selected={selectedId === block.id} onSelect={() => setSelectedId(block.id)} />
              ))}
            </div>
          </Panel>

          {selected && (
            <SelectedBlock
              block={selected}
              compact
              onOpenEmail={() => setOpenedEmail(blockToThread(selected))}
              onSchedule={() => void patchBlock(selected, "scheduled")}
              onDismiss={() => void patchBlock(selected, "dismissed")}
            />
          )}
        </aside>
      </div>
      {openedEmail && <ThreadView thread={openedEmail} onClose={() => setOpenedEmail(null)} />}
    </div>
  );
}

function WeekGrid({ summary, selectedId, onSelect }: { summary: CalendarSummary; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <div className={summary.days.length === 1 ? "min-w-[520px]" : "min-w-[900px]"}>
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(${summary.days.length},minmax(104px,1fr))` }}>
          <div />
          {summary.days.map((day) => (
            <div key={day.iso} className="border-b px-2 py-2 text-center" style={{ borderColor: "var(--border)" }}>
              <div className="text-[10px] uppercase text-[var(--text-dim)]">{day.label}</div>
              <div className={`mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold ${day.isToday ? "bg-[var(--accent)] text-white" : ""}`}>
                {day.dateLabel.split(" ")[1]}
              </div>
            </div>
          ))}
          {summary.hours.map((hour) => (
            <HourRow key={hour} hour={hour} summary={summary} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </div>
  );
}

function HourRow({ hour, summary, selectedId, onSelect }: { hour: number; summary: CalendarSummary; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <>
      <div className="border-t pr-2 pt-2 text-right text-[10px] text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        {formatHour(hour)}
      </div>
      {summary.days.map((day) => {
        const blocks = summary.blocks.filter((block) => block.date === day.iso && Math.floor(block.startHour) === hour);
        return (
          <div key={`${day.iso}-${hour}`} className="min-h-20 border-l border-t p-1.5" style={{ borderColor: "var(--border-muted)" }}>
            <div className="space-y-1.5">
              {blocks.map((block) => (
                <button
                  key={block.id}
                  onClick={() => onSelect(block.id)}
                  title={`${block.title}\n${block.source}\n${block.startLabel} - ${block.endLabel}`}
                  className="w-full rounded-md border p-2 text-left shadow-sm transition hover:brightness-[0.98]"
                  style={{
                    borderTopColor: selectedId === block.id ? block.color : "var(--border)",
                    borderRightColor: selectedId === block.id ? block.color : "var(--border)",
                    borderBottomColor: selectedId === block.id ? block.color : "var(--border)",
                    borderLeftColor: block.color,
                    borderLeftWidth: 3,
                    background: `${block.color}14`,
                  }}
                >
                  <div className="text-[11px] font-semibold leading-tight [overflow-wrap:anywhere]">{block.title}</div>
                  <div className="mt-1 text-[9px] text-[var(--text-dim)]">{block.startLabel} - {block.endLabel}</div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function CalendarListButton({ block, selected, onSelect }: { block: CalendarBlock; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-md border bg-white p-2 text-left hover:bg-[var(--bg-subtle)]"
      style={{ borderColor: selected ? block.color : "var(--border)" }}
    >
      <div className="flex items-start gap-2">
        <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: block.color }} />
        <div className="min-w-0">
          <div className="line-clamp-1 text-[11px] font-semibold leading-snug [overflow-wrap:anywhere]">{block.title}</div>
          <div className="mt-1 text-[10px] text-[var(--text-dim)]">{block.dayLabel} - {Math.round(block.confidence * 100)}%</div>
        </div>
      </div>
    </button>
  );
}

function SelectedBlock({ block, compact = false, onOpenEmail, onSchedule, onDismiss }: {
  block: CalendarBlock;
  compact?: boolean;
  onOpenEmail: () => void;
  onSchedule: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="inspector-panel p-4" data-testid="calendar-selected-block">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{block.type.replace("_", " ")} - {block.laneTitle}</div>
          <div className="mt-1 text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{block.title}</div>
          <div className="mt-1 text-[12px] text-[var(--text-dim)]">{block.source}</div>
        </div>
        <div className="rounded-lg px-3 py-2 text-right" style={{ background: `${block.color}14` }}>
          <div className="text-[12px] font-semibold">{block.dayLabel}</div>
          <div className="text-[11px] text-[var(--text-dim)]">{block.startLabel} - {block.endLabel}</div>
        </div>
      </div>
      <div className={`mt-3 grid gap-3 ${compact ? "" : "md:grid-cols-[1fr_180px]"}`}>
        <p className="text-[12px] leading-relaxed text-[var(--text-dim)] [overflow-wrap:anywhere]">{block.snippet || "No snippet available."}</p>
        <div className="space-y-2">
          <div className="text-[11px] text-[var(--text-dim)]">Confidence {Math.round(block.confidence * 100)}%</div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
            <div className="h-full rounded-full" style={{ width: `${Math.round(block.confidence * 100)}%`, background: block.color }} />
          </div>
          <button
            type="button"
            onClick={onOpenEmail}
            className="flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-medium hover:bg-[var(--bg-subtle)]"
            style={{ borderColor: "var(--border)" }}
          >
            <Mail className="h-3.5 w-3.5" />
            Read email
          </button>
          <button
            type="button"
            onClick={onSchedule}
            className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-2 text-[12px] font-medium text-white"
          >
            Save block
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-medium text-[var(--text-dim)] hover:bg-[var(--bg-subtle)]"
            style={{ borderColor: "var(--border)" }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniMonth({ days }: { days: CalendarSummary["days"] }) {
  return (
    <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
      {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
        <div key={`${label}-${index}`} className="py-1 text-[10px] text-[var(--text-dim)]">{label}</div>
      ))}
      {days.map((day) => (
        <div key={day.iso} className={`rounded-md py-2 ${day.isToday ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-subtle)]"}`}>
          {day.dateLabel.split(" ")[1]}
        </div>
      ))}
    </div>
  );
}

function StatTile({ icon, title, value, detail, tone }: { icon: ReactNode; title: string; value: number; detail: string; tone: string }) {
  return (
    <div className="signal-item">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="meta-label [overflow-wrap:anywhere]">{title}</div>
        <div style={{ color: tone }}>{icon}</div>
      </div>
      <div className="text-[26px] font-bold leading-none">{value.toLocaleString()}</div>
      <div className="mt-2 text-[11px]" style={{ color: tone }}>{detail}</div>
    </div>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`section-frame p-4 ${className}`}>
      {children}
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="p-6 space-y-5" data-testid="calendar-loading">
      <div className="skeleton h-10 w-72 rounded" />
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, index) => <div key={index} className="skeleton h-28 rounded-xl" />)}
      </div>
      <div className="skeleton h-[520px] rounded-xl" />
    </div>
  );
}

function formatRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function formatHour(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = ((hour + 11) % 12) + 1;
  return `${display} ${suffix}`;
}

function addDaysIso(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function blockToThread(block: CalendarBlock) {
  return {
    id: block.emailId,
    subject: block.title,
    from_name: block.source,
    from_addr: block.source,
    snippet: block.snippet,
    internal_date: Math.floor(Date.now() / 1000),
    lane: block.type,
    urgency: block.confidence,
    confidence: block.confidence,
    action: "review",
  };
}
