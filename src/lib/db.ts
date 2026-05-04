import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { LANES, type Lane } from "./lanes";

const DB_DIR = path.resolve(process.cwd(), "src/data");
const DB_PATH = path.join(DB_DIR, "gmail.db");
const READ_CACHE_TTL_MS = 20_000;

const readCache = new Map<string, { expires: number; value: unknown }>();

function cachedRead<T>(key: string, loader: () => T, ttlMs = READ_CACHE_TTL_MS): T {
  const now = Date.now();
  const hit = readCache.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  const value = loader();
  readCache.set(key, { value, expires: now + ttlMs });
  return value;
}

function clearReadCache() {
  readCache.clear();
  clearReadModelSnapshots();
}

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  const d = new Database(DB_PATH);
  d.pragma("journal_mode = WAL");
  d.pragma("synchronous = NORMAL");
  d.exec(SCHEMA);
  backfillLatestClassificationCache(d);
  _db = d;
  return d;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  thread_id TEXT,
  from_addr TEXT NOT NULL,
  from_name TEXT,
  to_addrs TEXT,
  subject TEXT NOT NULL,
  snippet TEXT NOT NULL,
  body TEXT,
  internal_date INTEGER NOT NULL,
  labels TEXT,
  is_unread INTEGER NOT NULL DEFAULT 1,
  ingested_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(internal_date DESC);
CREATE INDEX IF NOT EXISTS idx_emails_from ON emails(from_addr);
CREATE INDEX IF NOT EXISTS idx_emails_unread_date ON emails(is_unread, internal_date DESC);
CREATE INDEX IF NOT EXISTS idx_emails_labels_date ON emails(labels, internal_date DESC);

CREATE TABLE IF NOT EXISTS classifications (
  email_id TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  lane TEXT NOT NULL,
  urgency REAL NOT NULL,
  action TEXT NOT NULL DEFAULT 'none',
  confidence REAL NOT NULL,
  model TEXT NOT NULL,
  rationale TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (email_id, model)
);

CREATE INDEX IF NOT EXISTS idx_class_lane ON classifications(lane, urgency DESC);
CREATE INDEX IF NOT EXISTS idx_class_email_created ON classifications(email_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_class_lane_created ON classifications(lane, created_at DESC);

CREATE TABLE IF NOT EXISTS latest_classifications (
  email_id TEXT PRIMARY KEY REFERENCES emails(id) ON DELETE CASCADE,
  lane TEXT NOT NULL,
  urgency REAL NOT NULL,
  action TEXT NOT NULL DEFAULT 'none',
  confidence REAL NOT NULL,
  model TEXT NOT NULL,
  rationale TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_latest_lane_urgency ON latest_classifications(lane, urgency DESC);
CREATE INDEX IF NOT EXISTS idx_latest_confidence ON latest_classifications(confidence);

CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload TEXT,
  executed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  reverted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_actions_email ON actions(email_id);
CREATE INDEX IF NOT EXISTS idx_actions_action ON actions(action, executed_at DESC);

CREATE TABLE IF NOT EXISTS approval_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool TEXT NOT NULL,
  args TEXT NOT NULL,
  summary TEXT NOT NULL,
  risk TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'applied', 'failed')),
  result TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  decided_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_approval_status_created ON approval_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_call_id TEXT,
  tool_name TEXT,
  tool_calls TEXT,
  model TEXT,
  provider TEXT,
  cost_micro_usd INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, turn);

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  email_id TEXT REFERENCES emails(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sender_org TEXT,
  score REAL NOT NULL DEFAULT 0.5,
  est_value_usd REAL,
  deadline INTEGER,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'review', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  next_action TEXT,
  source TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_opp_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opp_score ON opportunities(score);

CREATE TABLE IF NOT EXISTS job_matches (
  id TEXT PRIMARY KEY,
  email_id TEXT REFERENCES emails(id) ON DELETE CASCADE,
  company TEXT,
  title TEXT NOT NULL,
  location TEXT,
  comp_low REAL,
  comp_high REAL,
  fit_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'saved', 'applied', 'interview', 'offer', 'rejected')),
  source TEXT,
  next_step TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_job_status ON job_matches(status);

CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger TEXT NOT NULL,
  conditions TEXT NOT NULL,
  actions TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  model_routing TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS rule_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL,
  target TEXT,
  payload TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  error_msg TEXT,
  executed_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_rule_runs ON rule_runs(rule_id, executed_at);

CREATE TABLE IF NOT EXISTS workspace_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS planner_overrides (
  id TEXT PRIMARY KEY,
  title TEXT,
  status TEXT CHECK(status IN ('completed', 'in_progress', 'planned', 'at_risk')),
  progress INTEGER,
  date_label TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS planner_todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'done')),
  source TEXT NOT NULL DEFAULT 'manual',
  linked_email_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_planner_todos_status ON planner_todos(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS calendar_overrides (
  id TEXT PRIMARY KEY,
  email_id TEXT,
  title TEXT,
  date TEXT,
  start_hour REAL,
  duration_hours REAL,
  type TEXT CHECK(type IN ('scheduling', 'deadline', 'follow_up', 'review', 'admin')),
  status TEXT NOT NULL DEFAULT 'suggested' CHECK(status IN ('suggested', 'scheduled', 'dismissed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_calendar_overrides_status ON calendar_overrides(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS autopilot_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,
  trigger TEXT NOT NULL,
  summary TEXT NOT NULL,
  classified INTEGER NOT NULL DEFAULT 0,
  jobs_created INTEGER NOT NULL DEFAULT 0,
  opportunities_created INTEGER NOT NULL DEFAULT 0,
  recommendations_created INTEGER NOT NULL DEFAULT 0,
  errors TEXT,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_autopilot_runs_started ON autopilot_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS read_model_snapshots (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_read_model_expires ON read_model_snapshots(expires_at);

CREATE TABLE IF NOT EXISTS private_email_bodies (
  email_id TEXT PRIMARY KEY REFERENCES emails(id) ON DELETE CASCADE,
  thread_id TEXT,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  account_email TEXT,
  body_text TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  body_chars INTEGER NOT NULL,
  source_format TEXT NOT NULL DEFAULT 'gmail_full',
  fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_private_bodies_thread ON private_email_bodies(thread_id);
CREATE INDEX IF NOT EXISTS idx_private_bodies_gmail_thread ON private_email_bodies(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_private_bodies_fetched ON private_email_bodies(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_private_bodies_hash ON private_email_bodies(body_hash);

CREATE TABLE IF NOT EXISTS private_context_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,
  account_email TEXT,
  gmail_query TEXT,
  requested_limit INTEGER,
  fetched_threads INTEGER NOT NULL DEFAULT 0,
  fetched_messages INTEGER NOT NULL DEFAULT 0,
  updated_bodies INTEGER NOT NULL DEFAULT 0,
  shards_created INTEGER NOT NULL DEFAULT 0,
  oldest_remote_date INTEGER,
  newest_remote_date INTEGER,
  error TEXT,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_private_context_runs_started ON private_context_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS private_context_shards (
  id TEXT PRIMARY KEY,
  shard_key TEXT NOT NULL UNIQUE,
  shard_type TEXT NOT NULL CHECK(shard_type IN ('thread', 'month_topic', 'year_topic', 'domain_topic', 'identity_phase')),
  account_email TEXT,
  topic TEXT,
  title TEXT NOT NULL,
  start_ts INTEGER,
  end_ts INTEGER,
  email_count INTEGER NOT NULL DEFAULT 0,
  thread_count INTEGER NOT NULL DEFAULT 0,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  body_hash TEXT NOT NULL,
  evidence_email_ids_json TEXT NOT NULL,
  aggregate_json TEXT NOT NULL,
  deterministic_summary TEXT NOT NULL,
  llm_summary TEXT,
  judge_json TEXT,
  status TEXT NOT NULL DEFAULT 'deterministic' CHECK(status IN ('deterministic', 'queued', 'summarized', 'judged', 'approved', 'rejected', 'stale')),
  confidence REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_private_shards_type_topic ON private_context_shards(shard_type, topic, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_private_shards_status ON private_context_shards(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_private_shards_time ON private_context_shards(start_ts, end_ts);

CREATE TABLE IF NOT EXISTS private_identity_claims (
  id TEXT PRIMARY KEY,
  claim_type TEXT NOT NULL,
  topic TEXT,
  time_range TEXT,
  claim_text TEXT NOT NULL,
  evidence_shard_ids_json TEXT NOT NULL,
  evidence_email_ids_json TEXT NOT NULL,
  aggregate_json TEXT NOT NULL,
  judge_status TEXT NOT NULL DEFAULT 'unjudged' CHECK(judge_status IN ('unjudged', 'supported', 'needs_revision', 'rejected')),
  confidence REAL NOT NULL DEFAULT 0,
  model TEXT,
  private_boundary TEXT NOT NULL DEFAULT 'local_private_only',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_private_claims_topic ON private_identity_claims(topic, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_private_claims_judge ON private_identity_claims(judge_status, confidence DESC);

CREATE TABLE IF NOT EXISTS pinned_artifacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  local_path TEXT,
  source TEXT NOT NULL DEFAULT 'local_path',
  summary TEXT,
  preview_json TEXT,
  tags TEXT,
  visibility_policy TEXT NOT NULL DEFAULT 'local_summary_only',
  approved_for_matching INTEGER NOT NULL DEFAULT 1,
  approved_for_external_research INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 1,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_pinned_artifacts_pinned ON pinned_artifacts(pinned, is_primary, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pinned_artifacts_local_path ON pinned_artifacts(local_path) WHERE local_path IS NOT NULL;

CREATE TABLE IF NOT EXISTS job_research_contexts (
  email_id TEXT PRIMARY KEY REFERENCES emails(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started', 'queued', 'researching', 'verified', 'stale', 'needs_review', 'failed')),
  run_id TEXT,
  entity_key TEXT,
  entities_json TEXT NOT NULL,
  dossier_json TEXT,
  context_pack_json TEXT,
  error TEXT,
  requested_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_job_research_status ON job_research_contexts(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_research_entity ON job_research_contexts(entity_key, updated_at DESC);

-- OAuth tokens (one row per connected account). Stored encrypted at rest.
CREATE TABLE IF NOT EXISTS oauth_tokens (
  account_email TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'google',
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  expiry_ms INTEGER,
  scope TEXT,
  history_id TEXT,
  last_sync_at INTEGER,
  connected_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

function backfillLatestClassificationCache(d: Database.Database) {
  const latestCount = (d.prepare(`SELECT COUNT(*) AS n FROM latest_classifications`).get() as { n: number }).n;
  if (latestCount > 0) return;
  d.prepare(`
    INSERT OR REPLACE INTO latest_classifications (email_id, lane, urgency, action, confidence, model, rationale, created_at)
    SELECT c.email_id, c.lane, c.urgency, c.action, c.confidence, c.model, c.rationale, c.created_at
    FROM classifications c
    JOIN (
      SELECT email_id, MAX(created_at) AS created_at
      FROM classifications
      GROUP BY email_id
    ) latest ON latest.email_id = c.email_id AND latest.created_at = c.created_at
  `).run();
}

export interface EmailRow {
  id: string;
  thread_id: string | null;
  from_addr: string;
  from_name: string | null;
  to_addrs: string | null;
  subject: string;
  snippet: string;
  body: string | null;
  internal_date: number;
  labels: string | null;
  is_unread: number;
  ingested_at: number;
}

export interface ClassRow {
  email_id: string;
  lane: Lane;
  urgency: number;
  action: string;
  confidence: number;
  model: string;
  rationale: string | null;
  created_at: number;
}

export interface LaneCard extends EmailRow {
  lane: Lane;
  urgency: number;
  confidence: number;
  action: string;
  rationale: string | null;
  classifier: string;
}

export function listLanes(): Record<Lane, LaneCard[]> {
  const rows = db().prepare(`
    SELECT e.*, c.lane, c.urgency, c.action, c.rationale, c.confidence, c.model AS classifier
    FROM emails e
    JOIN latest_classifications c ON c.email_id = e.id
    WHERE COALESCE(e.labels, '') != 'ARCHIVED'
    ORDER BY c.urgency DESC, e.internal_date DESC
  `).all() as LaneCard[];

  const out = {} as Record<Lane, LaneCard[]>;
  for (const r of rows) {
    (out[r.lane] ??= []).push(r);
  }
  return out;
}

export function listTopLanes(top = 10): Record<Lane, LaneCard[]> {
  const limit = Math.max(1, Math.min(top, 50));
  const out = {} as Record<Lane, LaneCard[]>;
  for (const lane of LANES) {
    out[lane] = listLaneCards(lane, limit, 0);
  }
  return out;
}

export function listLaneCards(lane: Lane, limit = 50, offset = 0): LaneCard[] {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const safeOffset = Math.max(0, offset);
  return cachedRead(`lane:${lane}:${safeLimit}:${safeOffset}`, () => (
    db().prepare(`
      SELECT e.id, e.thread_id, e.from_addr, e.from_name, NULL AS to_addrs,
             e.subject, e.snippet, NULL AS body, e.internal_date, e.labels,
             e.is_unread, e.ingested_at,
             c.lane, c.urgency, c.action, c.rationale, c.confidence, c.model AS classifier
      FROM latest_classifications c
      JOIN emails e ON e.id = c.email_id
      WHERE c.lane = ?
        AND COALESCE(e.labels, '') != 'ARCHIVED'
      ORDER BY c.urgency DESC, e.internal_date DESC
      LIMIT ? OFFSET ?
    `).all(lane, safeLimit, safeOffset) as LaneCard[]
  ));
}

export type ReadModelCacheStatus = "hit" | "miss" | "refresh";

export interface ReadModelResult<T> {
  value: T;
  cacheStatus: ReadModelCacheStatus;
  generatedAt: number;
  expiresAt: number;
}

export function getReadModel<T>(
  key: string,
  ttlSeconds: number,
  build: () => T,
  options: { force?: boolean } = {},
): ReadModelResult<T> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(5, Math.min(ttlSeconds, 3600));

  if (!options.force) {
    const row = db().prepare(`
      SELECT payload, generated_at, expires_at
      FROM read_model_snapshots
      WHERE key = ? AND expires_at > ?
      LIMIT 1
    `).get(key, now) as { payload: string; generated_at: number; expires_at: number } | undefined;

    if (row) {
      try {
        return {
          value: JSON.parse(row.payload) as T,
          cacheStatus: "hit",
          generatedAt: row.generated_at,
          expiresAt: row.expires_at,
        };
      } catch {
        db().prepare(`DELETE FROM read_model_snapshots WHERE key = ?`).run(key);
      }
    }
  }

  const value = build();
  const generatedAt = now;
  const expiresAt = now + ttl;
  db().prepare(`
    INSERT INTO read_model_snapshots (key, payload, generated_at, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      payload = excluded.payload,
      generated_at = excluded.generated_at,
      expires_at = excluded.expires_at
  `).run(key, JSON.stringify(value), generatedAt, expiresAt);

  return {
    value,
    cacheStatus: options.force ? "refresh" : "miss",
    generatedAt,
    expiresAt,
  };
}

export function invalidateReadModels(keys?: string[]) {
  clearReadModelSnapshots(keys);
}

function clearReadModelSnapshots(keys?: string[]) {
  if (!_db) return;
  try {
    if (keys?.length) {
      const stmt = _db.prepare(`DELETE FROM read_model_snapshots WHERE key = ?`);
      const tx = _db.transaction((snapshotKeys: string[]) => {
        for (const key of snapshotKeys) stmt.run(key);
      });
      tx(keys);
      return;
    }
    _db.prepare(`DELETE FROM read_model_snapshots`).run();
  } catch {
    // Schema may not exist yet during first initialization.
  }
}

export function reviewQueueSummary() {
  return cachedRead("reviewQueueSummary", () => {
    const d = db();
    const archiveCandidates = (d.prepare(`
    SELECT COUNT(*) AS n
    FROM latest_classifications c JOIN emails e ON e.id = c.email_id
    WHERE c.lane = 'auto_archive'
      AND c.confidence >= 0.7
      AND COALESCE(e.labels, '') != 'ARCHIVED'
  `).get() as { n: number }).n;
    const replyCandidates = (d.prepare(`
    SELECT COUNT(*) AS n
    FROM latest_classifications c JOIN emails e ON e.id = c.email_id
    WHERE c.lane IN ('reply_now', 'career')
      AND e.is_unread = 1
      AND COALESCE(e.labels, '') != 'ARCHIVED'
  `).get() as { n: number }).n;
    const jobAlerts = (d.prepare(`
    SELECT COUNT(*) AS n
    FROM latest_classifications c JOIN emails e ON e.id = c.email_id
    WHERE c.lane = 'job_alerts'
      AND COALESCE(e.labels, '') != 'ARCHIVED'
  `).get() as { n: number }).n;
    const lowConfidence = (d.prepare(`
    SELECT COUNT(*) AS n
    FROM latest_classifications c JOIN emails e ON e.id = c.email_id
    WHERE c.confidence < 0.5
      AND COALESCE(e.labels, '') != 'ARCHIVED'
  `).get() as { n: number }).n;
    const moneyAdmin = (d.prepare(`
    SELECT COUNT(*) AS n
    FROM latest_classifications c JOIN emails e ON e.id = c.email_id
    WHERE c.lane IN ('money', 'subscriptions', 'travel_auto')
      AND e.internal_date >= unixepoch() - 60 * 86400
      AND COALESCE(e.labels, '') != 'ARCHIVED'
  `).get() as { n: number }).n;

    return [
      { id: "archive", title: "Probably Safe To Archive", count: archiveCandidates, action: "Review first. Nothing changes without approval.", href: "/?lane=auto_archive" },
      { id: "reply", title: "Replies To Review", count: replyCandidates, action: "Open emails waiting on you.", href: "/inbox?tab=reply_now" },
      { id: "jobs", title: "Top Job Matches", count: jobAlerts, action: "Rank roles against pinned files.", href: "/jobs" },
      { id: "triage", title: "Needs Label Review", count: lowConfidence, action: "Check uncertain labels before automation.", href: "/inbox?tab=triage" },
      { id: "admin", title: "Bills And Admin", count: moneyAdmin, action: "Review payments, renewals, and travel.", href: "/inbox?tab=admin" },
    ];
  });
}

export function getEmail(id: string): LaneCard | null {
  return db().prepare(`
    SELECT e.*, c.lane, c.urgency, c.action, c.rationale, c.confidence, c.model AS classifier
    FROM emails e
    LEFT JOIN latest_classifications c ON c.email_id = e.id
    WHERE e.id = ?
    LIMIT 1
  `).get(id) as LaneCard | null;
}

export function searchEmails(query: string, limit = 20): EmailRow[] {
  const q = `%${query}%`;
  return db().prepare(`
    SELECT * FROM emails
    WHERE subject LIKE ? OR from_addr LIKE ? OR snippet LIKE ?
    ORDER BY internal_date DESC LIMIT ?
  `).all(q, q, q, limit) as EmailRow[];
}

export function recordAction(email_id: string, action: string, payload?: unknown): number {
  const info = db().prepare(`
    INSERT INTO actions (email_id, action, payload) VALUES (?, ?, ?)
  `).run(email_id, action, payload ? JSON.stringify(payload) : null);
  clearReadCache();
  return Number(info.lastInsertRowid);
}

export function createApprovalRequest(input: { tool: string; args: unknown; summary: string; risk: string }): ApprovalRequestRow {
  const encodedArgs = JSON.stringify(input.args);
  const existing = db().prepare(`
    SELECT * FROM approval_requests
    WHERE status = 'pending' AND tool = ? AND args = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(input.tool, encodedArgs) as ApprovalRequestRow | undefined;
  if (existing) return existing;

  const info = db().prepare(`
    INSERT INTO approval_requests (tool, args, summary, risk)
    VALUES (?, ?, ?, ?)
  `).run(input.tool, encodedArgs, input.summary, input.risk);
  return getApprovalRequest(Number(info.lastInsertRowid))!;
}

export function getApprovalRequest(id: number): ApprovalRequestRow | null {
  return (db().prepare(`SELECT * FROM approval_requests WHERE id = ?`).get(id) ?? null) as ApprovalRequestRow | null;
}

export function listApprovalRequests(status = "pending", limit = 50): ApprovalRequestRow[] {
  const capped = Math.max(1, Math.min(limit, 100));
  if (status === "all") {
    return db().prepare(`SELECT * FROM approval_requests ORDER BY created_at DESC LIMIT ?`).all(capped) as ApprovalRequestRow[];
  }
  return db().prepare(`
    SELECT * FROM approval_requests
    WHERE status = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(status, capped) as ApprovalRequestRow[];
}

export function updateApprovalRequest(id: number, status: ApprovalRequestRow["status"], result?: unknown): boolean {
  const info = db().prepare(`
    UPDATE approval_requests
    SET status = ?, result = ?, decided_at = unixepoch()
    WHERE id = ?
  `).run(status, result === undefined ? null : JSON.stringify(result), id);
  return info.changes > 0;
}

export function applyArchive(email_id: string): boolean {
  const info = db().prepare(`UPDATE emails SET labels = 'ARCHIVED', is_unread = 0 WHERE id = ?`).run(email_id);
  if (info.changes > 0) clearReadCache();
  return info.changes > 0;
}

export function applyLabel(email_id: string, label: string): boolean {
  const info = db().prepare(`UPDATE emails SET labels = ? WHERE id = ?`).run(label, email_id);
  if (info.changes > 0) clearReadCache();
  return info.changes > 0;
}

export function markRead(email_id: string): boolean {
  const info = db().prepare(`UPDATE emails SET is_unread = 0 WHERE id = ?`).run(email_id);
  if (info.changes > 0) clearReadCache();
  return info.changes > 0;
}

export function upsertClassification(c: Omit<ClassRow, "created_at">): void {
  const d = db();
  const now = Math.floor(Date.now() / 1000);
  d.prepare(`
    INSERT INTO classifications (email_id, lane, urgency, action, confidence, model, rationale)
    VALUES (@email_id, @lane, @urgency, @action, @confidence, @model, @rationale)
    ON CONFLICT(email_id, model) DO UPDATE SET
      lane=excluded.lane, urgency=excluded.urgency, action=excluded.action,
      confidence=excluded.confidence, rationale=excluded.rationale,
      created_at=unixepoch()
  `).run(c);
  d.prepare(`
    INSERT INTO latest_classifications (email_id, lane, urgency, action, confidence, model, rationale, created_at)
    VALUES (@email_id, @lane, @urgency, @action, @confidence, @model, @rationale, @created_at)
    ON CONFLICT(email_id) DO UPDATE SET
      lane=excluded.lane, urgency=excluded.urgency, action=excluded.action,
      confidence=excluded.confidence, model=excluded.model, rationale=excluded.rationale,
      created_at=excluded.created_at
  `).run({ ...c, created_at: now });
  clearReadCache();
}

export function laneCounts(): Record<string, number> {
  return cachedRead("laneCounts", () => {
    const rows = db().prepare(`
      SELECT c.lane, COUNT(*) AS n
      FROM latest_classifications c
      JOIN emails e ON e.id = c.email_id
      WHERE COALESCE(e.labels, '') != 'ARCHIVED'
      GROUP BY c.lane
    `).all() as { lane: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.lane, r.n]));
  });
}

// ===========================================================================
// v0.2 — Opportunities, JobMatches, Automations
// ===========================================================================

export interface OpportunityRow {
  id: string;
  email_id: string | null;
  name: string;
  sender_org: string | null;
  score: number;
  est_value_usd: number | null;
  deadline: number | null;
  status: "new" | "review" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
  next_action: string | null;
  source: string | null;
  created_at: number;
  updated_at: number;
}

export interface JobMatchRow {
  id: string;
  email_id: string | null;
  company: string | null;
  title: string;
  location: string | null;
  comp_low: number | null;
  comp_high: number | null;
  fit_score: number;
  status: "new" | "saved" | "applied" | "interview" | "offer" | "rejected";
  source: string | null;
  next_step: string | null;
  created_at: number;
  updated_at: number;
}

export interface AutomationRuleRow {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  conditions: string;
  actions: string;
  enabled: number;
  model_routing: string | null;
  created_at: number;
  updated_at: number;
}

export interface RuleRunRow {
  id: number;
  rule_id: string;
  trigger: string;
  target: string | null;
  payload: string | null;
  success: number;
  error_msg: string | null;
  executed_at: number;
}

export interface WorkspaceSettingRow {
  key: string;
  value: string;
  updated_at: number;
}

export interface PlannerOverrideRow {
  id: string;
  title: string | null;
  status: "completed" | "in_progress" | "planned" | "at_risk" | null;
  progress: number | null;
  date_label: string | null;
  updated_at: number;
}

export interface PlannerTodoRow {
  id: string;
  title: string;
  status: "open" | "done";
  source: string;
  linked_email_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface CalendarOverrideRow {
  id: string;
  email_id: string | null;
  title: string | null;
  date: string | null;
  start_hour: number | null;
  duration_hours: number | null;
  type: "scheduling" | "deadline" | "follow_up" | "review" | "admin" | null;
  status: "suggested" | "scheduled" | "dismissed";
  created_at: number;
  updated_at: number;
}

export interface AutopilotRunRow {
  id: number;
  mode: string;
  trigger: string;
  summary: string;
  classified: number;
  jobs_created: number;
  opportunities_created: number;
  recommendations_created: number;
  errors: string | null;
  started_at: number;
  finished_at: number | null;
}

export interface ApprovalRequestRow {
  id: number;
  tool: string;
  args: string;
  summary: string;
  risk: string;
  status: "pending" | "approved" | "rejected" | "applied" | "failed";
  result: string | null;
  created_at: number;
  decided_at: number | null;
}

export type JobResearchStatus = "not_started" | "queued" | "researching" | "verified" | "stale" | "needs_review" | "failed";

export interface JobResearchContextRow {
  email_id: string;
  status: JobResearchStatus;
  run_id: string | null;
  entity_key: string | null;
  entities_json: string;
  dossier_json: string | null;
  context_pack_json: string | null;
  error: string | null;
  requested_at: number | null;
  updated_at: number;
  expires_at: number | null;
}

// --- Opportunities ---

export function listOpportunities(status?: string): OpportunityRow[] {
  if (status) {
    return db().prepare(`SELECT * FROM opportunities WHERE status = ? ORDER BY score DESC, deadline ASC`).all(status) as OpportunityRow[];
  }
  return db().prepare(`SELECT * FROM opportunities ORDER BY score DESC, deadline ASC`).all() as OpportunityRow[];
}

export function getOpportunity(id: string): OpportunityRow | null {
  return (db().prepare(`SELECT * FROM opportunities WHERE id = ?`).get(id) ?? null) as OpportunityRow | null;
}

export function insertOpportunity(o: Omit<OpportunityRow, "created_at" | "updated_at">): OpportunityRow {
  db().prepare(`
    INSERT INTO opportunities (id, email_id, name, sender_org, score, est_value_usd, deadline, status, next_action, source)
    VALUES (@id, @email_id, @name, @sender_org, @score, @est_value_usd, @deadline, @status, @next_action, @source)
    ON CONFLICT(id) DO UPDATE SET
      score=excluded.score, est_value_usd=excluded.est_value_usd, deadline=excluded.deadline,
      status=excluded.status, next_action=excluded.next_action, updated_at=unixepoch()
  `).run(o);
  return getOpportunity(o.id)!;
}

export function updateOpportunityStatus(id: string, status: OpportunityRow["status"]): boolean {
  const info = db().prepare(`UPDATE opportunities SET status = ?, updated_at = unixepoch() WHERE id = ?`).run(status, id);
  return info.changes > 0;
}

export function updateOpportunityScore(id: string, score: number): boolean {
  const info = db().prepare(`UPDATE opportunities SET score = ?, updated_at = unixepoch() WHERE id = ?`).run(score, id);
  return info.changes > 0;
}

export function opportunityCounts(): Record<string, number> {
  const rows = db().prepare(`SELECT status, COUNT(*) AS n FROM opportunities GROUP BY status`).all() as { status: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

// --- Job matches ---

export function listJobs(status?: string): JobMatchRow[] {
  if (status) {
    return db().prepare(`SELECT * FROM job_matches WHERE status = ? ORDER BY fit_score DESC, created_at DESC`).all(status) as JobMatchRow[];
  }
  return db().prepare(`SELECT * FROM job_matches ORDER BY fit_score DESC, created_at DESC`).all() as JobMatchRow[];
}

export function getJob(id: string): JobMatchRow | null {
  return (db().prepare(`SELECT * FROM job_matches WHERE id = ?`).get(id) ?? null) as JobMatchRow | null;
}

export function insertJob(j: Omit<JobMatchRow, "created_at" | "updated_at">): JobMatchRow {
  db().prepare(`
    INSERT INTO job_matches (id, email_id, company, title, location, comp_low, comp_high, fit_score, status, source, next_step)
    VALUES (@id, @email_id, @company, @title, @location, @comp_low, @comp_high, @fit_score, @status, @source, @next_step)
    ON CONFLICT(id) DO UPDATE SET
      company=excluded.company, title=excluded.title, location=excluded.location,
      comp_low=excluded.comp_low, comp_high=excluded.comp_high, fit_score=excluded.fit_score,
      status=excluded.status, next_step=excluded.next_step, updated_at=unixepoch()
  `).run(j);
  return getJob(j.id)!;
}

export function updateJobStatus(id: string, status: JobMatchRow["status"]): boolean {
  const info = db().prepare(`UPDATE job_matches SET status = ?, updated_at = unixepoch() WHERE id = ?`).run(status, id);
  return info.changes > 0;
}

export function jobCounts(): Record<string, number> {
  const rows = db().prepare(`SELECT status, COUNT(*) AS n FROM job_matches GROUP BY status`).all() as { status: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

// --- NodeBench job research contexts ---

export function getJobResearchContext(email_id: string): JobResearchContextRow | null {
  return (db().prepare(`SELECT * FROM job_research_contexts WHERE email_id = ? LIMIT 1`).get(email_id) ?? null) as JobResearchContextRow | null;
}

export function listJobResearchContexts(emailIds: string[]): Record<string, JobResearchContextRow> {
  const ids = [...new Set(emailIds.filter(Boolean))].slice(0, 500);
  if (!ids.length) return {};
  const placeholders = ids.map(() => "?").join(",");
  const rows = db().prepare(`
    SELECT *
    FROM job_research_contexts
    WHERE email_id IN (${placeholders})
  `).all(...ids) as JobResearchContextRow[];
  return Object.fromEntries(rows.map((row) => [row.email_id, row]));
}

export function upsertJobResearchContext(input: {
  email_id: string;
  status: JobResearchStatus;
  run_id?: string | null;
  entity_key?: string | null;
  entities_json: string;
  dossier_json?: string | null;
  context_pack_json?: string | null;
  error?: string | null;
  requested_at?: number | null;
  expires_at?: number | null;
}): JobResearchContextRow {
  db().prepare(`
    INSERT INTO job_research_contexts (
      email_id, status, run_id, entity_key, entities_json, dossier_json,
      context_pack_json, error, requested_at, expires_at
    )
    VALUES (
      @email_id, @status, @run_id, @entity_key, @entities_json, @dossier_json,
      @context_pack_json, @error, @requested_at, @expires_at
    )
    ON CONFLICT(email_id) DO UPDATE SET
      status = excluded.status,
      run_id = excluded.run_id,
      entity_key = excluded.entity_key,
      entities_json = excluded.entities_json,
      dossier_json = excluded.dossier_json,
      context_pack_json = excluded.context_pack_json,
      error = excluded.error,
      requested_at = excluded.requested_at,
      expires_at = excluded.expires_at,
      updated_at = unixepoch()
  `).run({
    run_id: null,
    entity_key: null,
    dossier_json: null,
    context_pack_json: null,
    error: null,
    requested_at: null,
    expires_at: null,
    ...input,
  });
  clearReadCache();
  return getJobResearchContext(input.email_id)!;
}

// --- Automation rules ---

export function listRules(enabledOnly = false): AutomationRuleRow[] {
  ensureDefaultAutomationRules();
  if (enabledOnly) {
    return db().prepare(`SELECT * FROM automation_rules WHERE enabled = 1 ORDER BY created_at DESC`).all() as AutomationRuleRow[];
  }
  return db().prepare(`SELECT * FROM automation_rules ORDER BY created_at DESC`).all() as AutomationRuleRow[];
}

export function getRule(id: string): AutomationRuleRow | null {
  return (db().prepare(`SELECT * FROM automation_rules WHERE id = ?`).get(id) ?? null) as AutomationRuleRow | null;
}

export function insertRule(r: Omit<AutomationRuleRow, "created_at" | "updated_at">): AutomationRuleRow {
  db().prepare(`
    INSERT INTO automation_rules (id, name, description, trigger, conditions, actions, enabled, model_routing)
    VALUES (@id, @name, @description, @trigger, @conditions, @actions, @enabled, @model_routing)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, description=excluded.description, trigger=excluded.trigger,
      conditions=excluded.conditions, actions=excluded.actions, enabled=excluded.enabled,
      model_routing=excluded.model_routing, updated_at=unixepoch()
  `).run(r);
  return getRule(r.id)!;
}

export function setRuleEnabled(id: string, enabled: boolean): boolean {
  ensureDefaultAutomationRules();
  const info = db().prepare(`UPDATE automation_rules SET enabled = ?, updated_at = unixepoch() WHERE id = ?`).run(enabled ? 1 : 0, id);
  return info.changes > 0;
}

function ensureDefaultAutomationRules() {
  const count = (db().prepare(`SELECT COUNT(*) AS n FROM automation_rules`).get() as { n: number }).n;
  if (count > 0) return;
  const defaults: Array<Omit<AutomationRuleRow, "created_at" | "updated_at">> = [
    {
      id: "classify-new-mail",
      name: "Classify new mail",
      description: "Keep labels fresh in the background.",
      trigger: "mail_ingested",
      conditions: JSON.stringify({ unclassified: true }),
      actions: JSON.stringify([{ tool: "classify" }]),
      enabled: 1,
      model_routing: "local-first",
    },
    {
      id: "suggest-safe-archives",
      name: "Suggest safe archives",
      description: "Queue low-risk archive candidates for approval.",
      trigger: "classification_complete",
      conditions: JSON.stringify({ lane: "auto_archive", confidence_gte: 0.7 }),
      actions: JSON.stringify([{ tool: "recommend_archive" }]),
      enabled: 1,
      model_routing: "local",
    },
    {
      id: "extract-job-leads",
      name: "Extract job leads",
      description: "Create job records from recruiter and LinkedIn mail.",
      trigger: "classification_complete",
      conditions: JSON.stringify({ lane: "job_alerts" }),
      actions: JSON.stringify([{ tool: "extract_job" }]),
      enabled: 1,
      model_routing: "local",
    },
    {
      id: "draft-follow-ups",
      name: "Draft follow-ups",
      description: "Prepare replies, never send without approval.",
      trigger: "reply_queue",
      conditions: JSON.stringify({ lane: ["reply_now", "career"] }),
      actions: JSON.stringify([{ tool: "draft_reply" }]),
      enabled: 0,
      model_routing: "agent",
    },
    {
      id: "calendar-suggestions",
      name: "Calendar suggestions",
      description: "Suggest time blocks from deadlines and follow-ups.",
      trigger: "calendar_scan",
      conditions: JSON.stringify({ scheduling_signal: true }),
      actions: JSON.stringify([{ tool: "suggest_calendar_block" }]),
      enabled: 1,
      model_routing: "local",
    },
    {
      id: "weekly-pulse",
      name: "Weekly pulse",
      description: "Generate a weekly review from email, calendar, and goals.",
      trigger: "weekly",
      conditions: JSON.stringify({ cadence: "weekly" }),
      actions: JSON.stringify([{ tool: "generate_pulse" }]),
      enabled: 1,
      model_routing: "read-model",
    },
  ];
  const tx = db().transaction((rules: typeof defaults) => {
    for (const rule of rules) insertRule(rule);
  });
  tx(defaults);
}

// --- Rule runs ---

export function logRuleRun(r: Omit<RuleRunRow, "id" | "executed_at">): number {
  const info = db().prepare(`
    INSERT INTO rule_runs (rule_id, trigger, target, payload, success, error_msg)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(r.rule_id, r.trigger, r.target, r.payload, r.success, r.error_msg);

  // Cap rule_runs at 5000 rows total — LRU eviction per CLAUDE.md BOUND rule
  db().prepare(`
    DELETE FROM rule_runs WHERE id IN (
      SELECT id FROM rule_runs ORDER BY executed_at DESC LIMIT -1 OFFSET 5000
    )
  `).run();

  return Number(info.lastInsertRowid);
}

export function listRuleRuns(rule_id?: string, limit = 50): RuleRunRow[] {
  if (rule_id) {
    return db().prepare(`SELECT * FROM rule_runs WHERE rule_id = ? ORDER BY executed_at DESC LIMIT ?`).all(rule_id, limit) as RuleRunRow[];
  }
  return db().prepare(`SELECT * FROM rule_runs ORDER BY executed_at DESC LIMIT ?`).all(limit) as RuleRunRow[];
}

// --- Local workspace settings ---

export function getWorkspaceSettings(): Record<string, unknown> {
  const rows = db().prepare(`SELECT key, value FROM workspace_settings`).all() as Array<{ key: string; value: string }>;
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}

export function getWorkspaceSetting<T>(key: string, fallback: T): T {
  const row = db().prepare(`SELECT value FROM workspace_settings WHERE key = ?`).get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return row.value as T;
  }
}

export function setWorkspaceSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const stmt = db().prepare(`
    INSERT INTO workspace_settings (key, value, updated_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const tx = db().transaction((entries: Array<[string, unknown]>) => {
    for (const [key, value] of entries) stmt.run(key, JSON.stringify(value));
  });
  tx(Object.entries(settings));
  clearReadCache();
  return getWorkspaceSettings();
}

// --- Planner overrides and todos ---

export function listPlannerOverrides(): PlannerOverrideRow[] {
  return db().prepare(`SELECT * FROM planner_overrides ORDER BY updated_at DESC`).all() as PlannerOverrideRow[];
}

export function upsertPlannerOverride(input: {
  id: string;
  title?: string | null;
  status?: PlannerOverrideRow["status"];
  progress?: number | null;
  date_label?: string | null;
}): PlannerOverrideRow {
  db().prepare(`
    INSERT INTO planner_overrides (id, title, status, progress, date_label, updated_at)
    VALUES (@id, @title, @status, @progress, @date_label, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      title = COALESCE(excluded.title, planner_overrides.title),
      status = COALESCE(excluded.status, planner_overrides.status),
      progress = COALESCE(excluded.progress, planner_overrides.progress),
      date_label = COALESCE(excluded.date_label, planner_overrides.date_label),
      updated_at = unixepoch()
  `).run({
    id: input.id,
    title: input.title ?? null,
    status: input.status ?? null,
    progress: input.progress == null ? null : Math.max(0, Math.min(100, Math.round(input.progress))),
    date_label: input.date_label ?? null,
  });
  clearReadCache();
  return db().prepare(`SELECT * FROM planner_overrides WHERE id = ?`).get(input.id) as PlannerOverrideRow;
}

export function listPlannerTodos(): PlannerTodoRow[] {
  return db().prepare(`SELECT * FROM planner_todos ORDER BY status ASC, updated_at DESC`).all() as PlannerTodoRow[];
}

export function upsertPlannerTodo(input: {
  id?: string;
  title: string;
  status?: PlannerTodoRow["status"];
  source?: string;
  linked_email_id?: string | null;
}): PlannerTodoRow {
  const id = input.id ?? `todo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db().prepare(`
    INSERT INTO planner_todos (id, title, status, source, linked_email_id, updated_at)
    VALUES (@id, @title, @status, @source, @linked_email_id, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      status = excluded.status,
      source = excluded.source,
      linked_email_id = excluded.linked_email_id,
      updated_at = unixepoch()
  `).run({
    id,
    title: input.title,
    status: input.status ?? "open",
    source: input.source ?? "manual",
    linked_email_id: input.linked_email_id ?? null,
  });
  clearReadCache();
  return db().prepare(`SELECT * FROM planner_todos WHERE id = ?`).get(id) as PlannerTodoRow;
}

export function setPlannerTodoStatus(id: string, status: PlannerTodoRow["status"]): boolean {
  const info = db().prepare(`UPDATE planner_todos SET status = ?, updated_at = unixepoch() WHERE id = ?`).run(status, id);
  if (info.changes > 0) clearReadCache();
  return info.changes > 0;
}

export function deletePlannerTodo(id: string): boolean {
  const info = db().prepare(`DELETE FROM planner_todos WHERE id = ?`).run(id);
  if (info.changes > 0) clearReadCache();
  return info.changes > 0;
}

// --- Calendar local block state ---

export function listCalendarOverrides(): CalendarOverrideRow[] {
  return db().prepare(`SELECT * FROM calendar_overrides ORDER BY updated_at DESC`).all() as CalendarOverrideRow[];
}

export function upsertCalendarOverride(input: {
  id: string;
  email_id?: string | null;
  title?: string | null;
  date?: string | null;
  start_hour?: number | null;
  duration_hours?: number | null;
  type?: CalendarOverrideRow["type"];
  status?: CalendarOverrideRow["status"];
}): CalendarOverrideRow {
  db().prepare(`
    INSERT INTO calendar_overrides (id, email_id, title, date, start_hour, duration_hours, type, status, updated_at)
    VALUES (@id, @email_id, @title, @date, @start_hour, @duration_hours, @type, @status, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      email_id = COALESCE(excluded.email_id, calendar_overrides.email_id),
      title = COALESCE(excluded.title, calendar_overrides.title),
      date = COALESCE(excluded.date, calendar_overrides.date),
      start_hour = COALESCE(excluded.start_hour, calendar_overrides.start_hour),
      duration_hours = COALESCE(excluded.duration_hours, calendar_overrides.duration_hours),
      type = COALESCE(excluded.type, calendar_overrides.type),
      status = excluded.status,
      updated_at = unixepoch()
  `).run({
    id: input.id,
    email_id: input.email_id ?? null,
    title: input.title ?? null,
    date: input.date ?? null,
    start_hour: input.start_hour ?? null,
    duration_hours: input.duration_hours ?? null,
    type: input.type ?? null,
    status: input.status ?? "scheduled",
  });
  clearReadCache();
  return db().prepare(`SELECT * FROM calendar_overrides WHERE id = ?`).get(input.id) as CalendarOverrideRow;
}

// --- Autopilot runs ---

export function startAutopilotRun(mode: string, trigger: string): number {
  const info = db().prepare(`
    INSERT INTO autopilot_runs (mode, trigger, summary)
    VALUES (?, ?, ?)
  `).run(mode, trigger, JSON.stringify({ status: "running" }));
  return Number(info.lastInsertRowid);
}

export function finishAutopilotRun(
  id: number,
  result: {
    summary: unknown;
    classified: number;
    jobs_created: number;
    opportunities_created: number;
    recommendations_created: number;
    errors?: string | null;
  },
): void {
  db().prepare(`
    UPDATE autopilot_runs
    SET summary = ?,
        classified = ?,
        jobs_created = ?,
        opportunities_created = ?,
        recommendations_created = ?,
        errors = ?,
        finished_at = unixepoch()
    WHERE id = ?
  `).run(
    JSON.stringify(result.summary),
    result.classified,
    result.jobs_created,
    result.opportunities_created,
    result.recommendations_created,
    result.errors ?? null,
    id,
  );
}

export function latestAutopilotRun(): AutopilotRunRow | null {
  return (db().prepare(`SELECT * FROM autopilot_runs ORDER BY started_at DESC LIMIT 1`).get() ?? null) as AutopilotRunRow | null;
}

export function listAutopilotRuns(limit = 10): AutopilotRunRow[] {
  return db().prepare(`SELECT * FROM autopilot_runs ORDER BY started_at DESC LIMIT ?`).all(Math.max(1, Math.min(limit, 50))) as AutopilotRunRow[];
}

// --- Aggregates for Dashboard tiles + Analytics ---

export function dashboardMetrics() {
  return cachedRead("dashboardMetrics", () => {
    const d = db();
    const totalUnread = (d.prepare(`SELECT COUNT(*) AS n FROM emails WHERE is_unread = 1 AND COALESCE(labels, '') != 'ARCHIVED'`).get() as { n: number }).n;
    const urgent = (d.prepare(`
    SELECT COUNT(*) AS n FROM latest_classifications c JOIN emails e ON e.id = c.email_id
    WHERE c.urgency >= 0.7 AND COALESCE(e.labels, '') != 'ARCHIVED'
  `).get() as { n: number }).n;
    const waitingForReply = (d.prepare(`SELECT COUNT(*) AS n FROM actions WHERE action = 'draft_reply' AND reverted_at IS NULL`).get() as { n: number }).n;
    const opportunities = (d.prepare(`SELECT COUNT(*) AS n FROM opportunities WHERE status NOT IN ('won', 'lost')`).get() as { n: number }).n;
    const jobLeads = (d.prepare(`SELECT COUNT(*) AS n FROM job_matches WHERE status IN ('new', 'saved')`).get() as { n: number }).n;
    const lowPriority = (d.prepare(`
    SELECT COUNT(*) AS n FROM latest_classifications c JOIN emails e ON e.id = c.email_id
    WHERE c.urgency < 0.3 AND COALESCE(e.labels, '') != 'ARCHIVED'
  `).get() as { n: number }).n;

    return { totalUnread, urgent, waitingForReply, opportunities, jobLeads, lowPriority };
  });
}

export function analyticsSummary(rangeDays = 30) {
  const d = db();
  const days = Math.max(1, Math.min(rangeDays, 365));
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const prevSince = since - days * 86400;

  const emailsReceived = (d.prepare(`
    SELECT COUNT(*) AS n FROM emails
    WHERE internal_date >= ? AND COALESCE(labels, '') != 'ARCHIVED'
  `).get(since) as { n: number }).n;
  const previousEmails = (d.prepare(`
    SELECT COUNT(*) AS n FROM emails
    WHERE internal_date >= ? AND internal_date < ? AND COALESCE(labels, '') != 'ARCHIVED'
  `).get(prevSince, since) as { n: number }).n;
  const aiProcessed = (d.prepare(`
    SELECT COUNT(*) AS n FROM latest_classifications
    WHERE created_at >= ?
  `).get(since) as { n: number }).n;
  const opportunities = (d.prepare(`SELECT COUNT(*) AS n FROM opportunities WHERE created_at >= ?`).get(since) as { n: number }).n;
  const jobs = (d.prepare(`SELECT COUNT(*) AS n FROM job_matches WHERE created_at >= ?`).get(since) as { n: number }).n;
  const drafts = (d.prepare(`SELECT COUNT(*) AS n FROM actions WHERE action = 'draft_reply' AND executed_at >= ?`).get(since) as { n: number }).n;
  const approved = (d.prepare(`SELECT COUNT(*) AS n FROM actions WHERE executed_at >= ?`).get(since) as { n: number }).n;
  const pendingApprovals = (d.prepare(`SELECT COUNT(*) AS n FROM approval_requests WHERE status = 'pending'`).get() as { n: number }).n;
  const costMicroUsd = (d.prepare(`SELECT COALESCE(SUM(cost_micro_usd), 0) AS n FROM chat_messages WHERE created_at >= ?`).get(since) as { n: number }).n;

  const laneRows = d.prepare(`
    SELECT c.lane, COUNT(*) AS n
    FROM latest_classifications c
    JOIN emails e ON e.id = c.email_id
    WHERE COALESCE(e.labels, '') != 'ARCHIVED'
    GROUP BY c.lane
    ORDER BY n DESC
  `).all() as { lane: string; n: number }[];

  const volume = d.prepare(`
    SELECT date(internal_date, 'unixepoch') AS date, COUNT(*) AS value
    FROM emails
    WHERE internal_date >= ? AND COALESCE(labels, '') != 'ARCHIVED'
    GROUP BY date(internal_date, 'unixepoch')
    ORDER BY date ASC
  `).all(since) as { date: string; value: number }[];

  const timeSavedHours = Math.round((aiProcessed * 0.035 + drafts * 0.12 + approved * 0.02) * 10) / 10;
  const delta = previousEmails ? Math.round(((emailsReceived - previousEmails) / previousEmails) * 100) : 0;
  const processedRate = emailsReceived ? Math.round((Math.min(aiProcessed, emailsReceived) / emailsReceived) * 100) : 100;

  return {
    rangeDays: days,
    updatedAt: Math.floor(Date.now() / 1000),
    stats: {
      emailsReceived,
      previousEmails,
      delta,
      aiProcessed,
      processedRate,
      opportunities,
      jobs,
      drafts,
      pendingApprovals,
      timeSavedHours,
      costUsd: costMicroUsd / 1_000_000,
    },
    lanes: laneRows,
    volume,
  };
}

export interface PrivateContextStatus {
  emails: number;
  private_bodies: number;
  body_coverage: number;
  body_chars: number;
  oldest_email_ts: number | null;
  newest_email_ts: number | null;
  oldest_private_body_ts: number | null;
  newest_private_body_ts: number | null;
  shards: Record<string, number>;
  claims: Record<string, number>;
  last_run: {
    id: number;
    mode: string;
    account_email: string | null;
    gmail_query: string | null;
    fetched_threads: number;
    fetched_messages: number;
    updated_bodies: number;
    shards_created: number;
    error: string | null;
    started_at: number;
    finished_at: number | null;
  } | null;
}

export interface PrivateContextShardRow {
  id: string;
  shard_key: string;
  shard_type: "thread" | "month_topic" | "year_topic" | "domain_topic" | "identity_phase";
  account_email: string | null;
  topic: string | null;
  title: string;
  start_ts: number | null;
  end_ts: number | null;
  email_count: number;
  thread_count: number;
  token_estimate: number;
  body_hash: string;
  evidence_email_ids_json: string;
  aggregate_json: string;
  deterministic_summary: string;
  llm_summary: string | null;
  judge_json: string | null;
  status: string;
  confidence: number;
  created_at: number;
  updated_at: number;
}

export interface PrivateIdentityClaimRow {
  id: string;
  claim_type: string;
  topic: string | null;
  time_range: string | null;
  claim_text: string;
  evidence_shard_ids_json: string;
  evidence_email_ids_json: string;
  aggregate_json: string;
  judge_status: "unjudged" | "supported" | "needs_revision" | "rejected";
  confidence: number;
  model: string | null;
  private_boundary: string;
  created_at: number;
  updated_at: number;
}

export function privateContextStatus(): PrivateContextStatus {
  return cachedRead("privateContextStatus", () => {
    const d = db();
    const emails = d.prepare(`SELECT COUNT(*) AS n, MIN(internal_date) AS oldest, MAX(internal_date) AS newest FROM emails`).get() as { n: number; oldest: number | null; newest: number | null };
    const bodies = d.prepare(`
      SELECT COUNT(*) AS n, COALESCE(SUM(body_chars), 0) AS chars, MIN(e.internal_date) AS oldest, MAX(e.internal_date) AS newest
      FROM private_email_bodies b
      JOIN emails e ON e.id = b.email_id
    `).get() as { n: number; chars: number; oldest: number | null; newest: number | null };
    const shardRows = d.prepare(`SELECT shard_type, COUNT(*) AS n FROM private_context_shards GROUP BY shard_type`).all() as { shard_type: string; n: number }[];
    const claimRows = d.prepare(`SELECT judge_status, COUNT(*) AS n FROM private_identity_claims GROUP BY judge_status`).all() as { judge_status: string; n: number }[];
    const lastRun = d.prepare(`
      SELECT id, mode, account_email, gmail_query, fetched_threads, fetched_messages, updated_bodies,
             shards_created, error, started_at, finished_at
      FROM private_context_runs
      ORDER BY started_at DESC, id DESC
      LIMIT 1
    `).get() as PrivateContextStatus["last_run"] | undefined;
    return {
      emails: emails.n,
      private_bodies: bodies.n,
      body_coverage: emails.n ? Number((bodies.n / emails.n).toFixed(4)) : 0,
      body_chars: bodies.chars,
      oldest_email_ts: emails.oldest,
      newest_email_ts: emails.newest,
      oldest_private_body_ts: bodies.oldest,
      newest_private_body_ts: bodies.newest,
      shards: Object.fromEntries(shardRows.map((row) => [row.shard_type, row.n])),
      claims: Object.fromEntries(claimRows.map((row) => [row.judge_status, row.n])),
      last_run: lastRun ?? null,
    };
  });
}

export function listPrivateContextShards(limit = 30, status?: string): PrivateContextShardRow[] {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  if (status) {
    return db().prepare(`
      SELECT * FROM private_context_shards
      WHERE status = ?
      ORDER BY confidence DESC, updated_at DESC
      LIMIT ?
    `).all(status, safeLimit) as PrivateContextShardRow[];
  }
  return db().prepare(`
    SELECT * FROM private_context_shards
    ORDER BY confidence DESC, updated_at DESC
    LIMIT ?
  `).all(safeLimit) as PrivateContextShardRow[];
}

export function listPrivateIdentityClaims(options: { limit?: number; topic?: string; claimType?: string } = {}): PrivateIdentityClaimRow[] {
  const safeLimit = Math.max(1, Math.min(options.limit ?? 30, 200));
  const where: string[] = [`judge_status = 'supported'`];
  const params: unknown[] = [];
  if (options.topic) {
    where.push("topic = ?");
    params.push(options.topic);
  }
  if (options.claimType) {
    where.push("claim_type = ?");
    params.push(options.claimType);
  }
  params.push(safeLimit);
  return db().prepare(`
    SELECT *
    FROM private_identity_claims
    WHERE ${where.join(" AND ")}
    ORDER BY confidence DESC, updated_at DESC
    LIMIT ?
  `).all(...params) as PrivateIdentityClaimRow[];
}

export function invalidatePrivateContextReads() {
  readCache.delete("privateContextStatus");
}

// ===========================================================================
// OAuth token storage (encrypted at rest with AES-256-GCM)
// ===========================================================================

import crypto from "node:crypto";

function getTokenKey(): Buffer {
  // Key derivation: env > generated file. Generated file lives next to db.
  const env = process.env.GMAIL_TOKEN_KEY;
  if (env && /^[0-9a-f]{64}$/i.test(env)) return Buffer.from(env, "hex");

  const keyPath = path.join(DB_DIR, ".token-key");
  if (fs.existsSync(keyPath)) {
    return Buffer.from(fs.readFileSync(keyPath, "utf-8").trim(), "hex");
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key.toString("hex"), { mode: 0o600 });
  return key;
}

function encrypt(plaintext: string): string {
  const key = getTokenKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

function decrypt(blob: string | null | undefined): string | null {
  if (!blob) return null;
  try {
    const [ivB64, tagB64, encB64] = blob.split(".");
    const key = getTokenKey();
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const enc = Buffer.from(encB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString("utf-8");
  } catch {
    return null;
  }
}

export interface OAuthToken {
  account_email: string;
  access_token: string;
  refresh_token: string | null;
  expiry_ms: number | null;
  scope: string | null;
  history_id: string | null;
  last_sync_at: number | null;
  connected_at: number;
}

export function saveToken(t: {
  account_email: string;
  access_token: string;
  refresh_token?: string | null;
  expiry_ms?: number | null;
  scope?: string | null;
}): void {
  db().prepare(`
    INSERT INTO oauth_tokens (account_email, provider, access_token_enc, refresh_token_enc, expiry_ms, scope)
    VALUES (?, 'google', ?, ?, ?, ?)
    ON CONFLICT(account_email) DO UPDATE SET
      access_token_enc = excluded.access_token_enc,
      refresh_token_enc = COALESCE(excluded.refresh_token_enc, oauth_tokens.refresh_token_enc),
      expiry_ms = excluded.expiry_ms,
      scope = excluded.scope
  `).run(
    t.account_email,
    encrypt(t.access_token),
    t.refresh_token ? encrypt(t.refresh_token) : null,
    t.expiry_ms ?? null,
    t.scope ?? null,
  );
}

export function getToken(account_email?: string): OAuthToken | null {
  const row = (account_email
    ? db().prepare(`SELECT * FROM oauth_tokens WHERE account_email = ? LIMIT 1`).get(account_email)
    : db().prepare(`SELECT * FROM oauth_tokens ORDER BY connected_at DESC LIMIT 1`).get()
  ) as any;
  if (!row) return null;
  return {
    account_email: row.account_email,
    access_token: decrypt(row.access_token_enc) ?? "",
    refresh_token: decrypt(row.refresh_token_enc),
    expiry_ms: row.expiry_ms,
    scope: row.scope,
    history_id: row.history_id,
    last_sync_at: row.last_sync_at,
    connected_at: row.connected_at,
  };
}

export function listConnectedAccounts(): Array<{ account_email: string; connected_at: number; last_sync_at: number | null }> {
  return db().prepare(`SELECT account_email, connected_at, last_sync_at FROM oauth_tokens ORDER BY connected_at DESC`).all() as any[];
}

export function setHistoryId(account_email: string, history_id: string): void {
  db().prepare(`UPDATE oauth_tokens SET history_id = ?, last_sync_at = unixepoch() WHERE account_email = ?`).run(history_id, account_email);
}

export function deleteToken(account_email: string): boolean {
  const info = db().prepare(`DELETE FROM oauth_tokens WHERE account_email = ?`).run(account_email);
  return info.changes > 0;
}

// ===========================================================================
// Inbox listing
// ===========================================================================

export function listEmailsForInbox(filter?: { tab?: string; limit?: number; query?: string }): LaneCard[] {
  const limit = filter?.limit ?? 100;
  const tab = filter?.tab ?? "all";
  const query = filter?.query?.trim();
  const safeLimit = Math.max(1, Math.min(limit, 250));
  if (!query) {
    return cachedRead(`inbox:${tab}:${safeLimit}`, () => listEmailsForInboxUncached({ tab, limit: safeLimit }));
  }
  return listEmailsForInboxUncached({ tab, limit: safeLimit, query });
}

function listEmailsForInboxUncached(filter: { tab: string; limit: number; query?: string }): LaneCard[] {
  const { tab, query } = filter;
  const select = `
    SELECT e.id, e.thread_id, e.from_addr, e.from_name, NULL AS to_addrs,
           e.subject, e.snippet, NULL AS body, e.internal_date, e.labels,
           e.is_unread, e.ingested_at,
           c.lane, c.urgency, c.action, c.rationale, c.confidence, c.model AS classifier
  `;
  const laneTabs = new Set<string>(LANES);
  const params: unknown[] = [];
  let filtered = true;
  let sql = "";

  if (tab === "reply_now") {
    sql = `
      ${select}
      FROM latest_classifications c
      JOIN emails e ON e.id = c.email_id
      WHERE c.lane IN ('reply_now', 'career')
        AND e.is_unread = 1
        AND COALESCE(e.labels, '') != 'ARCHIVED'
    `;
  } else if (tab === "admin") {
    sql = `
      ${select}
      FROM latest_classifications c
      JOIN emails e ON e.id = c.email_id
      WHERE c.lane IN ('money', 'subscriptions', 'travel_auto')
        AND COALESCE(e.labels, '') != 'ARCHIVED'
    `;
  } else if (tab === "triage") {
    sql = `
      ${select}
      FROM latest_classifications c
      JOIN emails e ON e.id = c.email_id
      WHERE (c.lane = 'triage' OR c.confidence < 0.5)
        AND COALESCE(e.labels, '') != 'ARCHIVED'
    `;
  } else if (laneTabs.has(tab)) {
    sql = `
      ${select}
      FROM latest_classifications c
      JOIN emails e ON e.id = c.email_id
      WHERE c.lane = ?
        AND COALESCE(e.labels, '') != 'ARCHIVED'
    `;
    params.push(tab);
  } else {
    filtered = false;
    sql = `
      ${select}
      FROM emails e
      LEFT JOIN latest_classifications c ON c.email_id = e.id
      WHERE COALESCE(e.labels, '') != 'ARCHIVED'
    `;
  }

  if (tab === "unread") sql += ` AND e.is_unread = 1`;
  if (query) {
    sql += ` AND (e.subject LIKE ? OR e.from_addr LIKE ? OR e.from_name LIKE ? OR e.snippet LIKE ?)`;
    const q = `%${query}%`;
    params.push(q, q, q, q);
  }
  sql += filtered ? ` ORDER BY c.urgency DESC, e.internal_date DESC LIMIT ?` : ` ORDER BY e.internal_date DESC LIMIT ?`;
  params.push(filter.limit);
  return db().prepare(sql).all(...params) as LaneCard[];
}
