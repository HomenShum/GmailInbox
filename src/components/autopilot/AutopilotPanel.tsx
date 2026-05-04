"use client";

import { useEffect, useMemo, useState } from "react";

interface AutopilotRun {
  id: number;
  mode: string;
  trigger: string;
  summary: string;
  classified: number;
  jobs_created: number;
  opportunities_created: number;
  recommendations_created: number;
  errors: string | null;
  started_at: number;
  finished_at: number | null;
}

interface AutopilotState {
  latest: AutopilotRun | null;
  runs: AutopilotRun[];
  reviewQueues: Array<{ id: string; title: string; count: number; action: string; href: string }>;
}

interface RunResponse {
  run: AutopilotRun | null;
  classified: number;
  jobsCreated: number;
  opportunitiesCreated: number;
  recommendationsCreated: number;
  errors: string[];
}

export function AutopilotPanel() {
  const [state, setState] = useState<AutopilotState | null>(null);
  const [running, setRunning] = useState<"local" | "suggest" | null>(null);
  const [lastResult, setLastResult] = useState<RunResponse | null>(null);

  async function refresh() {
    const res = await fetch("/api/autopilot", { cache: "no-store" });
    if (!res.ok) return;
    setState(await res.json());
  }

  async function run(mode: "local" | "suggest") {
    setRunning(mode);
    try {
      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, trigger: "dashboard" }),
      });
      const payload = await res.json();
      setLastResult(payload);
      window.dispatchEvent(new CustomEvent("workspace:toast", {
        detail: {
          tone: res.ok ? "ok" : "err",
          text: res.ok ? "Autopilot run complete" : "Autopilot run failed",
        },
      }));
      await refresh();
    } finally {
      setRunning(null);
    }
  }

  useEffect(() => {
    void refresh();
    function onAutopilotComplete() {
      void refresh();
    }
    window.addEventListener("workspace:autopilot-complete", onAutopilotComplete);
    return () => window.removeEventListener("workspace:autopilot-complete", onAutopilotComplete);
  }, []);

  const latestSummary = useMemo(() => parseSummary(state?.latest?.summary), [state?.latest?.summary]);
  const latest = state?.latest;

  return (
    <section
      className="section-frame p-4"
      data-testid="autopilot-panel"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[13px] font-semibold">Autopilot</div>
          <div className="mt-1 max-w-2xl text-[12px] text-[var(--text-dim)]">
            Keeps triage current, extracts jobs and opportunities, and creates review recommendations locally. Gmail archive, delete, and send actions still require explicit approval.
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-md border px-3 py-1.5 text-[12px] disabled:opacity-50"
            style={{ borderColor: "var(--border)" }}
            disabled={Boolean(running)}
            onClick={() => run("suggest")}
          >
            {running === "suggest" ? "Checking..." : "Suggest"}
          </button>
          <button
            className="rounded-md bg-[var(--accent-600)] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
            disabled={Boolean(running)}
            onClick={() => run("local")}
          >
            {running === "local" ? "Running..." : "Run local"}
          </button>
        </div>
      </div>

      <div className="signal-bar mt-4">
        <Stat label="Sorted" value={lastResult?.classified ?? latest?.classified ?? 0} />
        <Stat label="Jobs" value={lastResult?.jobsCreated ?? latest?.jobs_created ?? 0} />
        <Stat label="Opportunities" value={lastResult?.opportunitiesCreated ?? latest?.opportunities_created ?? 0} />
        <Stat label="Review items" value={lastResult?.recommendationsCreated ?? latest?.recommendations_created ?? 0} />
      </div>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <div className="rounded-lg bg-[var(--bg-subtle)] p-3">
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Latest run</div>
          <div className="mt-1 text-[12px] font-medium leading-tight break-words">
            {latest ? `${latest.mode} from ${latest.trigger}` : "No run yet"}
          </div>
          <div className="mt-1 text-[11px] leading-tight text-[var(--text-dim)]">
            {latest?.finished_at ? new Date(latest.finished_at * 1000).toLocaleString() : "Ready"}
          </div>
        </div>
        <div className="rounded-lg bg-[var(--bg-subtle)] p-3">
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Archive queue</div>
          <div className="mt-1 text-[18px] font-semibold">{latestSummary.archiveCandidates.toLocaleString()}</div>
          <div className="text-[11px] leading-tight text-[var(--text-dim)]">Suggested only, not applied</div>
        </div>
        <div className="rounded-lg bg-[var(--bg-subtle)] p-3">
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Low confidence</div>
          <div className="mt-1 text-[18px] font-semibold">{latestSummary.lowConfidenceReview.toLocaleString()}</div>
          <div className="text-[11px] leading-tight text-[var(--text-dim)]">Needs batch review</div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="signal-item">
      <div className="text-[11px] leading-tight text-[var(--text-dim)]">{label}</div>
      <div className="mt-1 text-[20px] font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}

function parseSummary(raw?: string | null): { archiveCandidates: number; lowConfidenceReview: number } {
  if (!raw) return { archiveCandidates: 0, lowConfidenceReview: 0 };
  try {
    const parsed = JSON.parse(raw) as Partial<{ archiveCandidates: number; lowConfidenceReview: number }>;
    return {
      archiveCandidates: parsed.archiveCandidates ?? 0,
      lowConfidenceReview: parsed.lowConfidenceReview ?? 0,
    };
  } catch {
    return { archiveCandidates: 0, lowConfidenceReview: 0 };
  }
}
