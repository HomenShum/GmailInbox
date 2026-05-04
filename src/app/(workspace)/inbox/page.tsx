"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Inbox, Search } from "lucide-react";
import { ThreadList } from "@/components/inbox/ThreadList";
import { ThreadView } from "@/components/inbox/ThreadView";

const tabs = [
  { id: "all", label: "All" },
  { id: "reply_now", label: "Replies" },
  { id: "unread", label: "Unread" },
  { id: "career", label: "Recruiter" },
  { id: "admin", label: "Bills/Admin" },
  { id: "triage", label: "Label Review" },
  { id: "job_alerts", label: "Job Alerts" },
  { id: "reading", label: "Newsletters" },
];

const INBOX_LIMIT = 60;

export default function InboxPage() {
  const searchParams = useSearchParams();
  const [threads, setThreads] = useState<any[]>([]);
  const [selectedThread, setSelectedThread] = useState<any>(null);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") ?? "all");
  const [filter, setFilter] = useState(searchParams.get("q") ?? "");
  const [tabCache, setTabCache] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const cacheRef = useRef<Record<string, any[]>>({});
  const prefetchedRef = useRef(false);
  const deferredFilter = useDeferredValue(filter);

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    const tab = searchParams.get("tab") ?? "all";
    setFilter(q);
    setActiveTab(tab);
  }, [searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    const query = deferredFilter.trim();
    setLoading(true);

    if (!query && cacheRef.current[activeTab]) {
      setThreads(cacheRef.current[activeTab]);
      setLoading(false);
      return () => controller.abort();
    }

    const params = new URLSearchParams({ tab: activeTab, limit: String(INBOX_LIMIT) });
    if (query) params.set("q", query);
    fetch(`/api/inbox?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((j) => {
        const rows = j.threads ?? [];
        setThreads(rows);
        if (!query) setCachedTab(activeTab, rows);
      })
      .catch((err) => { if (err.name !== "AbortError") setThreads([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [activeTab, deferredFilter]);

  useEffect(() => {
    const query = deferredFilter.trim();
    if (query || prefetchedRef.current) return;
    prefetchedRef.current = true;

    const controller = new AbortController();
    const id = window.setTimeout(() => {
      const ids = tabs.map((tab) => tab.id).join(",");
      fetch(`/api/inbox?tabs=${ids}&limit=${INBOX_LIMIT}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((j) => {
          const next = j.tabs ?? {};
          cacheRef.current = { ...cacheRef.current, ...next };
          setTabCache(cacheRef.current);
          setThreads((current) => cacheRef.current[activeTab] ?? current);
        })
        .catch(() => {});
    }, 350);

    return () => { window.clearTimeout(id); controller.abort(); };
  }, [activeTab, deferredFilter]);

  function setCachedTab(tabId: string, rows: any[]) {
    cacheRef.current = { ...cacheRef.current, [tabId]: rows };
    setTabCache(cacheRef.current);
  }

  const filteredThreads = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((thread) =>
      thread.subject?.toLowerCase().includes(q) ||
      thread.from_name?.toLowerCase().includes(q) ||
      thread.from_addr?.toLowerCase().includes(q));
  }, [filter, threads]);
  const hasVisibleTab = tabs.some((tab) => tab.id === activeTab);

  return (
    <div className="workspace-page flex h-full flex-col gap-4 p-4 xl:p-5" data-testid="inbox-view">
      <section className="workspace-hero p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,0.65fr)_minmax(360px,1fr)] lg:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-50)] text-[var(--accent-600)]">
                <Inbox className="h-4 w-4" />
              </span>
              <div>
                <h1 className="text-[20px] font-semibold leading-tight">Inbox</h1>
                <p className="mt-0.5 text-[12px] text-[var(--text-dim)]">
                  Click any email to open a popover reader without leaving the list.
                </p>
              </div>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]" />
            <input
              type="text"
              placeholder="Search emails..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="h-10 w-full rounded-md border bg-[var(--bg-subtle)] pl-9 pr-3 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
        </div>

        <div className="mt-3 flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (!filter.trim() && tabCache[tab.id]) {
                  setThreads(tabCache[tab.id]);
                  setLoading(false);
                }
              }}
              className="rounded-md px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors"
              style={{
                background: activeTab === tab.id ? "var(--accent)" : "var(--bg-subtle)",
                color: activeTab === tab.id ? "white" : "var(--text-dim)",
              }}
            >
              {tab.label}
            </button>
          ))}
          {!hasVisibleTab && (
            <button
              className="rounded-md px-3 py-1.5 text-[12px] font-medium whitespace-nowrap"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {formatTabLabel(activeTab)}
            </button>
          )}
        </div>
      </section>

      <section className="section-frame flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--border-muted)" }}>
          <div className="text-[12px] font-semibold">{filteredThreads.length.toLocaleString()} conversations</div>
          <div className="text-[11px] text-[var(--text-dim)]">Reader opens as a popover modal.</div>
        </div>
        <ThreadList threads={filteredThreads} selectedThread={selectedThread} onSelect={setSelectedThread} loading={loading} />
      </section>

      {selectedThread && <ThreadView thread={selectedThread} onClose={() => setSelectedThread(null)} />}
    </div>
  );
}

function formatTabLabel(tab: string) {
  return tab
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
