"use client";

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarDays, CheckSquare, FileText, PlusCircle, Search, Settings, Sparkles, Target } from "lucide-react";
import PinnedContextButton from "@/components/context/PinnedContextButton";

interface TopBarProps {
  onNewClick?: (type: string) => void;
}

interface GmailStatus {
  configured: boolean;
  connected: boolean;
  accounts: Array<{ account_email: string }>;
}

const newItems: Array<{ name: string; action: string; icon: ReactNode }> = [
  { name: "Draft Email", action: "compose", icon: "✉️" },
  { name: "Review Opportunities", action: "opportunity", icon: "🎯" },
  { name: "Extract Job Leads", action: "jobs", icon: "📋" },
  { name: "Create Automation", action: "automation", icon: "⚙️" },
];

newItems.splice(
  3,
  0,
  { name: "Open Calendar", action: "calendar", icon: <CalendarDays className="h-3.5 w-3.5" /> },
  { name: "Generate Briefing", action: "briefing", icon: <FileText className="h-3.5 w-3.5" /> },
);

const coreNewItems: Array<{ name: string; action: string; icon: ReactNode }> = [
  { name: "Draft Email", action: "compose", icon: <FileText className="h-3.5 w-3.5" /> },
  { name: "Create Todo", action: "todo", icon: <CheckSquare className="h-3.5 w-3.5" /> },
  { name: "Schedule Block", action: "calendar", icon: <CalendarDays className="h-3.5 w-3.5" /> },
  { name: "Open Goals", action: "goals", icon: <Target className="h-3.5 w-3.5" /> },
  { name: "Automation Settings", action: "automation", icon: <Settings className="h-3.5 w-3.5" /> },
];

export default function TopBar({ onNewClick }: TopBarProps) {
  const router = useRouter();
  const [showNewDropdown, setShowNewDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [gmail, setGmail] = useState<GmailStatus>({ configured: false, connected: false, accounts: [] });
  const [search, setSearch] = useState("");
  const [pendingApprovals, setPendingApprovals] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/auth/google/status")
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setGmail(j); })
      .catch(() => {});
    load();
    const id = setInterval(load, 90_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/approvals?status=pending&limit=25")
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setPendingApprovals(j.approvals?.length ?? 0); })
      .catch(() => {});
    load();
    const id = setInterval(load, 45_000);
    window.addEventListener("workspace:approval-created", load);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("workspace:approval-created", load);
    };
  }, []);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    goSearch();
  }

  function goSearch() {
    const q = search.trim();
    router.push(q ? `/inbox?q=${encodeURIComponent(q)}` : "/inbox");
  }

  function handleNewAction(action: string) {
    onNewClick?.(action);
    setShowNewDropdown(false);
    if (action === "compose") {
      window.dispatchEvent(new CustomEvent("workspace:agent-focus", { detail: { prompt: "Draft a new email to " } }));
      return;
    }
    if (action === "todo") {
      router.push("/goals");
      window.dispatchEvent(new CustomEvent("workspace:agent-focus", { detail: { prompt: "Create a todo from the current highest-priority workspace item." } }));
    }
    else if (action === "calendar") router.push("/calendar");
    else if (action === "goals") router.push("/goals");
    else if (action === "automation") router.push("/settings?tab=automations");
  }

  return (
    <header className="h-12 shrink-0 flex items-center gap-2 px-3 bg-[var(--bg-elev)] border-b z-20" style={{ borderColor: "var(--border)" }}>
      <form className="flex-1 max-w-md" onSubmit={submitSearch}>
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-dim)]" />
          <input
            id="global-search-input"
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                goSearch();
              }
            }}
            placeholder="Search emails..."
            className="w-full h-8 pl-9 pr-12 text-[12px] bg-[var(--bg-subtle)] border rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-50"
            style={{ borderColor: "var(--border)" }}
            suppressHydrationWarning
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)] opacity-60 hidden sm:block">Ctrl K</kbd>
        </div>
      </form>

      <div className="relative">
        <button
          onClick={() => setShowNewDropdown(!showNewDropdown)}
          className="flex items-center gap-1.5 h-8 px-3 text-[13px] font-medium text-white rounded-md transition-colors"
          style={{ background: "var(--accent)" }}
          suppressHydrationWarning
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New</span>
        </button>
        {showNewDropdown && (
          <div className="absolute top-full left-0 mt-1 w-52 bg-[var(--bg-elev)] border rounded-lg shadow-lg py-1 z-50" style={{ borderColor: "var(--border)" }}>
            {coreNewItems.map((item) => (
              <button
                key={item.action}
                onClick={() => handleNewAction(item.action)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--bg-subtle)] text-[var(--text)] transition-colors"
              >
                <span className="shrink-0">{item.icon}</span>
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => window.dispatchEvent(new CustomEvent("workspace:agent-focus"))}
        className="flex items-center gap-1.5 h-8 px-3 text-[13px] rounded-md transition-colors hover:bg-[var(--bg-subtle)]"
        style={{ color: "var(--accent)" }}
        suppressHydrationWarning
      >
        <Sparkles className="w-4 h-4" />
        <span className="hidden sm:inline text-[13px]">Agent</span>
      </button>

      <PinnedContextButton />

      <div className="relative">
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative h-8 w-8 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--bg-subtle)]"
          suppressHydrationWarning
        >
          <Bell className="w-4 h-4" style={{ color: "var(--text-dim)" }} />
          {pendingApprovals > 0 && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full" style={{ background: "var(--err)" }} />}
        </button>
        {showNotifications && (
          <div className="absolute top-full right-0 mt-1 w-64 bg-[var(--bg-elev)] border rounded-lg shadow-lg py-1 z-50" style={{ borderColor: "var(--border)" }}>
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
              Notifications
            </div>
            {[
              { id: 1, title: pendingApprovals ? `${pendingApprovals} approval waiting` : "No pending approvals", time: "live", unread: pendingApprovals > 0 },
              { id: 2, title: "Autopilot run log available", time: "recent", unread: false },
              { id: 3, title: "Review queues refreshed", time: "recent", unread: false },
            ].map((n) => (
              <div key={n.id} className={`px-3 py-2 transition-colors ${n.unread ? "bg-[var(--accent-50)]" : ""}`} style={{ borderBottom: `1px solid var(--border-muted)` }}>
                <div className="text-[12px] font-medium text-[var(--text)]">{n.title}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{n.time}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <a
        href="/settings"
        className="flex items-center gap-2 px-3 h-8 rounded-md text-[11px] hover:brightness-95 transition"
        style={{ background: gmail.connected ? "#ecfdf5" : "var(--bg-subtle)" }}
        title={gmail.connected ? gmail.accounts[0]?.account_email : (gmail.configured ? "Click to connect Gmail" : "OAuth not configured (see SETUP_GMAIL.md)")}
      >
        <span className="w-2 h-2 rounded-full pulse-dot" style={{ background: gmail.connected ? "var(--ok)" : "var(--text-muted)" }} />
        <span className="max-w-28 truncate" style={{ color: gmail.connected ? "var(--ok)" : "var(--text-dim)" }}>
          {gmail.connected ? gmail.accounts[0]?.account_email?.split("@")[0] : "Not connected"}
        </span>
      </a>
    </header>
  );
}
