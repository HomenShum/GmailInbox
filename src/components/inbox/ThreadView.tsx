"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, MessageSquareText, Sparkles, X } from "lucide-react";
import { Button } from "@/components/primitives/Button";

export function ThreadView({ thread, onClose }: { thread: any; onClose: () => void }) {
  const [fullThread, setFullThread] = useState<any>(thread);
  const [suggestedReply, setSuggestedReply] = useState("");
  const [generating, setGenerating] = useState(false);
  const [showClassification, setShowClassification] = useState(true);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const displayThread = fullThread ?? thread;

  useEffect(() => {
    let cancelled = false;
    setFullThread(thread);
    setSuggestedReply("");
    setShowClassification(true);
    if (thread?.body) return;
    fetch(`/api/emails/${encodeURIComponent(thread.id)}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.email) setFullThread(j.email); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [thread]);

  useEffect(() => {
    dialogRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const generateReply = async () => {
    setGenerating(true);
    window.setTimeout(() => {
      setSuggestedReply(`Hi ${displayThread.from_name?.split(" ")[0] || "there"},\n\nThank you for reaching out. I reviewed your message and would be happy to discuss this further.\n\nBest regards,`);
      setGenerating(false);
    }, 800);
  };

  const askAgent = (prompt: string) => {
    window.dispatchEvent(new CustomEvent("workspace:agent-focus", { detail: { prompt } }));
  };

  const queueArchive = async () => {
    const result = await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: "archive_email", args: { id: displayThread.id } }),
    }).then((response) => response.json()).catch(() => ({ ok: false, error: "Could not queue archive" }));
    window.dispatchEvent(new CustomEvent("workspace:toast", {
      detail: {
        tone: result.ok ? "ok" : "err",
        text: result.pending_approval ? "Archive queued for approval" : result.error ?? "Archive action created",
      },
    }));
    if (result.pending_approval) window.dispatchEvent(new CustomEvent("workspace:approval-created"));
  };

  const copySuggestedReply = async () => {
    if (!suggestedReply) return;
    await navigator.clipboard?.writeText(suggestedReply).catch(() => {});
    window.dispatchEvent(new CustomEvent("workspace:toast", { detail: { tone: "ok", text: "Reply copied" } }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/20 px-4 py-12 backdrop-blur-[1px]"
      data-testid="thread-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Email reader: ${displayThread.subject}`}
        className="flex max-h-[calc(100vh-96px)] w-full max-w-[860px] flex-col overflow-hidden rounded-xl border bg-[var(--bg-elev)] shadow-2xl outline-none"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="shrink-0 border-b bg-white p-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold leading-snug [overflow-wrap:anywhere]">{displayThread.subject}</h2>
              <div className="mt-1 text-[12px] text-[var(--text-dim)]">
                {displayThread.from_name || displayThread.from_addr} &lt;{displayThread.from_addr}&gt; - {new Date(displayThread.internal_date * 1000).toLocaleString()}
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-dim)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
              aria-label="Close email reader"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b bg-white px-4 py-2" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 overflow-x-auto">
            <Button size="sm" variant="primary" onClick={() => askAgent(`Draft a concise reply to email ${displayThread.id}: ${displayThread.subject}`)}>Reply</Button>
            <Button size="sm" variant="secondary" onClick={() => askAgent(`Summarize the next action for email ${displayThread.id}: ${displayThread.subject}`)}>Ask agent</Button>
            <Button size="sm" variant="secondary" onClick={queueArchive}>Archive</Button>
            <Button size="sm" variant="secondary" onClick={() => askAgent(`Recommend the correct lane label for email ${displayThread.id}: ${displayThread.subject}`)}>Label</Button>
            <Button size="sm" variant="secondary" onClick={() => askAgent(`Pick a useful snooze time for email ${displayThread.id}: ${displayThread.subject}`)}>Snooze</Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-[var(--bg)] p-4">
          <div className="mb-4 rounded-lg border p-4" style={{ background: "var(--accent-50)", borderColor: "var(--accent-600)" }}>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--accent-600)]" />
              <span className="text-[12px] font-semibold text-[var(--accent-600)]">AI Summary</span>
            </div>
            <div className="text-[13px] leading-relaxed">
              {displayThread.snippet || "No summary available yet."}
            </div>
          </div>

          {showClassification && (
            <div className="mb-4 rounded-lg border bg-white p-4" style={{ borderColor: "var(--border)" }}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[12px] font-semibold">Structured Facts</span>
                <button className="text-[12px] text-[var(--text-dim)] hover:text-[var(--text)]" onClick={() => setShowClassification(false)}>Close</button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <Fact label="Lane" value={displayThread.lane ? displayThread.lane.replace("_", " ") : "unclassified"} />
                <Fact label="Priority" value={`${Math.round((displayThread.urgency ?? 0) * 100)}%`} />
                <Fact label="Confidence" value={`${Math.round((displayThread.confidence ?? 0) * 100)}%`} />
                <Fact label="Action" value={displayThread.action ?? "none"} />
              </div>
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--bg-subtle)] p-3">
            <Button size="sm" variant="primary" onClick={generateReply} disabled={generating}>
              {generating ? "Generating..." : "Suggest Reply"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => askAgent(`Turn this email into a calendar block if needed: ${displayThread.subject}`)}>Schedule</Button>
            <Button size="sm" variant="secondary" onClick={() => askAgent(`Should this email become an opportunity or job match? ${displayThread.subject}`)}>Extract</Button>
          </div>

          {suggestedReply && (
            <div className="mb-4 rounded-lg border bg-white p-4" style={{ borderColor: "var(--border)" }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[var(--accent-600)]">Suggested Reply</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => askAgent(`Turn this suggested reply into a final draft for email ${displayThread.id}: ${suggestedReply}`)}>Insert</Button>
                  <Button variant="ghost" size="sm" onClick={copySuggestedReply}>Copy</Button>
                  <Button variant="ghost" size="sm" onClick={() => askAgent(`Edit this suggested reply to be warmer and concise: ${suggestedReply}`)}>Edit</Button>
                </div>
              </div>
              <pre className="whitespace-pre-wrap text-[13px]">{suggestedReply}</pre>
            </div>
          )}

          <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--border)" }}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-dim)]">Email body</div>
            <div className="whitespace-pre-wrap text-[13px] leading-relaxed [overflow-wrap:anywhere]">
              {displayThread.body || displayThread.snippet || "No body content available."}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t bg-white p-3" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            onClick={() => askAgent(`Draft a concise reply to email ${displayThread.id}: ${displayThread.subject}`)}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-2 text-[11px] font-medium text-white"
          >
            <MessageSquareText className="h-3.5 w-3.5" />
            Reply
          </button>
          <button
            type="button"
            onClick={() => askAgent(`Summarize the next action for email ${displayThread.id}: ${displayThread.subject}`)}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-medium text-[var(--accent-600)] hover:bg-[var(--bg-subtle)]"
            style={{ borderColor: "var(--border)" }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Ask
          </button>
          <a
            href={`/inbox?q=${encodeURIComponent(displayThread.subject)}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-medium text-[var(--text-dim)] hover:bg-[var(--bg-subtle)]"
            style={{ borderColor: "var(--border)" }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Search
          </a>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--text-dim)]">{label}</div>
      <div className="mt-1 inline-block rounded bg-[var(--bg-subtle)] px-2 py-1 text-[12px] capitalize">{value}</div>
    </div>
  );
}
