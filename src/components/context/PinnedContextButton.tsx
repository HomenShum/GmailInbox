"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Pin, ShieldCheck, Sparkles, X } from "lucide-react";
import { useCachedJson } from "@/lib/client-cache";
import type { PinnedContextSummary, PinnedArtifactView } from "@/lib/pinned-types";

export default function PinnedContextButton() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { data, refresh } = useCachedJson<PinnedContextSummary>(
    "pinned-context:summary",
    "/api/pinned-artifacts",
    { ttlMs: 60_000 },
  );

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onRefresh() {
      void refresh(true);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("workspace:pinned-context-refresh", onRefresh);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("workspace:pinned-context-refresh", onRefresh);
    };
  }, [refresh]);

  const count = data?.count ?? 0;
  const primary = data?.primary ?? null;

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 items-center gap-1.5 rounded-md border bg-[var(--bg-elev)] px-2.5 text-[12px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-subtle)]"
        style={{ borderColor: "var(--border)" }}
        aria-label="Pinned files and prompts"
        suppressHydrationWarning
      >
        <Pin className="h-3.5 w-3.5 text-[var(--accent-600)]" />
        <span className="hidden md:inline">Pinned files</span>
        <span className="rounded bg-[var(--accent-50)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--accent-600)]">
          {count}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-[360px] overflow-hidden rounded-lg border bg-[var(--bg-elev)] shadow-lg"
          style={{ borderColor: "var(--border)" }}
          data-testid="pinned-context-popover"
        >
          <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--border)" }}>
            <div>
              <div className="text-[12px] font-semibold">Pinned Files And Prompts</div>
              <div className="text-[10px] text-[var(--text-dim)]">Local context the agent can use for matching and planning.</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--bg-subtle)]"
              aria-label="Close pinned context"
            >
              <X className="h-3.5 w-3.5 text-[var(--text-dim)]" />
            </button>
          </div>

          <div className="max-h-[390px] overflow-y-auto p-2">
            {primary && <PrimaryPreview artifact={primary} />}
            <div className="mt-2 space-y-1">
              {(data?.artifacts ?? []).map((artifact) => (
                <ArtifactMini key={artifact.id} artifact={artifact} />
              ))}
              {!data?.artifacts?.length && (
                <div className="rounded-md border border-dashed p-4 text-center text-[12px] text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
              No files or prompts pinned yet.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t p-2" style={{ borderColor: "var(--border)" }}>
            <Link
              href="/settings?tab=context"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 items-center justify-center rounded-md bg-[var(--accent)] px-3 text-[12px] font-medium text-white"
            >
              Manage pinned files
            </Link>
            <button
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new CustomEvent("workspace:agent-focus", {
                  detail: { prompt: "Use my pinned workspace context to explain what I should focus on next." },
                }));
              }}
              className="inline-flex h-8 items-center justify-center rounded-md border px-3 text-[12px] font-medium text-[var(--accent-600)] hover:bg-[var(--bg-subtle)]"
              style={{ borderColor: "var(--border)" }}
            >
              Ask agent
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PrimaryPreview({ artifact }: { artifact: PinnedArtifactView }) {
  return (
    <div className="rounded-lg bg-[var(--accent-50)] p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-600)]">
            <Sparkles className="h-3 w-3" />
            Primary lens
          </div>
          <div className="mt-1 truncate text-[13px] font-semibold">{artifact.name}</div>
          <div className="mt-0.5 truncate text-[10px] text-[var(--text-dim)]">{artifact.file_name ?? artifact.source}</div>
        </div>
        <StatusDot artifact={artifact} />
      </div>
      <div className="text-[12px] leading-relaxed text-[var(--text)]">{artifact.preview.headline}</div>
      <div className="mt-2 flex flex-wrap gap-1">
        {artifact.preview.signals.slice(0, 4).map((signal) => (
          <span key={signal} className="rounded bg-white px-1.5 py-0.5 text-[10px] text-[var(--accent-600)]">{signal}</span>
        ))}
      </div>
    </div>
  );
}

function ArtifactMini({ artifact }: { artifact: PinnedArtifactView }) {
  return (
    <div className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-[var(--bg-subtle)]">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[var(--bg-subtle)] text-[var(--accent-600)]">
        <FileText className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div className="truncate text-[12px] font-medium">{artifact.name}</div>
          {artifact.is_primary && <span className="rounded bg-[var(--accent-50)] px-1 py-0.5 text-[9px] text-[var(--accent-600)]">primary</span>}
        </div>
        <div className="mt-0.5 line-clamp-1 text-[10px] text-[var(--text-dim)]">{artifact.preview.headline}</div>
      </div>
      <StatusDot artifact={artifact} />
    </div>
  );
}

function StatusDot({ artifact }: { artifact: PinnedArtifactView }) {
  if (artifact.approved_for_external_research) {
    return <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--warn)]" aria-label="Approved for external research summaries" />;
  }
  if (artifact.approved_for_matching) {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--ok)]" aria-label="Approved for local matching" />;
  }
  return <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--text-muted)]" aria-label="Not approved for matching" />;
}
