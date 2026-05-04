"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import CommandPalette from "./CommandPalette";

type Toast = { id: string; tone: "ok" | "err" | "info"; text: string };

const shortcuts: Record<string, string> = {
  "g d": "/",
  "g t": "/",
  "g i": "/inbox",
  "g x": "/inbox?tab=triage",
  "g c": "/calendar",
  "g g": "/goals",
  "g r": "/goals",
  "g b": "/",
  "g a": "/settings?tab=automations",
  "g s": "/settings",
};

const AUTOPILOT_LAST_RUN_KEY = "gmail_workspace_autopilot_last_run";
const AUTOPILOT_INTERVAL_MS = 60 * 60 * 1000;
const AUTOPILOT_OPEN_DELAY_MS = 60 * 1000;

export default function WorkspaceClient() {
  const router = useRouter();
  const pathname = usePathname();
  const [helpOpen, setHelpOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const routeStartRef = useRef<{ at: number; href: string; source: string } | null>(null);

  useEffect(() => {
    let pendingG = false;
    let pendingTimer: number | undefined;

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (isTyping) return;

      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }

      if (event.key === "Escape") {
        setHelpOpen(false);
        return;
      }

      if (event.key === "g") {
        pendingG = true;
        if (pendingTimer) window.clearTimeout(pendingTimer);
        pendingTimer = window.setTimeout(() => { pendingG = false; }, 1200);
        return;
      }

      if (pendingG) {
        const route = shortcuts[`g ${event.key}`];
        pendingG = false;
        if (pendingTimer) window.clearTimeout(pendingTimer);
        if (route) {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent("workspace:navigation-start", { detail: { href: route, source: "keyboard" } }));
          router.push(route);
          pushToast(setToasts, { tone: "info", text: `Opened ${route === "/" ? "today" : route.slice(1)}` });
        }
      }
    }

    function onToast(event: Event) {
      const detail = (event as CustomEvent<Partial<Toast>>).detail ?? {};
      pushToast(setToasts, { tone: detail.tone ?? "info", text: detail.text ?? "Done" });
    }

    function onNavigationStart(event: Event) {
      const detail = (event as CustomEvent<{ href?: string; source?: string }>).detail ?? {};
      routeStartRef.current = { at: performance.now(), href: detail.href ?? "", source: detail.source ?? "unknown" };
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("workspace:toast", onToast);
    window.addEventListener("workspace:navigation-start", onNavigationStart);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("workspace:toast", onToast);
      window.removeEventListener("workspace:navigation-start", onNavigationStart);
      if (pendingTimer) window.clearTimeout(pendingTimer);
    };
  }, [router]);

  useEffect(() => {
    const start = routeStartRef.current;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const durationMs = start ? Math.round((performance.now() - start.at) * 10) / 10 : 0;
        const record = {
          pathname,
          durationMs,
          source: start?.source ?? "route-render",
          at: new Date().toISOString(),
        };
        const win = window as typeof window & { __gmailWorkspacePerf?: typeof record[] };
        win.__gmailWorkspacePerf = [record, ...(win.__gmailWorkspacePerf ?? [])].slice(0, 40);
        routeStartRef.current = null;
      });
    });
  }, [pathname]);

  useEffect(() => {
    async function runAutopilot() {
      const lastRun = Number(window.localStorage.getItem(AUTOPILOT_LAST_RUN_KEY) ?? "0");
      if (Number.isFinite(lastRun) && Date.now() - lastRun < AUTOPILOT_INTERVAL_MS) return;
      if (document.visibilityState !== "visible") return;

      window.localStorage.setItem(AUTOPILOT_LAST_RUN_KEY, String(Date.now()));
      try {
        const res = await fetch("/api/autopilot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "local", trigger: "open_app" }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.errors?.[0] ?? "Autopilot failed");

        const total =
          Number(payload.classified ?? 0) +
          Number(payload.jobsCreated ?? 0) +
          Number(payload.opportunitiesCreated ?? 0) +
          Number(payload.recommendationsCreated ?? 0);
        if (total > 0) {
          pushToast(setToasts, { tone: "ok", text: `Autopilot processed ${total.toLocaleString()} items` });
        }
        window.dispatchEvent(new CustomEvent("workspace:autopilot-complete", { detail: payload }));
      } catch {
        pushToast(setToasts, { tone: "err", text: "Autopilot could not complete" });
      }
    }

    const timer = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(() => { void runAutopilot(); }, { timeout: 20_000 });
      } else {
        void runAutopilot();
      }
    }, AUTOPILOT_OPEN_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" data-testid="keyboard-help">
          <div className="w-[420px] rounded-lg border bg-[var(--bg-elev)] p-4 shadow-lg" style={{ borderColor: "var(--border)" }}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[13px] font-semibold">Keyboard Shortcuts</div>
              <button className="text-[12px] text-[var(--text-dim)]" onClick={() => setHelpOpen(false)}>Close</button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <Shortcut keys="g d" label="Today" />
              <Shortcut keys="g i" label="Inbox" />
              <Shortcut keys="g c" label="Calendar" />
              <Shortcut keys="g g" label="Goals" />
              <Shortcut keys="g b" label="Today briefing" />
              <Shortcut keys="g x" label="Label review" />
              <Shortcut keys="g r" label="Goals" />
              <Shortcut keys="g a" label="Automations" />
              <Shortcut keys="?" label="Open help" />
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-4 right-[380px] z-50 space-y-2" data-testid="toast-stack">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="min-w-56 rounded-md border bg-[var(--bg-elev)] px-3 py-2 text-[12px] shadow-md"
            style={{ borderColor: toast.tone === "err" ? "var(--err)" : toast.tone === "ok" ? "var(--ok)" : "var(--border)" }}
          >
            {toast.text}
          </div>
        ))}
      </div>
    </>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between rounded bg-[var(--bg-subtle)] px-2 py-1.5">
      <span className="text-[var(--text-dim)]">{label}</span>
      <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[10px]" style={{ borderColor: "var(--border)" }}>{keys}</kbd>
    </div>
  );
}

function pushToast(setToasts: (fn: (prev: Toast[]) => Toast[]) => void, input: Omit<Toast, "id">) {
  const id = Math.random().toString(36).slice(2, 10);
  setToasts((prev) => [...prev, { id, ...input }].slice(-3));
  window.setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 3500);
}
