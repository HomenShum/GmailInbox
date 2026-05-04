"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";

const ROW_HEIGHT = 88;
const OVERSCAN = 8;

export function ThreadList({ threads, selectedThread, onSelect, loading = false }: { threads: any[]; selectedThread: any; onSelect: (t: any) => void; loading?: boolean }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState({ start: 0, end: 50 });

  function updateRange() {
    const el = scrollerRef.current;
    if (!el) return;
    const start = Math.max(0, Math.floor(el.scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visibleCount = Math.ceil(el.clientHeight / ROW_HEIGHT) + OVERSCAN * 2;
    setRange({ start, end: Math.min(threads.length, start + visibleCount) });
  }

  useEffect(() => {
    updateRange();
    window.addEventListener("resize", updateRange);
    return () => window.removeEventListener("resize", updateRange);
  }, [threads.length]);

  const visibleThreads = useMemo(() => threads.slice(range.start, range.end), [range.end, range.start, threads]);
  const topSpacer = range.start * ROW_HEIGHT;
  const bottomSpacer = Math.max(0, (threads.length - range.end) * ROW_HEIGHT);

  return (
    <div ref={scrollerRef} onScroll={updateRange} className="flex-1 overflow-y-auto">
      {loading && threads.length === 0 ? (
        <div className="p-3 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-md border p-3" style={{ borderColor: "var(--border-muted)" }}>
              <div className="skeleton h-3 w-1/2 rounded mb-2" />
              <div className="skeleton h-3 w-4/5 rounded mb-2" />
              <div className="skeleton h-3 w-2/3 rounded" />
            </div>
          ))}
        </div>
      ) : threads.length === 0 ? (
        <div className="text-center py-8 text-[12px] text-[var(--text-muted)]">No emails found</div>
      ) : (
        <>
          {topSpacer > 0 && <div style={{ height: topSpacer }} />}
          {visibleThreads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              selected={selectedThread?.id === thread.id}
              onSelect={onSelect}
            />
          ))}
          {bottomSpacer > 0 && <div style={{ height: bottomSpacer }} />}
          {threads.length > 0 && (
            <div className="py-3 text-center text-[11px] text-[var(--text-muted)]">
              Showing {threads.length.toLocaleString()} conversations
            </div>
          )}
        </>
      )}
    </div>
  );
}

const ThreadRow = memo(function ThreadRow({ thread, selected, onSelect }: { thread: any; selected: boolean; onSelect: (t: any) => void }) {
  return (
    <button
      type="button"
      data-testid="thread-row"
      onClick={() => onSelect(thread)}
      className={`w-full p-3 text-left cursor-pointer border-l-2 transition-colors ${selected
          ? "bg-[var(--accent-50)] border-[var(--accent)]"
          : "border-transparent hover:bg-[var(--bg-subtle)]"
        }`}
      style={{ contentVisibility: "auto", containIntrinsicSize: `${ROW_HEIGHT}px`, height: ROW_HEIGHT, boxSizing: "border-box" }}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-[12px] font-medium truncate" style={{ color: "var(--text)" }}>{thread.from_name || thread.from_addr}</div>
        <div className="text-[11px] whitespace-nowrap text-[var(--text-muted)]">{new Date(thread.internal_date * 1000).toLocaleDateString()}</div>
      </div>
      <div className="text-[12px] font-medium truncate mb-1" style={{ color: "var(--text)" }}>{thread.subject}</div>
      <div className="text-[12px] truncate mb-2" style={{ color: "var(--text-dim)" }}>{thread.snippet}</div>
      <div className="flex items-center gap-1.5">
        {thread.lane && (
          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-subtle)", color: "var(--text-dim)" }}>{thread.lane.replace("_", " ")}</span>
        )}
        {thread.is_unread && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />}
      </div>
    </button>
  );
});
