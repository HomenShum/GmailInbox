import { db } from "../src/lib/db";
import crypto from "node:crypto";

const args = parseArgs(process.argv.slice(2));
const d = db();

const rows = d.prepare(`
  SELECT id, shard_type, topic, title, start_ts, end_ts, email_count, thread_count,
         evidence_email_ids_json, aggregate_json, llm_summary, judge_json
  FROM private_context_shards
  WHERE status = 'judged'
    AND json_extract(judge_json, '$.verdict') = 'supported'
    AND json_extract(judge_json, '$.confidence') >= ?
  ORDER BY json_extract(judge_json, '$.confidence') DESC, email_count DESC
  LIMIT ?
`).all(args.minConfidence, args.limit) as Array<{
  id: string;
  shard_type: string;
  topic: string | null;
  title: string;
  start_ts: number | null;
  end_ts: number | null;
  email_count: number;
  thread_count: number;
  evidence_email_ids_json: string;
  aggregate_json: string;
  llm_summary: string | null;
  judge_json: string;
}>;

const upsert = d.prepare(`
  INSERT INTO private_identity_claims (
    id, claim_type, topic, time_range, claim_text,
    evidence_shard_ids_json, evidence_email_ids_json, aggregate_json,
    judge_status, confidence, model, private_boundary, updated_at
  )
  VALUES (
    @id, @claim_type, @topic, @time_range, @claim_text,
    @evidence_shard_ids_json, @evidence_email_ids_json, @aggregate_json,
    @judge_status, @confidence, @model, 'local_private_only', unixepoch()
  )
  ON CONFLICT(id) DO UPDATE SET
    claim_text = excluded.claim_text,
    evidence_shard_ids_json = excluded.evidence_shard_ids_json,
    evidence_email_ids_json = excluded.evidence_email_ids_json,
    aggregate_json = excluded.aggregate_json,
    judge_status = excluded.judge_status,
    confidence = excluded.confidence,
    model = excluded.model,
    updated_at = unixepoch()
`);

let promoted = 0;
const tx = d.transaction(() => {
  for (const row of rows) {
    const judge = safeJson(row.judge_json);
    const claimText = String(row.llm_summary ?? judge.summary ?? row.title).trim();
    if (!claimText) continue;
    upsert.run({
      id: `pic_${sha256(`${row.id}:${claimText}`).slice(0, 24)}`,
      claim_type: claimType(row),
      topic: row.topic,
      time_range: JSON.stringify({
        start: row.start_ts ? isoDate(row.start_ts) : null,
        end: row.end_ts ? isoDate(row.end_ts) : null,
        shard_type: row.shard_type,
      }),
      claim_text: claimText,
      evidence_shard_ids_json: JSON.stringify([row.id]),
      evidence_email_ids_json: row.evidence_email_ids_json,
      aggregate_json: JSON.stringify({
        shard_title: row.title,
        shard_type: row.shard_type,
        email_count: row.email_count,
        thread_count: row.thread_count,
        aggregate: safeJson(row.aggregate_json),
        judge_rationale: judge.rationale ?? null,
        missing_evidence: judge.missing_evidence ?? [],
      }),
      judge_status: "supported",
      confidence: Number(judge.confidence ?? 0.5),
      model: judge.model ?? null,
    });
    promoted += 1;
  }
});
tx();

console.log(JSON.stringify({
  ok: true,
  promoted,
  minConfidence: args.minConfidence,
  totalClaims: (d.prepare(`SELECT COUNT(*) AS n FROM private_identity_claims`).get() as { n: number }).n,
  byTopic: d.prepare(`
    SELECT topic, COUNT(*) AS n, ROUND(AVG(confidence), 3) AS avg_confidence
    FROM private_identity_claims
    GROUP BY topic
    ORDER BY n DESC, avg_confidence DESC
  `).all(),
}, null, 2));

function claimType(row: { shard_type: string; topic: string | null }) {
  if (row.topic === "software_dev" || row.topic === "product_design" || row.topic === "ai_agents" || row.topic === "startup_builder") {
    return "builder_identity_signal";
  }
  if (row.topic === "finance_risk" || row.topic === "money_tax_admin") return "finance_admin_signal";
  if (row.shard_type === "thread") return "thread_memory_signal";
  return "identity_topic_signal";
}

function parseArgs(argv: string[]) {
  const get = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    limit: Math.max(1, Math.min(Number(get("--limit") ?? 200), 1000)),
    minConfidence: Math.max(0, Math.min(Number(get("--min-confidence") ?? 0.8), 1)),
  };
}

function safeJson(value: string) {
  try { return JSON.parse(value); } catch { return null; }
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isoDate(ts: number) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}
