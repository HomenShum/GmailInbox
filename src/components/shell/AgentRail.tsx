"use client";

import { useEffect, useState } from "react";
import { ChatInput } from "../chat/ChatInput";

interface AgentRailProps {
  routeContext?: RouteContext | null;
  modelConfig: { provider: string; model: string; keyVar: string; hasKey: boolean };
  className?: string;
}

export interface RouteContext {
  kind: "dashboard" | "pulse" | "inbox" | "triage" | "opportunities" | "jobs" | "personal" | "calendar" | "planner" | "briefings" | "automations" | "analytics" | "settings";
  selection?: { type: "email" | "opportunity" | "job" | "rule"; id: string; data?: any };
  candidateActions?: Array<{ label: string; action: string; variant?: "primary" | "secondary" | "danger" }>;
}

interface ToolEvent { id: string; name: string; args: unknown; result: unknown | null; ok: boolean | null }
interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ToolEvent[];
  cost_micro_usd: number;
  done: boolean;
  error?: string;
}

export default function AgentRail({ routeContext = null, modelConfig, className = "" }: AgentRailProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    function focusAgent(event: Event) {
      const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt;
      setCollapsed(false);
      if (prompt) setInput(prompt);
      window.setTimeout(() => document.getElementById("agent-chat-input")?.focus(), 0);
    }

    window.addEventListener("workspace:agent-focus", focusAgent);
    return () => window.removeEventListener("workspace:agent-focus", focusAgent);
  }, []);

  async function handleSend(message: string) {
    if (!message.trim() || running) return;
    const userTurn: Turn = { id: rid(), role: "user", text: message, tools: [], cost_micro_usd: 0, done: true };
    const asstTurn: Turn = { id: rid(), role: "assistant", text: "", tools: [], cost_micro_usd: 0, done: false };
    const next = [...turns, userTurn, asstTurn];
    setTurns(next);
    setInput("");
    setRunning(true);

    const apiHistory = next
      .filter((t) => t.role === "user" || (t.text && t.done))
      .map((t) => ({ role: t.role as "user" | "assistant", content: t.text }));

    try {
      const resp = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiHistory }),
      });
      if (!resp.body) throw new Error("no response body");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
          if (!block.trim() || block.startsWith(": ")) continue;
          const ev = parseSse(block); if (!ev) continue;
          setTurns((prev) => prev.map((t) => t.id === asstTurn.id ? applyEvent(t, ev) : t));
        }
      }
    } catch (err) {
      setTurns((prev) => prev.map((t) => t.id === asstTurn.id ? { ...t, error: String(err), done: true } : t));
    } finally {
      setRunning(false);
    }
  }

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className={`shrink-0 w-10 h-full bg-[var(--bg-elev)] border-l flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-[var(--bg-subtle)] transition-colors z-20 ${className}`}
        style={{ borderColor: "var(--border)" }}
        suppressHydrationWarning
      >
        <span className="text-[16px]">💬</span>
        <span className="text-[10px] text-[var(--text-dim)] transform -rotate-90 whitespace-nowrap">Chat</span>
      </button>
    );
  }

  return (
    <aside className={`w-[360px] shrink-0 bg-[var(--bg-elev)] border-l flex flex-col z-20 ${className}`} style={{ borderColor: "var(--border)" }}>
      <div className="h-12 shrink-0 flex items-center justify-between px-3 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-1.5">
          <span className="text-lg">💬</span>
          <span className="text-[13px] font-medium">Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
            style={{
              background: modelConfig.hasKey ? "var(--accent-50)" : "#fffbe6",
              color: modelConfig.hasKey ? "var(--accent-600)" : "var(--warn)",
            }}
          >
            {modelConfig.hasKey ? truncate(modelConfig.model, 22) : "demo mode"}
          </span>
          <button
            onClick={() => setCollapsed(true)}
            className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-dim)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)] transition-colors"
            suppressHydrationWarning
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l6-6M9 9L3 3" /></svg>
          </button>
        </div>
      </div>

      {routeContext && (
        <div className="px-3 py-2 border-b text-[11px]" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-1.5 text-[var(--text-dim)]">
            <span>📂</span>
            <span className="capitalize">{routeContext.kind}</span>
            {routeContext.selection && (
              <>
                <span className="text-[var(--border)]">/</span>
                <span className="text-[var(--text)] truncate">
                  {routeContext.selection.data?.subject || routeContext.selection.data?.name || routeContext.selection.id}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {turns.length === 0 && (
          <div className="space-y-2">
            <div className="text-[12px] text-[var(--text-dim)] leading-relaxed">
              {modelConfig.hasKey ? "Try a quick command:" : "No API key - running rule-based demo agent. Try:"}
            </div>
            {DEFAULT_PROMPTS.map((p) => (
              <button key={p}
                onClick={() => handleSend(p)}
                className="w-full text-left text-[12px] px-2.5 py-1.5 rounded border hover:bg-[var(--bg-subtle)]"
                style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
                suppressHydrationWarning
              >
                {p}
              </button>
            ))}
          </div>
        )}
        {turns.map((t) => <TurnView key={t.id} turn={t} />)}
      </div>

      <ChatInput inputId="agent-chat-input" value={input} onChange={setInput} onSend={handleSend} disabled={running} />
    </aside>
  );
}

const DEFAULT_PROMPTS = [
  "what's in my inbox right now",
  "show my pinned workspace context",
  "classify everything",
  "draft a reply to the most urgent recruiter",
  "find safe archive candidates for review",
];

function TurnView({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <div className="text-[12px]">
        <div className="text-[10px] uppercase text-[var(--text-dim)] mb-0.5">you</div>
        <div className="text-[var(--text)]">{turn.text}</div>
      </div>
    );
  }
  return (
    <div className="text-[12px] space-y-1.5">
      <div className="text-[10px] uppercase text-[var(--text-dim)]">agent {!turn.done && <span className="pulse-dot">▌</span>}</div>
      {turn.text && <div className="text-[var(--text)] whitespace-pre-wrap leading-relaxed">{turn.text}</div>}
      {turn.tools.map((tc) => <ToolView key={tc.id} t={tc} />)}
      {turn.error && <div className="text-[11px]" style={{ color: "var(--err)" }}>{turn.error}</div>}
    </div>
  );
}

function ToolView({ t }: { t: ToolEvent }) {
  const tone = t.ok === false ? "var(--err)" : t.ok === true ? "var(--ok)" : "var(--text-dim)";
  const argsStr = JSON.stringify(t.args);
  return (
    <div className="text-[10px] font-mono p-1.5 rounded border" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
      <div className="flex items-center gap-1.5">
        <span style={{ color: tone }}>●</span>
        <span style={{ color: "var(--accent-600)" }}>{t.name}</span>
        <span className="text-[var(--text-dim)] truncate flex-1">{argsStr.length > 60 ? argsStr.slice(0, 60) + "…" : argsStr}</span>
      </div>
    </div>
  );
}

function rid() { return Math.random().toString(36).slice(2, 10); }
function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

interface Sse { event: string; data: any }
function parseSse(block: string): Sse | null {
  const lines = block.split("\n");
  let event = "message"; let data = "";
  for (const l of lines) {
    if (l.startsWith("event: ")) event = l.slice(7).trim();
    else if (l.startsWith("data: ")) data += l.slice(6);
  }
  if (!data) return null;
  try { return { event, data: JSON.parse(data) }; } catch { return null; }
}

function applyEvent(t: Turn, ev: Sse): Turn {
  switch (ev.event) {
    case "text":     return { ...t, text: t.text + ev.data.text };
    case "tool_call": return { ...t, tools: [...t.tools, { id: ev.data.id, name: ev.data.name, args: ev.data.arguments, result: null, ok: null }] };
    case "tool_result": {
      const ok = ev.data.result?.ok === true ? true : ev.data.result?.ok === false ? false : null;
      return { ...t, tools: t.tools.map((tc) => tc.id === ev.data.toolCallId ? { ...tc, result: ev.data.result, ok } : tc) };
    }
    case "cost":      return { ...t, cost_micro_usd: ev.data.total_micro_usd };
    case "done":      return { ...t, done: true, cost_micro_usd: ev.data.total_cost_micro_usd };
    case "error":     return { ...t, done: true, error: ev.data.message };
    default:          return t;
  }
}
