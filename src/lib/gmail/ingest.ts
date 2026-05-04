/**
 * Gmail → SQLite ingest pipeline.
 *
 * 1. listInboxIds()                      — paginate users.messages.list
 * 2. fetchMessagesMetadata()             — batch GET, headers + snippet only
 * 3. parseFromHeader()                   — split "Name <email>"
 * 4. db().upsert into emails table
 * 5. heuristicClassify() runs immediately for fresh classification
 *
 * Schema-compatible with seed.ts. Re-running ingest is idempotent (PK is
 * Gmail message id, prefixed with `gm_`).
 */

import { listInboxIds, fetchMessagesMetadata } from "./client";
import { db, upsertClassification } from "../db";
import { heuristicClassify } from "../heuristic";
import { runAutomationsForEmails } from "../automations/engine";

export interface IngestOptions {
  account_email?: string;
  maxPages?: number;       // default 5 → up to 500 messages
  pageSize?: number;       // default 100 (Gmail caps at 500)
  query?: string;          // optional Gmail search query (e.g. "newer_than:7d")
}

export interface IngestResult {
  ok: true;
  account_email: string;
  fetched: number;
  inserted: number;
  classified: number;
  automations: {
    evaluated: number;
    matched: number;
    actions: number;
  };
  estimate_total?: number;
  has_more: boolean;
  duration_ms: number;
}

function parseFromHeader(raw: string | undefined): { name: string | null; addr: string } {
  if (!raw) return { name: null, addr: "" };
  // Match "Name <email@host>" or just "email@host"
  const m = raw.match(/^"?([^"<]+?)"?\s*<\s*([^>]+)\s*>\s*$/);
  if (m) return { name: m[1].trim(), addr: m[2].trim().toLowerCase() };
  return { name: null, addr: raw.trim().toLowerCase() };
}

export async function ingestInbox(opts: IngestOptions = {}): Promise<IngestResult> {
  const t0 = Date.now();
  const maxPages = Math.min(opts.maxPages ?? 5, 50); // hard cap
  const pageSize = Math.min(opts.pageSize ?? 100, 500);

  const list = await listInboxIds({
    account_email: opts.account_email,
    maxPages, pageSize, query: opts.query,
  });

  if (list.ids.length === 0) {
    touchLastSync(opts.account_email);
    return {
      ok: true,
      account_email: opts.account_email ?? "",
      fetched: 0,
      inserted: 0,
      classified: 0,
      automations: { evaluated: 0, matched: 0, actions: 0 },
      estimate_total: list.estimateTotal,
      has_more: !!list.nextPageToken,
      duration_ms: Date.now() - t0,
    };
  }

  const messages = await fetchMessagesMetadata({
    account_email: opts.account_email,
    ids: list.ids,
  });

  const insertStmt = db().prepare(`
    INSERT INTO emails (id, thread_id, from_addr, from_name, to_addrs, subject, snippet, body, internal_date, labels, is_unread)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      labels = excluded.labels,
      is_unread = excluded.is_unread,
      snippet = excluded.snippet
  `);

  const tx = db().transaction((rows: typeof messages) => {
    let inserted = 0;
    for (const m of rows) {
      const { name, addr } = parseFromHeader(m.headers["from"]);
      const id = `gm_${m.id}`;
      insertStmt.run(
        id,
        m.threadId,
        addr,
        name,
        m.headers["to"] ?? "",
        m.headers["subject"] ?? "(no subject)",
        m.snippet,
        Math.floor(m.internalDate / 1000), // store as unix seconds
        m.labelIds.join(","),
        m.labelIds.includes("UNREAD") ? 1 : 0,
      );
      inserted++;
    }
    return inserted;
  });

  const inserted = tx(messages);
  const ingestedIds = messages.map((m) => `gm_${m.id}`);

  // Classify the freshly-inserted ones
  let classified = 0;
  const fresh = db().prepare(`
    SELECT e.id, e.from_addr, e.subject FROM emails e
    LEFT JOIN latest_classifications c ON c.email_id = e.id
    WHERE c.email_id IS NULL OR c.created_at < e.ingested_at
  `).all() as Array<{ id: string; from_addr: string; subject: string }>;
  for (const e of fresh) {
    const r = heuristicClassify(e.from_addr, e.subject);
    upsertClassification({
      email_id: e.id,
      lane: r?.lane ?? "triage",
      urgency: r?.urgency ?? 0.5,
      action: r?.lane === "auto_archive" ? "archive" : "none",
      confidence: r?.confidence ?? 0.3,
      model: r ? "heuristic" : "fallback_triage",
      rationale: r?.rule ?? "no rule matched",
    });
    classified++;
  }

  const automations = runAutomationsForEmails(ingestedIds);
  touchLastSync(opts.account_email);

  return {
    ok: true,
    account_email: opts.account_email ?? "(default)",
    fetched: messages.length,
    inserted,
    classified,
    automations,
    estimate_total: list.estimateTotal,
    has_more: !!list.nextPageToken,
    duration_ms: Date.now() - t0,
  };
}

function touchLastSync(accountEmail?: string) {
  if (accountEmail) {
    db().prepare(`UPDATE oauth_tokens SET last_sync_at = unixepoch() WHERE account_email = ?`).run(accountEmail);
    return;
  }
  db().prepare(`UPDATE oauth_tokens SET last_sync_at = unixepoch() WHERE account_email = (SELECT account_email FROM oauth_tokens ORDER BY connected_at DESC LIMIT 1)`).run();
}
