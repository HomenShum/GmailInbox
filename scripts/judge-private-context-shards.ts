import fs from "node:fs";
import { complete as piComplete, getModel, type AssistantMessage } from "@mariozechner/pi-ai";
import { db } from "../src/lib/db";
import { FREE_LADDER, hasAnyKey, resolveModel, type ModelChoice } from "../src/lib/models";

loadDotEnv(".env.local");

const args = parseArgs(process.argv.slice(2));
const d = db();

if (!args.externalApproved) {
  const queued = d.prepare(`
    UPDATE private_context_shards
    SET status = 'queued', updated_at = unixepoch()
    WHERE id IN (
      SELECT id FROM private_context_shards
      WHERE status IN ('deterministic', 'summarized')
      ORDER BY confidence DESC, updated_at DESC
      LIMIT ?
    )
  `).run(args.limit).changes;
  console.log(JSON.stringify({
    ok: true,
    externalModelCalled: false,
    queued,
    note: "Private shard judge is local-first. Re-run with --external-approved only after the user explicitly approves sending aggregate shard summaries to the configured model provider.",
  }, null, 2));
  process.exit(0);
}

if (!hasAnyKey()) {
  console.log(JSON.stringify({
    ok: false,
    error: "No model API key found. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY.",
  }, null, 2));
  process.exit(1);
}

const shards = d.prepare(`
  SELECT id, shard_key, shard_type, topic, title, start_ts, end_ts, email_count, thread_count,
         token_estimate, evidence_email_ids_json, aggregate_json, deterministic_summary, status
  FROM private_context_shards
  WHERE status IN ('deterministic', 'queued', 'summarized')
  ORDER BY confidence DESC, updated_at DESC
  LIMIT ?
`).all(args.limit) as Array<{
  id: string;
  shard_key: string;
  shard_type: string;
  topic: string | null;
  title: string;
  start_ts: number | null;
  end_ts: number | null;
  email_count: number;
  thread_count: number;
  token_estimate: number;
  evidence_email_ids_json: string;
  aggregate_json: string;
  deterministic_summary: string;
  status: string;
}>;

const updated: Array<{ id: string; status: string; verdict: string; model: string }> = [];

for (const shard of shards) {
  console.error(`[private-context:judge] judging ${updated.length + 1}/${shards.length} ${shard.id} ${shard.shard_type}:${shard.topic ?? "general"}`);
  const result = await judgeShard(shard);
  d.prepare(`
    UPDATE private_context_shards
    SET llm_summary = ?, judge_json = ?, status = 'judged', updated_at = unixepoch()
    WHERE id = ?
  `).run(result.summary, JSON.stringify(result), shard.id);
  updated.push({ id: shard.id, status: "judged", verdict: result.verdict, model: result.model });
  console.error(`[private-context:judge] saved ${shard.id} verdict=${result.verdict} confidence=${result.confidence} model=${result.model}`);
}

console.log(JSON.stringify({ ok: true, judged: updated.length, updated }, null, 2));

async function judgeShard(shard: typeof shards[number]) {
  const aggregate = safeJson(shard.aggregate_json);
  const evidenceIds = safeJson(shard.evidence_email_ids_json);
  const input = {
    id: shard.id,
    shard_type: shard.shard_type,
    topic: shard.topic,
    title: shard.title,
    date_range: [
      shard.start_ts ? new Date(shard.start_ts * 1000).toISOString().slice(0, 10) : null,
      shard.end_ts ? new Date(shard.end_ts * 1000).toISOString().slice(0, 10) : null,
    ],
    email_count: shard.email_count,
    thread_count: shard.thread_count,
    token_estimate: shard.token_estimate,
    deterministic_summary: shard.deterministic_summary,
    aggregate,
    evidence_email_ids: Array.isArray(evidenceIds) ? evidenceIds.slice(0, 20) : [],
  };
  const prompt = `Judge this private inbox context shard.

You only see aggregate metadata and evidence ids. You do not see raw email bodies.

Return strict JSON with:
{
  "verdict": "supported" | "needs_revision" | "rejected",
  "summary": "one concise memory-ready summary, no raw personal/private content",
  "rationale": "why the verdict follows from the aggregate evidence",
  "confidence": number from 0 to 1,
  "missing_evidence": string[]
}

Shard:
${JSON.stringify(input, null, 2)}`;

  const cfg = resolveModel();
  const ladder = [{ provider: cfg.provider, model: cfg.model, free: cfg.provider !== "anthropic" }, ...FREE_LADDER];
  let lastErr = "";
  for (const choice of ladder) {
    try {
      const result = await complete(choice, prompt);
      const parsed = parseJson(result.text);
      return {
        verdict: normalizeVerdict(parsed.verdict),
        summary: String(parsed.summary ?? shard.deterministic_summary).slice(0, 1200),
        rationale: String(parsed.rationale ?? "").slice(0, 1200),
        confidence: clampNumber(parsed.confidence, 0, 1, 0.5),
        missing_evidence: Array.isArray(parsed.missing_evidence) ? parsed.missing_evidence.map(String).slice(0, 8) : [],
        model: `${result.provider}:${result.model}`,
        usage: result.usage,
      };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (!/rate.?limit|429|quota|unauthor|401|403|model.*not.*found|invalid json/i.test(lastErr)) break;
    }
  }
  return {
    verdict: "needs_revision",
    summary: shard.deterministic_summary,
    rationale: `Judge fallback: ${lastErr || "model unavailable"}`,
    confidence: 0.25,
    missing_evidence: ["Model judge did not return valid structured output."],
    model: "fallback:deterministic",
    usage: null,
  };
}

async function complete(choice: ModelChoice, prompt: string) {
  const model = (getModel as any)(choice.provider, choice.model);
  const result = await withTimeout(piComplete(model, {
    systemPrompt: "You are a strict evidence judge for a private local inbox memory system. Never invent facts beyond the aggregate shard.",
    messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
    tools: [],
  } as any, { maxOutputTokens: 900 }) as Promise<AssistantMessage>, args.perShardTimeoutMs, `${choice.provider}:${choice.model}`);
  const text = result.content
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("")
    .trim();
  return {
    text,
    provider: result.provider,
    model: result.model,
    usage: {
      input: result.usage.input,
      output: result.usage.output,
      cost_micro_usd: Math.floor((result.usage.cost.total || 0) * 1_000_000),
    },
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${label}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function parseJson(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  return JSON.parse(raw);
}

function normalizeVerdict(value: unknown) {
  return value === "supported" || value === "rejected" || value === "needs_revision" ? value : "needs_revision";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function safeJson(value: string) {
  try { return JSON.parse(value); } catch { return null; }
}

function parseArgs(argv: string[]) {
  const get = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    limit: Math.max(1, Math.min(Number(get("--limit") ?? 5), 50)),
    externalApproved: argv.includes("--external-approved"),
    perShardTimeoutMs: Math.max(5_000, Math.min(Number(get("--per-shard-timeout-ms") ?? 45_000), 180_000)),
  };
}

function loadDotEnv(file: string) {
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}
