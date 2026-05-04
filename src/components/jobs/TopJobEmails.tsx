"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BriefcaseBusiness, FileText, Mail, RefreshCw, Search, Settings, ShieldCheck, Sparkles } from "lucide-react";
import { ThreadView } from "@/components/inbox/ThreadView";
import { useCachedJson } from "@/lib/client-cache";
import type { CareerFitSummary, CareerFitItem } from "@/lib/career-fit";

type TopJobEmailsProps = {
  title?: string;
  eyebrow?: string;
  description?: string;
  dataTestId?: string;
};

export default function TopJobEmails({
  title = "Top Job Emails",
  eyebrow = "Ranked by pinned files",
  description = "A focused view of job and recruiter emails, sorted by fit against your pinned workspace context.",
  dataTestId = "jobs-fit-view",
}: TopJobEmailsProps) {
  const { data, loading, refresh } = useCachedJson<CareerFitSummary>("career-fit:top-jobs", "/api/career-fit?limit=40", { ttlMs: 60_000 });
  const [opened, setOpened] = useState<CareerFitItem | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [researching, setResearching] = useState<Record<string, boolean>>({});
  const top = data?.items.slice(0, 12) ?? [];
  const primary = data?.context.primary ?? null;
  const selected = top.find((item) => item.email.id === selectedId) ?? top[0] ?? null;

  useEffect(() => {
    if (!top.length) {
      if (selectedId) setSelectedId(null);
      return;
    }
    if (!selectedId || !top.some((item) => item.email.id === selectedId)) {
      setSelectedId(top[0].email.id);
    }
  }, [selectedId, top]);

  async function researchJob(item: CareerFitItem) {
    setSelectedId(item.email.id);
    setResearching((current) => ({ ...current, [item.email.id]: true }));
    try {
      const response = await fetch("/api/nodebench/job-research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email_id: item.email.id }),
      });
      if (!response.ok) throw new Error(`Research request failed (${response.status})`);
      await refresh(true);
    } finally {
      setResearching((current) => ({ ...current, [item.email.id]: false }));
    }
  }

  if (loading && !data) return <JobsSkeleton dataTestId={`${dataTestId}-loading`} />;

  if (!data) {
    return (
      <div className="workspace-page p-5">
        <div className="section-frame p-6 text-[13px]">Top job emails could not load.</div>
      </div>
    );
  }

  return (
    <div className="workspace-page space-y-3 p-4 xl:p-5" data-testid={dataTestId}>
      <header className="workspace-hero p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(420px,1fr)_auto] xl:items-center">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-[var(--accent-50)] px-2 py-1 text-[11px] font-medium text-[var(--accent-600)]">
              <BriefcaseBusiness className="h-3.5 w-3.5" />
              {eyebrow}
            </div>
            <h1 className="text-[20px] font-semibold leading-tight">{title}</h1>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[var(--text-dim)]">
              {description}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-[var(--text-dim)]">
              <span><strong className="text-[var(--text)]">{data.totals.scanned}</strong> scanned</span>
              <span><strong className="text-[var(--text)]">{data.totals.good}</strong> good or better</span>
              <span><strong className="text-[var(--text)]">{data.totals.pinnedArtifacts}</strong> matching artifacts</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <button
              type="button"
              onClick={() => void refresh(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium text-[var(--text-dim)] hover:bg-[var(--bg-subtle)]"
              style={{ borderColor: "var(--border)" }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <Link href="/settings?tab=context" className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium text-[var(--accent-600)] hover:bg-[var(--bg-subtle)]" style={{ borderColor: "var(--border)" }}>
              <Settings className="h-3.5 w-3.5" />
              Pinned files
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-3 xl:grid-cols-[minmax(700px,1fr)_320px]">
        <div className="section-frame overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border-muted)" }}>
            <div>
              <div className="text-[14px] font-semibold">Best matches now</div>
              <div className="text-[11px] text-[var(--text-dim)]">Open only the emails that look worth your time.</div>
            </div>
            <Link href="/inbox?tab=job_alerts" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent-600)]">
              Raw lane
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border-muted)" }}>
            {top.map((item, index) => (
              <JobFitRow
                key={item.email.id}
                item={item}
                index={index + 1}
                selected={selected?.email.id === item.email.id}
                researching={researching[item.email.id] === true}
                onOpen={() => setOpened(item)}
                onSelect={() => setSelectedId(item.email.id)}
                onResearch={() => void researchJob(item)}
              />
            ))}
            {top.length === 0 && (
              <div className="p-6 text-[13px] text-[var(--text-dim)]">
                No job emails were found. Sync Gmail or adjust pinned matching context.
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-3">
          <section className="inspector-panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-[var(--accent-600)]" />
              <div className="text-[13px] font-semibold">Matching lens</div>
            </div>
            {primary ? (
              <div className="space-y-3">
                <div>
                  <div className="text-[13px] font-semibold leading-snug [overflow-wrap:anywhere]">{primary.name}</div>
                  <div className="mt-1 text-[11px] text-[var(--text-dim)]">{primary.preview.headline}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {primary.preview.signals.slice(0, 6).map((signal) => (
                    <span key={signal} className="rounded bg-[var(--accent-50)] px-2 py-1 text-[10px] font-medium text-[var(--accent-600)]">
                      {signal}
                    </span>
                  ))}
                </div>
                <div className="rounded-md bg-[var(--bg-subtle)] p-3 text-[11px] leading-snug text-[var(--text-dim)]">
                  {primary.preview.safety}
                </div>
              </div>
            ) : (
              <div className="text-[12px] text-[var(--text-dim)]">No pinned file is approved for matching yet.</div>
            )}
          </section>

          {selected && (
            <ResearchProofPanel
              item={selected}
              researching={researching[selected.email.id] === true}
              onResearch={() => void researchJob(selected)}
            />
          )}

          <section className="inspector-panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--accent-600)]" />
              <div className="text-[13px] font-semibold">Agent move</div>
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("workspace:agent-focus", {
                detail: { prompt: "Using my pinned files, compare the top job emails and tell me the 3 I should act on first with draft next actions." },
              }))}
              className="w-full rounded-md bg-[var(--accent)] px-3 py-2 text-[12px] font-medium text-white"
            >
              Ask agent to rank top 3
            </button>
            <div className="mt-3 text-[11px] leading-snug text-[var(--text-dim)]">
              The list is locally ranked. The agent can explain tradeoffs, draft replies, or turn a match into a todo.
            </div>
          </section>
        </aside>
      </section>

      {opened && <ThreadView thread={emailToThread(opened)} onClose={() => setOpened(null)} />}
    </div>
  );
}

function JobFitRow({
  item,
  index,
  selected,
  researching,
  onOpen,
  onSelect,
  onResearch,
}: {
  item: CareerFitItem;
  index: number;
  selected: boolean;
  researching: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onResearch: () => void;
}) {
  const color = fitColor(item.fitLabel);
  return (
    <div className={`grid gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-subtle)] md:grid-cols-[42px_70px_minmax(0,1fr)_220px] md:items-center ${selected ? "bg-[var(--accent-50)]" : ""}`}>
      <div className="font-mono text-[11px] text-[var(--text-muted)]">{String(index).padStart(2, "0")}</div>
      <div>
        <div className="text-[22px] font-bold leading-none" style={{ color }}>{item.fitScore}</div>
        <div className="mt-1 text-[10px] font-medium uppercase" style={{ color }}>{item.fitLabel}</div>
      </div>
      <button type="button" onClick={onSelect} className="min-w-0 text-left">
        <div className="line-clamp-1 text-[13px] font-semibold [overflow-wrap:anywhere]">{item.email.subject}</div>
        <div className="mt-1 line-clamp-1 text-[11px] text-[var(--text-dim)]">{item.email.from_name || item.email.from_addr}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <ResearchStatusBadge status={item.research.status} />
          {item.matchedSignals.slice(0, 3).map((signal) => (
            <span key={signal} className="rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-dim)]">
              {signal}
            </span>
          ))}
        </div>
        <div className="mt-2 text-[11px] leading-snug text-[var(--text-dim)] [overflow-wrap:anywhere]">{item.reasons[0] ?? "Ranked from email content and pinned context."}</div>
      </button>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <button
          type="button"
          onClick={onResearch}
          disabled={researching}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium text-[var(--text-dim)] hover:bg-[var(--bg-subtle)] disabled:cursor-wait disabled:opacity-60"
          style={{ borderColor: "var(--border)" }}
        >
          <Search className="h-3.5 w-3.5" />
          {researching ? "Researching" : item.research.status === "not_started" ? "Research" : "Refresh"}
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium text-[var(--accent-600)] hover:bg-[var(--bg-subtle)]"
          style={{ borderColor: "var(--border)" }}
        >
          <Mail className="h-3.5 w-3.5" />
          Read
        </button>
      </div>
    </div>
  );
}

function ResearchProofPanel({ item, researching, onResearch }: { item: CareerFitItem; researching: boolean; onResearch: () => void }) {
  const research = item.research;
  const entities = research.entities;
  const dossier = research.dossier;
  const shared = research.contextPack.requestPreview;
  const sourceCount = dossier?.sources.length ?? 0;
  const noSourcedFacts = research.contextPack.visibility === "nodebench_public"
    && research.status === "needs_review"
    && sourceCount === 0;

  return (
    <section className="inspector-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[var(--accent-600)]" />
          <div className="text-[13px] font-semibold">NodeBench proof</div>
        </div>
        <ResearchStatusBadge status={research.status} />
      </div>

      <div className="space-y-2 text-[12px]">
        <Fact label="Company" value={entities.company ?? entities.domain ?? "Needs resolution"} />
        <Fact label="Role" value={entities.roleTitle ?? "Needs extraction review"} />
        <Fact label="Person" value={entities.person ?? "Not detected"} />
        <Fact label="Domain" value={entities.domain ?? "Not detected"} />
      </div>

      {(research.error || noSourcedFacts) && (
        <div className={`mt-3 rounded-md px-3 py-2 text-[11px] leading-snug ${research.error ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
          <div className="font-semibold">
            {research.error ? "Background research failed upstream" : "Connected, but no sourced facts yet"}
          </div>
          <div className="mt-1">
            {research.error
              ? `NodeBench returned: ${research.error}`
              : "The job score works from your pinned files and email metadata. NodeBench registered the role, but it has not stored verified public claims or source URLs for this role yet."}
          </div>
        </div>
      )}

      {dossier && (
        <div className="mt-3 rounded-md bg-[var(--bg-subtle)] p-3">
          <div className="text-[12px] font-semibold leading-snug">{dossier.headline}</div>
          <p className="mt-1 text-[11px] leading-snug text-[var(--text-dim)]">{dossier.summary}</p>
          <div className="mt-2 space-y-1">
            {dossier.missingInfo.slice(0, 2).map((info) => (
              <div key={info} className="text-[11px] leading-snug text-[var(--text-dim)]">- {info}</div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 rounded-md border p-3" style={{ borderColor: "var(--border-muted)" }}>
        <div className="text-[11px] font-semibold uppercase text-[var(--text-dim)]">NodeBench request preview</div>
        <div className="mt-2 space-y-1 text-[11px] leading-snug text-[var(--text-dim)]">
          <div>Raw email body: <span className="font-semibold text-[var(--text)]">{shared.sendsRawEmailBody ? "yes" : "no"}</span></div>
          <div>Raw resume file: <span className="font-semibold text-[var(--text)]">{shared.sendsRawResumeFile ? "yes" : "no"}</span></div>
          <div>Approved artifact summaries: <span className="font-semibold text-[var(--text)]">{shared.approvedArtifactSummaries.length}</span></div>
          <div>Next tool: <span className="font-semibold text-[var(--text)]">{research.contextPack.nextNodeBenchTool}</span></div>
        </div>
      </div>

      <button
        type="button"
        onClick={onResearch}
        disabled={researching}
        className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-[12px] font-medium text-white disabled:cursor-wait disabled:opacity-60"
      >
        <Search className="h-3.5 w-3.5" />
        {researching ? "Preparing request" : research.status === "not_started" ? "Research company" : "Refresh research"}
      </button>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-[var(--text-dim)]">{label}</span>
      <span className="min-w-0 text-right font-medium [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}

function ResearchStatusBadge({ status }: { status: CareerFitItem["research"]["status"] }) {
  const tone = researchTone(status);
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: tone.bg, color: tone.fg }}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function emailToThread(item: CareerFitItem) {
  return {
    ...item.email,
    urgency: item.email.urgency,
    confidence: item.email.confidence,
    action: item.email.action ?? "review",
  };
}

function fitColor(label: CareerFitItem["fitLabel"]) {
  if (label === "strong") return "#10b981";
  if (label === "good") return "#6366f1";
  if (label === "maybe") return "#f59e0b";
  return "#64748b";
}

function researchTone(status: CareerFitItem["research"]["status"]) {
  if (status === "verified") return { bg: "#dcfce7", fg: "#047857" };
  if (status === "queued" || status === "researching") return { bg: "#dbeafe", fg: "#1d4ed8" };
  if (status === "needs_review" || status === "stale") return { bg: "#fef3c7", fg: "#b45309" };
  if (status === "failed") return { bg: "#fee2e2", fg: "#b91c1c" };
  return { bg: "#f1f5f9", fg: "#64748b" };
}

function JobsSkeleton({ dataTestId }: { dataTestId: string }) {
  return (
    <div className="workspace-page space-y-4 p-4 xl:p-5" data-testid={dataTestId}>
      <div className="skeleton h-28 rounded-lg" />
      <div className="skeleton h-[520px] rounded-lg" />
    </div>
  );
}
