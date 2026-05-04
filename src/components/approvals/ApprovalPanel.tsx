"use client";

import { useEffect, useState } from "react";

interface Approval {
  id: number;
  tool: string;
  args: string;
  summary: string;
  risk: string;
  status: string;
  created_at: number;
}

export function ApprovalPanel() {
  const [items, setItems] = useState<Approval[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function refresh() {
    const res = await fetch("/api/approvals?status=pending", { cache: "no-store" });
    if (!res.ok) return;
    const payload = await res.json();
    setItems(payload.approvals ?? []);
  }

  async function decide(id: number, decision: "approve" | "reject") {
    setBusyId(id);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const payload = await res.json().catch(() => ({}));
      window.dispatchEvent(new CustomEvent("workspace:toast", {
        detail: {
          tone: res.ok ? "ok" : "err",
          text: res.ok ? (decision === "approve" ? "Approved and applied" : "Request rejected") : (payload.error ?? "Approval failed"),
        },
      }));
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    void refresh();
    function onMaybeChanged() {
      void refresh();
    }
    window.addEventListener("workspace:approval-created", onMaybeChanged);
    const id = window.setInterval(refresh, 15_000);
    return () => {
      window.removeEventListener("workspace:approval-created", onMaybeChanged);
      window.clearInterval(id);
    };
  }, []);

  return (
    <section className="section-frame p-4" data-testid="approval-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-semibold">Approval Queue</div>
          <div className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[var(--text-dim)]">
            Risky actions are staged here first. Approving applies the local tool; rejecting leaves the mailbox untouched.
          </div>
        </div>
        <button className="rounded-md border px-3 py-1.5 text-[12px]" style={{ borderColor: "var(--border)" }} onClick={refresh}>
          Refresh
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-md bg-[var(--bg-subtle)] px-3 py-3 text-[12px] text-[var(--text-dim)]">
          No pending approvals.
        </div>
      ) : (
        <div className="plain-list mt-4">
          {items.slice(0, 5).map((item) => (
            <div key={item.id} className="plain-row p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="text-[12px] font-medium leading-tight">{item.summary}</div>
                  <div className="mt-1 text-[11px] leading-tight text-[var(--text-dim)]">{item.risk}</div>
                  <div className="mt-2 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                    {item.tool} - {new Date(item.created_at * 1000).toLocaleString()}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    disabled={busyId === item.id}
                    onClick={() => decide(item.id, "reject")}
                    className="rounded-md border px-3 py-1.5 text-[12px] disabled:opacity-50"
                    style={{ borderColor: "var(--border)" }}
                  >
                    Reject
                  </button>
                  <button
                    disabled={busyId === item.id}
                    onClick={() => decide(item.id, "approve")}
                    className="rounded-md px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
                    style={{ background: "var(--accent)" }}
                  >
                    Approve
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
