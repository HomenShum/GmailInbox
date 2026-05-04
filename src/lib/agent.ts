/**
 * Chat agent loop. Pattern lifted from parity-studio convex/chatLoop.ts:
 *   - MAX_HOPS=8 ReAct loop (pi-ai complete -> exec tools -> push toolResult -> repeat)
 *   - env-overridable model with sensible default ladder
 *   - integer-micro-USD cost capture (HONEST cost telemetry, no float drift)
 *
 * Streamed via SSE — events: { type: 'text', text } | { type: 'tool_call', ... } |
 * { type: 'tool_result', ... } | { type: 'cost', ... } | { type: 'done' } | { type: 'error', msg }.
 */

import {
  type AssistantMessage,
  type Context,
  type Message,
  type TextContent,
  type Tool,
  type ToolCall,
  complete as piComplete,
  getModel,
} from "@mariozechner/pi-ai";

import { TOOL_LIST, callTool } from "./tools";
import { resolveModel, hasAnyKey, FREE_LADDER, type ModelChoice } from "./models";
import { LANES } from "./lanes";

const MAX_HOPS = 8;

const SYSTEM_PROMPT = `You are the agent inside the Gmail Workspace dashboard.

The user's inbox lives in a local SQLite DB. You triage email by calling the
atomic tools below. Each tool is idempotent and undo-able via the action log.

Lanes (bounded enum):
${LANES.join(", ")}

Rules:
- Be concise. 1-3 short sentences before/between tool calls.
- Always list_lanes first if the user asks "what's in my inbox" — never invent counts.
- Before archiving or labeling more than 5 items, summarize the targets and ask once.
- Never invent email ids. If unsure, search_emails first.
- For "draft a reply", use draft_reply (does NOT send — just stores the draft).
- After a batch of edits, summarize what changed and offer the next move.
- If a tool returns ok:false, tell the user the exact error — do NOT retry blindly.
`;

const TOOLS: Tool[] = TOOL_LIST.map((t) => ({
  name: t.name,
  description: t.description,
  parameters: t.parameters as Tool["parameters"],
}));

export interface ChatRequestMessage {
  role: "user" | "assistant" | "toolResult";
  content: string;
  toolCallId?: string;
  toolName?: string;
}

export type AgentEvent =
  | { type: "status"; model: string; provider: string; hop: number }
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; arguments: unknown }
  | { type: "tool_result"; toolCallId: string; toolName: string; result: unknown }
  | { type: "cost"; micro_usd: number; total_micro_usd: number; input_tokens: number; output_tokens: number }
  | { type: "model_fallback"; from: string; to: string; reason: string }
  | { type: "done"; total_cost_micro_usd: number; hops: number }
  | { type: "error"; message: string };

function usdToMicroUsd(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) return 0;
  return Math.floor(usd * 1_000_000);
}

function emptyUsage() {
  return { input: 0, output: 0, totalTokens: 0, cacheRead: 0, cacheWrite: 0,
    cost: { total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
}

function userMessages(history: ChatRequestMessage[]): Message[] {
  // Convert API-shape history into pi-ai Message[]. We collapse simple content into TextContent.
  const out: Message[] = [];
  for (const m of history) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content, timestamp: Date.now() });
    } else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: [{ type: "text", text: m.content } as TextContent],
        api: "anthropic-messages",
        provider: "anthropic",
        model: "history",
        usage: emptyUsage(),
        stopReason: "stop",
        timestamp: Date.now(),
      } as AssistantMessage);
    } else {
      out.push({
        role: "toolResult",
        toolCallId: m.toolCallId ?? "unknown",
        toolName: m.toolName ?? "unknown",
        content: [{ type: "text", text: m.content }],
        isError: false,
        timestamp: Date.now(),
      });
    }
  }
  return out;
}

async function tryComplete(choice: ModelChoice, ctxObj: Context) {
  // pi-ai's getModel is typed against compile-time MODEL registry. We accept arbitrary strings
  // at this boundary (env-driven model overrides) — same approach as parity-studio.
  // biome-ignore lint/suspicious/noExplicitAny: pi-ai getModel surface
  const model = (getModel as any)(choice.provider, choice.model);
  return piComplete(model, ctxObj, { maxOutputTokens: 4_000 });
}

export async function* runAgent(history: ChatRequestMessage[]): AsyncGenerator<AgentEvent> {
  if (!hasAnyKey()) {
    // No key — run the rule-based demo agent instead, so the user can still
    // see end-to-end tool wiring + UI behavior without handing over a secret.
    const { runDemoAgent } = await import("./demo-agent");
    yield* runDemoAgent(history);
    return;
  }

  const cfg = resolveModel();
  const messages = userMessages(history);
  let totalMicroUsd = 0;

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const ctxObj: Context = { systemPrompt: SYSTEM_PROMPT, messages, tools: TOOLS };

    let result: AssistantMessage | null = null;
    let attemptIdx = 0;
    const ladder = [{ provider: cfg.provider, model: cfg.model, free: cfg.provider !== "anthropic" }, ...FREE_LADDER];
    let lastErr = "";

    for (; attemptIdx < ladder.length; attemptIdx++) {
      const choice = ladder[attemptIdx];
      yield { type: "status", model: choice.model, provider: choice.provider, hop };
      try {
        result = await tryComplete(choice, ctxObj);
        if (attemptIdx > 0) yield { type: "model_fallback", from: ladder[0].model, to: choice.model, reason: lastErr };
        break;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
        // Only fall back on auth/rate-limit-y errors. Other errors bubble.
        if (!/rate.?limit|429|quota|unauthor|401|403|model.*not.*found/i.test(lastErr)) {
          yield { type: "error", message: `model error: ${lastErr}` };
          return;
        }
        // try next
      }
    }
    if (!result) {
      yield { type: "error", message: `all models in ladder failed. last: ${lastErr}` };
      return;
    }

    const textBlocks = result.content.filter((b): b is TextContent => b.type === "text");
    const toolCalls = result.content.filter((b): b is ToolCall => b.type === "toolCall");
    const text = textBlocks.map((b) => b.text).join("").trim();

    if (text) yield { type: "text", text };

    const microThis = usdToMicroUsd(result.usage.cost.total);
    totalMicroUsd += microThis;
    yield {
      type: "cost", micro_usd: microThis, total_micro_usd: totalMicroUsd,
      input_tokens: result.usage.input, output_tokens: result.usage.output,
    };

    messages.push({
      role: "assistant", content: result.content,
      api: result.api, provider: result.provider, model: result.model,
      usage: result.usage, stopReason: result.stopReason,
      timestamp: Date.now(),
    } as AssistantMessage);

    if (toolCalls.length === 0) {
      yield { type: "done", total_cost_micro_usd: totalMicroUsd, hops: hop + 1 };
      return;
    }

    for (const tc of toolCalls) {
      yield { type: "tool_call", id: tc.id, name: tc.name, arguments: tc.arguments ?? {} };
      const res = await callTool(tc.name, tc.arguments ?? {});
      yield { type: "tool_result", toolCallId: tc.id, toolName: tc.name, result: res };
      messages.push({
        role: "toolResult",
        toolCallId: tc.id,
        toolName: tc.name,
        content: [{ type: "text", text: JSON.stringify(res) }],
        isError: !res.ok,
        timestamp: Date.now(),
      });
    }
  }

  yield { type: "done", total_cost_micro_usd: totalMicroUsd, hops: MAX_HOPS };
}
