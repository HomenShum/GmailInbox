"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  Flag,
  BriefcaseBusiness,
  Home,
  Inbox,
  MailQuestion,
  Settings,
  Target,
} from "lucide-react";
import { LANES, LANE_META } from "@/lib/lanes";
import { cn } from "@/lib/utils";

interface SidebarProps {
  counts?: Record<string, number>;
}

type NavItem = {
  name: string;
  href: string;
  icon: ReactNode;
  exact?: boolean;
  aliases?: string[];
  badge?: number;
};

export default function Sidebar({ counts: initialCounts = {} }: SidebarProps) {
  const pathname = usePathname();
  const [laneCounts, setLaneCounts] = useState<Record<string, number>>(initialCounts);

  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/emails")
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setLaneCounts(j.counts ?? {}); })
      .catch(() => {});
    const first = window.setTimeout(load, 250);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const primaryNav: NavItem[] = [
    { name: "Today", href: "/", icon: <Home className="h-4 w-4" />, exact: true, aliases: ["/pulse", "/briefings"] },
    { name: "Inbox", href: "/inbox", icon: <Inbox className="h-4 w-4" />, badge: laneCounts.reply_now },
    { name: "Calendar", href: "/calendar", icon: <CalendarDays className="h-4 w-4" /> },
    { name: "Goals", href: "/goals", icon: <Target className="h-4 w-4" />, aliases: ["/planner", "/career", "/personal", "/jobs", "/opportunities", "/analytics"] },
    { name: "Settings", href: "/settings", icon: <Settings className="h-4 w-4" />, aliases: ["/automations"] },
  ];

  const inboxModes = [
    { name: "Needs reply", detail: "You may owe a response", href: "/inbox?tab=reply_now", count: (laneCounts.reply_now ?? 0) + (laneCounts.career ?? 0), icon: <MailQuestion className="h-3.5 w-3.5" /> },
    { name: "Top jobs", detail: "Ranked by pinned files", href: "/jobs", count: laneCounts.job_alerts, icon: <BriefcaseBusiness className="h-3.5 w-3.5" /> },
    { name: "Bills/admin", detail: "Money and logistics", href: "/inbox?tab=admin", count: (laneCounts.money ?? 0) + (laneCounts.subscriptions ?? 0) + (laneCounts.travel_auto ?? 0), icon: <Flag className="h-3.5 w-3.5" /> },
    { name: "Label review", detail: "Check uncertain labels", href: "/inbox?tab=triage", count: laneCounts.triage, icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    { name: "Safe archive", detail: "Review before changes", href: "/?lane=auto_archive", count: laneCounts.auto_archive, icon: <Archive className="h-3.5 w-3.5" /> },
  ];

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-full w-[220px] flex-col border-r bg-[var(--bg-elev)]" style={{ borderColor: "var(--border)" }}>
      <div className="shrink-0 border-b p-3" style={{ borderColor: "var(--border)" }}>
        <div className="text-[15px] font-bold leading-tight" style={{ color: "var(--accent)" }}>
          gmail<span className="font-normal text-[var(--text-muted)]">/workspace</span>
        </div>
        <div className="mt-0.5 text-[11px] text-[var(--text-dim)]">Personal operating system</div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        <NavLabel>Workspace</NavLabel>
        {primaryNav.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            active={isActive(pathname, item)}
            badge={item.badge}
          >
            {item.name}
          </NavLink>
        ))}

        <div className="mx-2 my-4 border-t" style={{ borderColor: "var(--border-muted)" }} />

        <NavLabel>Review queues</NavLabel>
        {inboxModes.map((view) => (
          <Link
            key={view.name}
            href={view.href}
            className="mx-1 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12px] text-[var(--text-dim)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
          >
            <span className="flex min-w-0 items-start gap-1.5">
              <span className="shrink-0">{view.icon}</span>
              <span className="min-w-0">
                <span className="block truncate">{view.name}</span>
                <span className="block truncate text-[10px] text-[var(--text-muted)]">{view.detail}</span>
              </span>
            </span>
            {view.count !== undefined && view.count > 0 && <Badge>{compactCount(view.count)}</Badge>}
          </Link>
        ))}

        <details className="mx-1 mt-4 rounded-md border bg-[var(--bg-elev)]" style={{ borderColor: "var(--border)" }}>
          <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            More labels
          </summary>
          <div className="pb-2">
            {LANES.slice(0, 10).map((lane) => {
              const meta = LANE_META[lane];
              const count = laneCounts[lane] ?? 0;
              return (
                <Link
                  key={lane}
                  href={`/inbox?tab=${lane}`}
                  className="mx-1 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12px] text-[var(--text-dim)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.tone }} />
                    <span className="truncate">{meta.title}</span>
                  </div>
                  {count > 0 && <Badge>{compactCount(count)}</Badge>}
                </Link>
              );
            })}
          </div>
        </details>
      </nav>

      <div className="shrink-0 border-t p-2" style={{ borderColor: "var(--border)" }} />
    </aside>
  );
}

function NavLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 px-2">
      <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">{children}</span>
    </div>
  );
}

function NavLink({ href, icon, active, badge, children }: {
  href: string;
  icon: ReactNode;
  active: boolean;
  badge?: number;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "mx-1 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-[var(--accent-50)] font-medium text-[var(--accent-600)]"
          : "text-[var(--text-dim)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{children}</span>
      </div>
      {badge !== undefined && badge > 0 && <span className="shrink-0 rounded bg-[var(--err)] px-1.5 py-0.5 text-[10px] text-white">{compactCount(badge)}</span>}
    </Link>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="shrink-0 rounded bg-[var(--border-muted)] px-1.5 py-0.5 text-[10px] text-[var(--text-dim)]">{children}</span>;
}

function isActive(pathname: string, item: NavItem) {
  if (item.exact && pathname === item.href) return true;
  if (!item.exact && pathname.startsWith(item.href)) return true;
  return item.aliases?.some((alias) => pathname.startsWith(alias)) ?? false;
}

function compactCount(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}
