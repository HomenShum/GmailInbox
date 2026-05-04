"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowRight, ExternalLink, MailOpen, MessageSquareText, X } from "lucide-react";
import { LANE_META, type Lane } from "@/lib/lanes";

const ORDERED_LANES: Lane[] = ["reply_now", "career", "job_alerts", "dev_ci", "money", "subscriptions", "shopping", "travel_auto", "reading", "auto_archive", "triage"];

interface LaneKanbanProps {
  lanes: Record<string, any[]>;
  total: number;
  counts?: Record<string, number>;
  initialLaneIds?: Lane[];
  previewLaneIds?: Lane[];
}

export function LaneKanban({ lanes, total, counts = {}, initialLaneIds, previewLaneIds = [] }: LaneKanbanProps) {
  const [showMoreLanes, setShowMoreLanes] = useState(false);
  const [activeLane, setActiveLane] = useState<"all" | Lane>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fullEmail, setFullEmail] = useState<any | null>(null);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const defaultLaneIds = initialLaneIds?.length ? initialLaneIds : ORDERED_LANES.filter((lane) => (lanes[lane] ?? []).length > 0);
  const visibleLaneIds = useMemo(() => {
    const ids = showMoreLanes ? [...defaultLaneIds, ...previewLaneIds] : defaultLaneIds;
    return ORDERED_LANES.filter((lane) => ids.includes(lane) && (lanes[lane] ?? []).length > 0);
  }, [defaultLaneIds, lanes, previewLaneIds, showMoreLanes]);
  const visibleCards = useMemo(() => {
    const laneIds = activeLane === "all" ? visibleLaneIds : visibleLaneIds.filter((lane) => lane === activeLane);
    return laneIds.flatMap((lane) => {
      const limit = activeLane === "all" ? 4 : 12;
      return (lanes[lane] ?? []).slice(0, limit).map((card: any) => ({ card, lane, meta: LANE_META[lane] }));
    }).slice(0, activeLane === "all" ? 14 : 18);
  }, [activeLane, lanes, visibleLaneIds]);
  const selectedPreview = useMemo(() => {
    if (!selectedId) return null;
    for (const cards of Object.values(lanes)) {
      const found = cards.find((card: any) => card.id === selectedId);
      if (found) return found;
    }
    return null;
  }, [lanes, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setFullEmail(null);
      return;
    }
    let cancelled = false;
    setLoadingEmail(true);
    setFullEmail(selectedPreview);
    fetch(`/api/emails/${encodeURIComponent(selectedId)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!cancelled && payload?.email) setFullEmail(payload.email);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingEmail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedPreview]);

  useEffect(() => {
    if (!selectedId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  return (
    <div className="space-y-3" data-testid="lane-kanban">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--text)]">
            <MailOpen className="h-3.5 w-3.5 text-[var(--accent-600)]" />
            <span>{selectedId ? "Reading selected email in a popover." : "Select a card to open a popover without leaving Today."}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--text-dim)]">{total.toLocaleString()} emails sorted. Showing the highest-signal items only.</div>
        </div>
        {previewLaneIds.length > 0 && (
          <button
            type="button"
            data-testid="more-lane-previews"
            onClick={() => setShowMoreLanes((open) => !open)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-3 text-[12px] font-medium text-[var(--accent-600)] hover:bg-[var(--accent-50)]"
            style={{ borderColor: "var(--border)" }}
          >
            {showMoreLanes ? "Hide extra lanes" : "More lane previews"}
            <ArrowRight className={`h-3.5 w-3.5 transition-transform ${showMoreLanes ? "rotate-90" : ""}`} />
          </button>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setActiveLane("all")}
          className="shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-medium"
          style={{ background: activeLane === "all" ? "var(--accent)" : "var(--bg-subtle)", color: activeLane === "all" ? "white" : "var(--text-dim)" }}
        >
          All priority
        </button>
        {visibleLaneIds.map((lane) => {
          const meta = LANE_META[lane];
          const totalInLane = counts[lane] ?? (lanes[lane] ?? []).length;
          return (
            <button
              key={lane}
              type="button"
              data-testid={`lane-${lane}`}
              onClick={() => setActiveLane(lane)}
              className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium"
              style={{ background: activeLane === lane ? `${meta.tone}18` : "var(--bg-subtle)", color: activeLane === lane ? meta.tone : "var(--text-dim)" }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: meta.tone }} />
              <span>{meta.title}</span>
              <span className="text-[10px] opacity-70">{totalInLane.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      <div>
        <div className="plain-list divide-y" style={{ borderColor: "var(--border-muted)" }}>
          {visibleCards.map(({ card, lane, meta }) => (
            <LaneCard
              key={card.id}
              card={card}
              meta={meta}
              lane={lane}
              selected={selectedId === card.id}
              onSelect={() => setSelectedId(card.id)}
            />
          ))}
        </div>
        {selectedPreview && (
          <EmailReader
            email={fullEmail ?? selectedPreview}
            loading={loadingEmail}
            lane={selectedPreview.lane}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

function LaneCard({ card, meta, lane, selected, onSelect }: { card: any; meta: any; lane: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`lane-card grid w-full gap-3 bg-white px-3 py-2.5 text-left hover:bg-[var(--bg-subtle)] md:grid-cols-[minmax(130px,0.36fr)_minmax(260px,1fr)_120px] md:items-center ${selected ? "bg-[var(--accent-50)] ring-1 ring-inset ring-[var(--accent)]" : ""}`}
      data-testid="lane-card"
    >
      <div className="min-w-0">
        <div className="truncate text-[11px] font-medium text-[var(--text-dim)]">{card.from_name || card.from_addr}</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: meta.tone + "18", color: meta.tone }}>{lane.replace("_", " ")}</span>
          <span className="text-[10px] text-[var(--text-muted)]">{new Date(card.internal_date * 1000).toLocaleDateString()}</span>
        </div>
      </div>
      <div className="min-w-0">
        <div className="line-clamp-1 text-[12px] font-semibold leading-snug text-[var(--text)]">{card.subject}</div>
        <div className="mt-1 line-clamp-1 text-[11px] leading-relaxed text-[var(--text-dim)]">{card.snippet}</div>
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border-muted)]">
          <div className="h-full rounded-full" style={{ width: `${Math.max(10, card.urgency * 100)}%`, background: meta.tone }} />
        </div>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
      </div>
    </button>
  );
}

function EmailReader({ email, lane, loading, onClose }: { email: any; lane?: Lane; loading: boolean; onClose: () => void }) {
  const meta = lane && LANE_META[lane] ? LANE_META[lane] : null;
  const body = email.body || email.snippet || "No body content available.";
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/20 px-4 py-16 backdrop-blur-[1px]"
      data-testid="focused-email-reader"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Email reader: ${email.subject}`}
        className="w-full max-w-[760px] overflow-hidden rounded-xl border bg-[var(--bg-elev)] shadow-2xl outline-none"
        style={{ borderColor: "var(--border)" }}
      >
      <div className="flex items-start justify-between gap-3 border-b bg-white p-4" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {meta && <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: meta.tone + "18", color: meta.tone }}>{meta.title}</span>}
            {loading && <span className="text-[10px] text-[var(--text-muted)]">Loading full body...</span>}
          </div>
          <h3 className="text-[14px] font-semibold leading-snug [overflow-wrap:anywhere]">{email.subject}</h3>
          <div className="mt-1 truncate text-[11px] text-[var(--text-dim)]">
            {email.from_name || email.from_addr} - {new Date(email.internal_date * 1000).toLocaleString()}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-[var(--bg-subtle)]"
          aria-label="Close email reader"
        >
          <X className="h-4 w-4 text-[var(--text-dim)]" />
        </button>
      </div>

      <div className="max-h-[calc(100vh-300px)] overflow-y-auto bg-[var(--bg)] p-4">
        <div className="mb-3 rounded-lg bg-[var(--accent-50)] p-3">
          <div className="mb-1 text-[11px] font-semibold text-[var(--accent-600)]">Quick read</div>
          <div className="text-[12px] leading-relaxed text-[var(--text)]">{email.snippet}</div>
        </div>

        <div className="rounded-lg border bg-white p-3" style={{ borderColor: "var(--border)" }}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">Email body</div>
          <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--text)] [overflow-wrap:anywhere]">{body}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t bg-white p-3" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("workspace:agent-focus", {
            detail: { prompt: `Draft a concise reply to email ${email.id}: ${email.subject}` },
          }))}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-2 text-[11px] font-medium text-white"
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          Reply
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("workspace:agent-focus", {
            detail: { prompt: `Summarize the next action for email ${email.id}: ${email.subject}` },
          }))}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-medium text-[var(--accent-600)] hover:bg-[var(--bg-subtle)]"
          style={{ borderColor: "var(--border)" }}
        >
          <MailOpen className="h-3.5 w-3.5" />
          Ask
        </button>
        <Link
          href={`/inbox?q=${encodeURIComponent(email.subject)}`}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-medium text-[var(--text-dim)] hover:bg-[var(--bg-subtle)]"
          style={{ borderColor: "var(--border)" }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Inbox
        </Link>
      </div>
      {lane === "auto_archive" && (
        <div className="border-t px-3 py-2 text-[11px] text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
          <Archive className="mr-1 inline h-3.5 w-3.5" />
          Archive actions still require approval before mailbox changes.
        </div>
      )}
    </aside>
    </div>
  );
}
