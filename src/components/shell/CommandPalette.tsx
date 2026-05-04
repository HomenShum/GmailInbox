"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Bot, Command, Search } from "lucide-react";
import { actionsForPathname, type WorkspaceAction } from "@/lib/action-registry";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const actions = useMemo(() => {
    const scoped = actionsForPathname(pathname);
    const q = query.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((action) => {
      const haystack = [
        action.label,
        action.description,
        action.group,
        action.shortcut,
        ...(action.keywords ?? []),
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [pathname, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  function runAction(action: WorkspaceAction) {
    window.dispatchEvent(new CustomEvent("workspace:command-run", { detail: { id: action.id, label: action.label } }));
    if (action.agentPrompt) {
      window.dispatchEvent(new CustomEvent("workspace:agent-focus", { detail: { prompt: action.agentPrompt } }));
    }
    if (action.href) {
      window.dispatchEvent(new CustomEvent("workspace:navigation-start", { detail: { href: action.href, source: "command-palette" } }));
      router.push(action.href);
    }
    onClose();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(actions.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Enter" && actions[activeIndex]) {
      event.preventDefault();
      runAction(actions[activeIndex]);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border bg-[var(--bg-elev)] shadow-2xl"
        style={{ borderColor: "var(--border)" }}
        onClick={(event) => event.stopPropagation()}
        data-testid="command-palette"
      >
        <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <Search className="h-4 w-4 text-[var(--text-dim)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search actions, pages, or ask the agent..."
            className="h-8 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--text-dim)]"
          />
          <span className="rounded border px-1.5 py-0.5 text-[10px] text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
            Esc
          </span>
        </div>

        <div className="max-h-[54vh] overflow-y-auto p-2">
          {actions.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12px] text-[var(--text-dim)]">No matching actions</div>
          ) : (
            actions.map((action, index) => (
              <button
                key={action.id}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => runAction(action)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
                style={{ background: activeIndex === index ? "var(--bg-subtle)" : "transparent" }}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-[var(--accent-600)]" style={{ borderColor: "var(--border)" }}>
                  {action.agentPrompt ? <Bot className="h-4 w-4" /> : <Command className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium">{action.label}</span>
                    <span className="rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-dim)]">{action.group}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[var(--text-dim)]">{action.description}</span>
                </span>
                {action.shortcut && <span className="text-[10px] text-[var(--text-muted)]">{action.shortcut}</span>}
                <ArrowRight className="h-3.5 w-3.5 text-[var(--text-dim)]" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
