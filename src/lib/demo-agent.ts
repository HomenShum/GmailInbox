/**
 * Demo agent — activates when no LLM key is present.
 *
 * Pattern-matches the user's last message against a small intent grammar and
 * emits the same SSE event stream the real pi-ai loop produces. Real tool
 * handlers are invoked end-to-end (this is the whole point — proves the MCP
 * tool wiring works without requiring the user hand over an API key first).
 *
 * The moment OPENROUTER_API_KEY or ANTHROPIC_API_KEY is set, runAgent() takes over.
 */

import { callTool } from "./tools";
import type { AgentEvent, ChatRequestMessage } from "./agent";

interface Intent {
  match: RegExp;
  steps: Array<{ name: string; args: Record<string, unknown> | ((m: string) => Record<string, unknown>) }>;
  preamble: string;
  closing?: (results: unknown[]) => string;
}

const INTENTS: Intent[] = [
  {
    match: /\b(pinned|pin|context|artifact|resume)\b/i,
    preamble: "Pulling the pinned workspace context.",
    steps: [{ name: "list_pinned_artifacts", args: {} }],
    closing: (r) => {
      const artifacts = (r[0] as any)?.artifacts ?? [];
      if (!artifacts.length) return "Nothing is pinned yet. Open Settings -> Context to pin your resume, story bank, or target list.";
      const primary = artifacts.find((artifact: any) => artifact.is_primary) ?? artifacts[0];
      return `Primary lens: **${primary.name}**. Pinned artifacts: ${artifacts.map((artifact: any) => artifact.name).join(", ")}. I can use these for local matching, briefings, and interview prep.`;
    },
  },
  {
    match: /\b(what|whats|show|list).*(inbox|lanes?|emails?)\b|^(overview|status|summary)\b/i,
    preamble: "Sure — pulling the lane summary.",
    steps: [{ name: "list_lanes", args: { top: 3 } }],
    closing: (r) => {
      const data = (r[0] as any)?.lanes ?? {};
      const top = Object.entries(data)
        .map(([k, v]: [string, any]) => `${k}:${v.count}`)
        .filter((s) => !s.endsWith(":0"));
      return `Top of stack: **${top.join(" · ")}**. Want me to draft a reply for the most urgent one, archive a batch, or zoom into a lane?`;
    },
  },
  {
    match: /\bcount(s)?\b|\bhow many\b/i,
    preamble: "Counting…",
    steps: [{ name: "lane_counts", args: {} }],
    closing: (r) => {
      const c = (r[0] as any)?.counts ?? {};
      const total = (Object.values(c) as number[]).reduce((a, b) => a + b, 0);
      return `${total} emails classified across ${Object.keys(c).length} lanes.`;
    },
  },
  {
    match: /\b(search|find|look up|where).*\b(for|about)?\s+(?<q>[\w\s$#'-]{2,40})$/i,
    preamble: "Searching the local store…",
    steps: [{ name: "search_emails", args: (m: string) => ({ query: extractQuery(m), limit: 5 }) }],
    closing: (r) => {
      const res = (r[0] as any)?.results ?? [];
      if (!res.length) return "Nothing matched.";
      return `Found ${res.length}:\n${res.map((e: any) => `  • ${e.from}: ${e.subject}`).join("\n")}`;
    },
  },
  {
    match: /\barchive (all|every).*\b(linkedin|job alerts?)\b/i,
    preamble: "OK — bulk-archiving everything in the Job Alerts lane.",
    steps: [
      { name: "list_lanes", args: { top: 20 } },
      { name: "bulk_archive", args: () => ({ ids: [] }) }, // populated mid-run
    ],
    closing: (r) => {
      const archived = (r[1] as any)?.archived ?? 0;
      return `Archived ${archived}. Undo via the action log if you need it back.`;
    },
  },
  {
    match: /\bclassify( everything| all| now)?\b|\btriage\b/i,
    preamble: "Running the heuristic classifier on anything still unclassified.",
    steps: [{ name: "classify_unclassified", args: { limit: 500 } }],
    closing: (r) => {
      const a = r[0] as any;
      return `Sorted ${a?.classified ?? 0} emails (${a?.fell_through_to_triage ?? 0} need label review).`;
    },
  },
  {
    match: /\b(draft|write|reply).*recruiter\b|\bmost urgent recruiter\b/i,
    preamble: "Picking the highest-urgency Career-lane card and saving a draft reply.",
    steps: [
      { name: "list_lanes", args: { top: 1 } },
      { name: "draft_reply", args: () => ({ id: "", body: "" }) }, // populated mid-run
    ],
    closing: (r) => {
      const id = (r[1] as any)?.id;
      if (!id) return "No Career-lane cards available.";
      return `Draft saved on ${id}. (No-key demo mode used a canned template — set OPENROUTER_API_KEY for an LLM-written reply.)`;
    },
  },
];

function extractQuery(msg: string): string {
  const m = msg.match(/\b(?:search|find|look up|about|for)\s+(?:emails?\s+)?(?:about|for|on)?\s*['"]?([\w\s$#'-]{2,40})/i);
  return (m?.[1] ?? msg).trim().replace(/['"]/g, "");
}

function pickIntent(msg: string): Intent {
  for (const i of INTENTS) if (i.match.test(msg)) return i;
  // default
  return {
    match: /.*/,
    preamble: "I'm in no-key demo mode. Try: \"what's in my inbox\", \"classify everything\", \"archive all linkedin job alerts\", or \"search for openai\".",
    steps: [{ name: "lane_counts", args: {} }],
    closing: (r) => {
      const c = (r[0] as any)?.counts ?? {};
      const total = (Object.values(c) as number[]).reduce((a, b) => a + b, 0);
      return `For reference: ${total} emails in ${Object.keys(c).length} lanes right now.`;
    },
  };
}

export async function* runDemoAgent(history: ChatRequestMessage[]): AsyncGenerator<AgentEvent> {
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const msg = lastUser?.content ?? "";
  const intent = pickIntent(msg);

  yield { type: "status", model: "demo-rules", provider: "local", hop: 0 };
  yield { type: "text", text: intent.preamble };

  const results: unknown[] = [];
  for (let i = 0; i < intent.steps.length; i++) {
    const step = intent.steps[i];
    let args: Record<string, unknown> =
      typeof step.args === "function" ? (step.args as any)(msg) : step.args;

    // Cross-step argument plumbing
    if (step.name === "bulk_archive" && i > 0) {
      const lanes = (results[0] as any)?.lanes ?? {};
      const ids = (lanes.job_alerts?.top_cards ?? []).map((c: any) => c.id);
      args = { ids };
      if (!ids.length) {
        yield { type: "text", text: "\n(No Job-Alerts cards to archive.)" };
        continue;
      }
    }
    if (step.name === "draft_reply" && i > 0) {
      const lanes = (results[0] as any)?.lanes ?? {};
      const id = lanes.career?.top_cards?.[0]?.id;
      if (!id) {
        yield { type: "text", text: "\n(No Career-lane cards to reply to.)" };
        continue;
      }
      args = {
        id,
        body: "Hi - thanks for reaching out. The role sounds interesting; happy to set up a 20-min call this week. Could you share comp range and remote/onsite expectations?",
      };
    }

    const id = `demo_${i}_${Math.random().toString(36).slice(2, 8)}`;
    yield { type: "tool_call", id, name: step.name, arguments: args };
    const result = await callTool(step.name, args);
    results.push(result);
    yield { type: "tool_result", toolCallId: id, toolName: step.name, result };
  }

  if (intent.closing) {
    yield { type: "text", text: "\n\n" + intent.closing(results) };
  }
  yield { type: "cost", micro_usd: 0, total_micro_usd: 0, input_tokens: 0, output_tokens: 0 };
  yield { type: "done", total_cost_micro_usd: 0, hops: intent.steps.length };
}
