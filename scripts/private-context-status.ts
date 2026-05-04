import { db, privateContextStatus } from "../src/lib/db";

const d = db();
const status = privateContextStatus();

const snapshot = {
  status,
  coverage: {
    emails: scalar("SELECT COUNT(*) FROM emails"),
    distinctThreads: scalar("SELECT COUNT(DISTINCT thread_id) FROM emails WHERE thread_id IS NOT NULL"),
    privateBodies: scalar("SELECT COUNT(*) FROM private_email_bodies"),
    privateBodyThreads: scalar("SELECT COUNT(DISTINCT thread_id) FROM private_email_bodies WHERE thread_id IS NOT NULL"),
    bodyChars: scalar("SELECT COALESCE(SUM(body_chars), 0) FROM private_email_bodies"),
    missingPrivateThreadBodies: scalar(`
      SELECT COUNT(*) FROM (
        SELECT e.thread_id
        FROM emails e
        LEFT JOIN private_email_bodies b ON b.thread_id = e.thread_id
        WHERE e.id LIKE 'gm_%' AND e.thread_id IS NOT NULL AND b.thread_id IS NULL
        GROUP BY e.thread_id
      )
    `),
  },
  shards: rows(`
    SELECT shard_type, status, COUNT(*) AS n
    FROM private_context_shards
    GROUP BY shard_type, status
    ORDER BY shard_type, status
  `),
  verdicts: rows(`
    SELECT COALESCE(json_extract(judge_json, '$.verdict'), 'none') AS verdict,
           COUNT(*) AS n,
           ROUND(AVG(json_extract(judge_json, '$.confidence')), 3) AS avg_confidence
    FROM private_context_shards
    WHERE status = 'judged'
    GROUP BY verdict
    ORDER BY verdict
  `),
  claimsByTopic: rows(`
    SELECT topic, COUNT(*) AS n, ROUND(AVG(confidence), 3) AS avg_confidence
    FROM private_identity_claims
    GROUP BY topic
    ORDER BY n DESC, avg_confidence DESC
    LIMIT 20
  `),
  recentRuns: rows(`
    SELECT mode, requested_limit, fetched_threads, fetched_messages, updated_bodies, shards_created,
           started_at, finished_at, error
    FROM private_context_runs
    ORDER BY started_at DESC
    LIMIT 8
  `),
  recommendedNext: [
    "npm run gmail:body-ingest -- --limit 250 --oldest-first --skip-shards",
    "npm run gmail:body-ingest -- --rebuild-only",
    "npm run private-context:judge -- --limit 20 --external-approved --per-shard-timeout-ms 30000",
    "npm run private-context:promote -- --min-confidence 0.8",
  ],
};

console.log(JSON.stringify(snapshot, null, 2));

function scalar(sql: string): number {
  const row = d.prepare(sql).raw().get() as [number] | undefined;
  return Number(row?.[0] ?? 0);
}

function rows(sql: string) {
  return d.prepare(sql).all();
}
