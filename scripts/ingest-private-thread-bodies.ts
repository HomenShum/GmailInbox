import crypto from "node:crypto";
import fs from "node:fs";
import { db, invalidatePrivateContextReads, privateContextStatus } from "../src/lib/db";
import { fetchThreadsFull, listMessageRefs, type GmailMessageFull } from "../src/lib/gmail/client";

loadDotEnv(".env.local");

interface Args {
  account?: string;
  limit: number;
  maxPages: number;
  pageSize: number;
  remoteQuery?: string;
  includeSpamTrash: boolean;
  oldestFirst: boolean;
  onlyMissing: boolean;
  rebuildShards: boolean;
  rebuildOnly: boolean;
  dryRun: boolean;
}

const args = parseArgs(process.argv.slice(2));
const d = db();
const runId = startRun(args);

const STOPWORDS = new Set([
  "the", "and", "for", "you", "your", "with", "from", "this", "that", "have", "has", "are", "was", "were",
  "not", "but", "all", "can", "our", "out", "new", "get", "got", "now", "just", "about", "into", "more",
  "will", "one", "two", "day", "week", "month", "year", "today", "tomorrow", "here", "there", "when",
  "what", "why", "how", "hello", "thanks", "thank", "regards", "best", "team", "please", "would", "could",
  "should", "also", "via", "using", "used", "message", "mail", "email", "emails", "inbox", "re", "fw",
  "fwd", "amp", "quot", "nbsp", "com", "www", "html", "body", "class", "style", "utm", "href", "free",
  "click", "view", "unsubscribe",
]);

try {
  if (args.rebuildOnly) {
    const shardsCreated = rebuildPrivateContextShards();
    finishRun(runId, { fetchedThreads: 0, fetchedMessages: 0, updatedBodies: 0, shardsCreated });
    invalidatePrivateContextReads();
    console.log(JSON.stringify({
      ok: true,
      rebuildOnly: true,
      shardsCreated,
      status: privateContextStatus(),
    }, null, 2));
    process.exit(0);
  }

  const threadIds = args.remoteQuery
    ? await remoteThreadIds(args)
    : localThreadIds(args);
  const selectedThreadIds = Array.from(new Set(threadIds)).slice(0, args.limit);

  if (args.dryRun) {
    finishRun(runId, { fetchedThreads: selectedThreadIds.length, fetchedMessages: 0, updatedBodies: 0, shardsCreated: 0 });
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      selectedThreads: selectedThreadIds.length,
      status: privateContextStatus(),
    }, null, 2));
    process.exit(0);
  }

  const threads = await fetchThreadsFull({
    account_email: args.account,
    threadIds: selectedThreadIds,
  });

  const upserted = upsertThreads(args.account ?? null, threads.flatMap((thread) => thread.messages));
  const shardsCreated = args.rebuildShards ? rebuildPrivateContextShards() : 0;
  finishRun(runId, {
    fetchedThreads: threads.length,
    fetchedMessages: upserted.messages,
    updatedBodies: upserted.bodies,
    shardsCreated,
    oldestRemoteDate: upserted.oldest,
    newestRemoteDate: upserted.newest,
  });
  invalidatePrivateContextReads();

  console.log(JSON.stringify({
    ok: true,
    selectedThreads: selectedThreadIds.length,
    fetchedThreads: threads.length,
    fetchedMessages: upserted.messages,
    updatedBodies: upserted.bodies,
    shardsCreated,
    status: privateContextStatus(),
  }, null, 2));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  failRun(runId, message);
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
}

async function remoteThreadIds(opts: Args): Promise<string[]> {
  const res = await listMessageRefs({
    account_email: opts.account,
    maxPages: opts.maxPages,
    pageSize: opts.pageSize,
    query: opts.remoteQuery,
    includeSpamTrash: opts.includeSpamTrash,
  });
  return res.refs.map((ref) => ref.threadId);
}

function localThreadIds(opts: Args): string[] {
  const order = opts.oldestFirst ? "MIN(e.internal_date) ASC" : "MAX(e.internal_date) DESC";
  const missingClause = opts.onlyMissing ? "AND b.email_id IS NULL" : "";
  const rows = d.prepare(`
    SELECT e.thread_id AS thread_id
    FROM emails e
    LEFT JOIN private_email_bodies b ON b.email_id = e.id
    WHERE e.id LIKE 'gm_%'
      AND e.thread_id IS NOT NULL
      ${missingClause}
    GROUP BY e.thread_id
    ORDER BY ${order}
    LIMIT ?
  `).all(opts.limit) as { thread_id: string }[];
  return rows.map((row) => row.thread_id);
}

function upsertThreads(accountEmail: string | null, messages: GmailMessageFull[]) {
  const insertEmail = d.prepare(`
    INSERT INTO emails (id, thread_id, from_addr, from_name, to_addrs, subject, snippet, body, internal_date, labels, is_unread)
    VALUES (@id, @thread_id, @from_addr, @from_name, @to_addrs, @subject, @snippet, NULL, @internal_date, @labels, @is_unread)
    ON CONFLICT(id) DO UPDATE SET
      thread_id = excluded.thread_id,
      from_addr = excluded.from_addr,
      from_name = excluded.from_name,
      to_addrs = excluded.to_addrs,
      subject = excluded.subject,
      snippet = excluded.snippet,
      labels = excluded.labels,
      is_unread = excluded.is_unread
  `);
  const insertBody = d.prepare(`
    INSERT INTO private_email_bodies (
      email_id, thread_id, gmail_message_id, gmail_thread_id, account_email,
      body_text, body_hash, body_chars, source_format, fetched_at, updated_at
    )
    VALUES (@email_id, @thread_id, @gmail_message_id, @gmail_thread_id, @account_email,
      @body_text, @body_hash, @body_chars, 'gmail_full', unixepoch(), unixepoch())
    ON CONFLICT(email_id) DO UPDATE SET
      thread_id = excluded.thread_id,
      gmail_message_id = excluded.gmail_message_id,
      gmail_thread_id = excluded.gmail_thread_id,
      account_email = excluded.account_email,
      body_text = excluded.body_text,
      body_hash = excluded.body_hash,
      body_chars = excluded.body_chars,
      source_format = excluded.source_format,
      updated_at = unixepoch()
  `);

  let bodyCount = 0;
  let messageCount = 0;
  let oldest: number | null = null;
  let newest: number | null = null;
  const tx = d.transaction((items: GmailMessageFull[]) => {
    for (const message of items) {
      const from = parseAddress(message.headers.from);
      const body = message.bodyText || message.snippet || "";
      const internalDate = Math.floor(message.internalDate / 1000);
      const emailId = `gm_${message.id}`;
      insertEmail.run({
        id: emailId,
        thread_id: message.threadId,
        from_addr: from.addr,
        from_name: from.name,
        to_addrs: message.headers.to ?? "",
        subject: message.headers.subject ?? "(no subject)",
        snippet: message.snippet,
        internal_date: internalDate,
        labels: message.labelIds.join(","),
        is_unread: message.labelIds.includes("UNREAD") ? 1 : 0,
      });
      insertBody.run({
        email_id: emailId,
        thread_id: message.threadId,
        gmail_message_id: message.id,
        gmail_thread_id: message.threadId,
        account_email: accountEmail,
        body_text: body,
        body_hash: sha256(body),
        body_chars: body.length,
      });
      messageCount += 1;
      if (body.trim()) bodyCount += 1;
      oldest = oldest === null ? internalDate : Math.min(oldest, internalDate);
      newest = newest === null ? internalDate : Math.max(newest, internalDate);
    }
  });
  tx(messages);
  return { messages: messageCount, bodies: bodyCount, oldest, newest };
}

function rebuildPrivateContextShards(): number {
  const rows = d.prepare(`
    SELECT e.id, e.thread_id, e.from_addr, e.from_name, e.subject, e.snippet, e.internal_date,
           b.body_text, b.body_hash, b.body_chars
    FROM private_email_bodies b
    JOIN emails e ON e.id = b.email_id
    WHERE b.body_text IS NOT NULL AND length(trim(b.body_text)) > 0
    ORDER BY e.internal_date ASC
  `).all() as Array<{
    id: string;
    thread_id: string | null;
    from_addr: string;
    from_name: string | null;
    subject: string;
    snippet: string;
    internal_date: number;
    body_text: string;
    body_hash: string;
    body_chars: number;
  }>;

  const groups = new Map<string, typeof rows>();
  const threadGroups = new Map<string, typeof rows>();
  for (const row of rows) {
    const topics = classifyTopics(`${row.from_addr} ${row.subject} ${row.snippet} ${row.body_text}`);
    for (const topic of topics) {
      pushGroup(groups, `month_topic:${monthKey(row.internal_date)}:${topic}`, row);
      pushGroup(groups, `year_topic:${yearKey(row.internal_date)}:${topic}`, row);
      pushGroup(groups, `domain_topic:${senderDomain(row.from_addr)}:${topic}`, row);
    }
    pushGroup(threadGroups, `thread:${row.thread_id ?? row.id}`, row);
  }

  const upsertShard = d.prepare(`
    INSERT INTO private_context_shards (
      id, shard_key, shard_type, account_email, topic, title, start_ts, end_ts,
      email_count, thread_count, token_estimate, body_hash,
      evidence_email_ids_json, aggregate_json, deterministic_summary,
      status, confidence, updated_at
    )
    VALUES (@id, @shard_key, @shard_type, @account_email, @topic, @title, @start_ts, @end_ts,
      @email_count, @thread_count, @token_estimate, @body_hash,
      @evidence_email_ids_json, @aggregate_json, @deterministic_summary,
      'deterministic', @confidence, unixepoch())
    ON CONFLICT(shard_key) DO UPDATE SET
      topic = excluded.topic,
      title = excluded.title,
      start_ts = excluded.start_ts,
      end_ts = excluded.end_ts,
      email_count = excluded.email_count,
      thread_count = excluded.thread_count,
      token_estimate = excluded.token_estimate,
      body_hash = excluded.body_hash,
      evidence_email_ids_json = excluded.evidence_email_ids_json,
      aggregate_json = excluded.aggregate_json,
      deterministic_summary = excluded.deterministic_summary,
      status = CASE WHEN private_context_shards.body_hash = excluded.body_hash THEN private_context_shards.status ELSE 'deterministic' END,
      confidence = excluded.confidence,
      updated_at = unixepoch()
  `);

  const tx = d.transaction(() => {
    for (const [key, items] of groups) {
      upsertShard.run(buildShard(key, items));
    }
    for (const [key, items] of threadGroups) {
      if (items.length >= 2 || items.some((item) => item.body_chars > 800)) {
        upsertShard.run(buildShard(key, items));
      }
    }
  });
  tx();
  return groups.size + threadGroups.size;
}

function buildShard(key: string, items: Array<{
  id: string;
  thread_id: string | null;
  from_addr: string;
  subject: string;
  snippet: string;
  internal_date: number;
  body_text: string;
  body_hash: string;
  body_chars: number;
}>) {
  const [shardType, ...parts] = key.split(":");
  const topic = shardType === "thread" ? classifyTopics(items.map((item) => `${item.subject} ${item.snippet} ${item.body_text}`).join("\n")).at(0) ?? "general" : parts.at(-1) ?? "general";
  const ids = Array.from(new Set(items.map((item) => item.id)));
  const threads = Array.from(new Set(items.map((item) => item.thread_id ?? item.id)));
  const start = Math.min(...items.map((item) => item.internal_date));
  const end = Math.max(...items.map((item) => item.internal_date));
  const terms = topTerms(items.map((item) => `${item.subject} ${item.snippet} ${item.body_text}`).join("\n"), 12);
  const domains = topCounts(items.map((item) => senderDomain(item.from_addr)), 8);
  const tokenEstimate = Math.ceil(items.reduce((total, item) => total + item.body_chars, 0) / 4);
  const title = titleForShard(shardType, parts, topic, items);
  const aggregate = {
    terms,
    domains,
    date_range: [isoDate(start), isoDate(end)],
    newest_subjects: items.slice(-5).map((item) => item.subject).filter(Boolean),
  };
  return {
    id: `pcs_${sha256(key).slice(0, 24)}`,
    shard_key: key,
    shard_type: shardType,
    account_email: args.account ?? null,
    topic,
    title,
    start_ts: start,
    end_ts: end,
    email_count: ids.length,
    thread_count: threads.length,
    token_estimate: tokenEstimate,
    body_hash: sha256(items.map((item) => item.body_hash).sort().join("|")),
    evidence_email_ids_json: JSON.stringify(ids),
    aggregate_json: JSON.stringify(aggregate),
    deterministic_summary: `${title}: ${ids.length} private emails across ${threads.length} thread(s), ${formatTopic(topic)} topic, ${isoDate(start)} to ${isoDate(end)}. Top terms: ${terms.map((term) => term.term).join(", ")}.`,
    confidence: Math.min(0.95, 0.45 + Math.log10(ids.length + 1) / 2),
  };
}

function classifyTopics(text: string): string[] {
  const normalized = normalize(text);
  const out: string[] = [];
  const checks: Array<[string, RegExp]> = [
    ["finance_risk", /finance|investment|market|stock|option order|trade executed|risk|credit|underwriting|jpmorgan|jp morgan|commercial banking|analyst program/],
    ["career_jobs", /recruiter|talent acquisition|interview|hiring|candidate|resume|job alert|role at|position at|greenhouse|lever|workday|ashby|linkedin job/],
    ["ai_agents", /artificial intelligence|machine learning|generative|genai|llm|agentic|openai|anthropic|claude|langchain|langgraph|mcp|embedding|rag|eval|benchmark/],
    ["software_dev", /github|pull request|commit|repo|typescript|javascript|python|react|next\.js|nodebench|api|database|vercel|render|workflow run/],
    ["product_design", /product|prototype|dashboard|workspace|interface|ux|ui|figma|design|workflow automation|agent workflow|parity studio/],
    ["startup_builder", /startup|founder|cofounder|yc|y combinator|investor|vc|venture|revenue|customer|users|launch|stripe|pricing/],
    ["money_tax_admin", /tax|irs|accountant|deduction|refund|1099|w-2|bill|payment|invoice|renewal|credit card|bank account|due date/],
    ["personal_life", /family|mom|mother|dad|friend|birthday|personal|gym|fitness|dance|health|doctor|therapy|rover/],
    ["community_social", /event|meetup|conference|hackathon|community|network|invite|rsvp|linkedin|slack|discord|webinar|happy hour/],
    ["research_learning", /research|paper|arxiv|notebook|notes|course|lesson|certification|learn|study|newsletter|briefing|report/],
    ["logistics_travel_auto", /flight|hotel|reservation|travel|trip|booking|itinerary|mazda|vehicle|car|auto|shipping|tracking/],
    ["consumer_subscriptions", /amazon|order|shopping|sale|discount|promo|coupon|subscription|unsubscribe|receipt|refund|purchase/],
  ];
  for (const [topic, pattern] of checks) {
    if (pattern.test(normalized)) out.push(topic);
  }
  return out.length ? out.slice(0, 4) : ["general"];
}

function titleForShard(shardType: string, parts: string[], topic: string, items: Array<{ subject: string }>) {
  if (shardType === "thread") return `Thread: ${items.at(-1)?.subject?.slice(0, 90) || "private email thread"}`;
  if (shardType === "month_topic") return `${parts[0]} ${formatTopic(topic)}`;
  if (shardType === "year_topic") return `${parts[0]} ${formatTopic(topic)}`;
  if (shardType === "domain_topic") return `${parts[0]} ${formatTopic(topic)}`;
  return `${formatTopic(topic)} shard`;
}

function pushGroup<T>(map: Map<string, T[]>, key: string, value: T) {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function parseAddress(raw: string | undefined): { name: string | null; addr: string } {
  if (!raw) return { name: null, addr: "" };
  const match = raw.match(/^"?([^"<]+?)"?\s*<\s*([^>]+)\s*>\s*$/);
  if (match) return { name: match[1].trim(), addr: match[2].trim().toLowerCase() };
  return { name: null, addr: raw.trim().toLowerCase() };
}

function senderDomain(addr: string) {
  return (addr.match(/@([a-z0-9.-]+\.[a-z]{2,})/i)?.[1] ?? "unknown").toLowerCase();
}

function normalize(text: string) {
  return String(text ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function topTerms(text: string, limit: number) {
  const counts = new Map<string, number>();
  for (const token of normalize(text).split(/[^a-z0-9+#.-]+/)) {
    if (token.length < 3 || token.length > 28 || STOPWORDS.has(token) || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

function topCounts(values: string[], limit: number) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value, count]) => ({ value, count }));
}

function startRun(opts: Args) {
  const info = d.prepare(`
    INSERT INTO private_context_runs (mode, account_email, gmail_query, requested_limit)
    VALUES (?, ?, ?, ?)
  `).run(opts.remoteQuery ? "remote_query_full_thread_body_ingest" : "local_thread_body_backfill", opts.account ?? null, opts.remoteQuery ?? null, opts.limit);
  return Number(info.lastInsertRowid);
}

function finishRun(id: number, stats: { fetchedThreads: number; fetchedMessages: number; updatedBodies: number; shardsCreated: number; oldestRemoteDate?: number | null; newestRemoteDate?: number | null }) {
  d.prepare(`
    UPDATE private_context_runs
    SET fetched_threads = ?, fetched_messages = ?, updated_bodies = ?, shards_created = ?,
        oldest_remote_date = ?, newest_remote_date = ?, finished_at = unixepoch()
    WHERE id = ?
  `).run(stats.fetchedThreads, stats.fetchedMessages, stats.updatedBodies, stats.shardsCreated, stats.oldestRemoteDate ?? null, stats.newestRemoteDate ?? null, id);
}

function failRun(id: number, error: string) {
  d.prepare(`UPDATE private_context_runs SET error = ?, finished_at = unixepoch() WHERE id = ?`).run(error, id);
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    account: get("--account"),
    limit: Number(get("--limit") ?? 25),
    maxPages: Number(get("--max-pages") ?? 1),
    pageSize: Number(get("--page-size") ?? 100),
    remoteQuery: get("--remote-query"),
    includeSpamTrash: argv.includes("--include-spam-trash"),
    oldestFirst: argv.includes("--oldest-first"),
    onlyMissing: !argv.includes("--include-existing"),
    rebuildShards: !argv.includes("--skip-shards"),
    rebuildOnly: argv.includes("--rebuild-only"),
    dryRun: argv.includes("--dry-run"),
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

function monthKey(ts: number) {
  const date = new Date(ts * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function yearKey(ts: number) {
  return String(new Date(ts * 1000).getUTCFullYear());
}

function isoDate(ts: number) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function formatTopic(topic: string) {
  return topic.replace(/_/g, " ");
}
