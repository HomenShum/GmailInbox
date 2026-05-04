/**
 * Atomic Gmail-triage tools. Single source of truth — consumed by:
 *   - the in-process chat agent loop (src/lib/agent.ts)
 *   - the MCP stdio server (mcp-server/src/index.ts)
 *
 * Each tool: zod schema for validation + a pure handler that operates on the SQLite store.
 * Real Gmail OAuth is deferred — the seed.ts script populates the local DB; handlers mutate it.
 *
 * Per parity-studio + CLAUDE.md HONEST_STATUS rule: handlers return structured
 * { ok, error, ...data } and never claim success on failure.
 */

import { z } from "zod";
import { Type, type Static } from "@sinclair/typebox";
import {
  applyArchive, applyLabel, db, getEmail, listLaneCards, laneCounts as getLaneCounts, markRead, recordAction,
  searchEmails, upsertClassification, laneCounts,
  listOpportunities, getOpportunity, insertOpportunity, updateOpportunityStatus, updateOpportunityScore, opportunityCounts,
  listJobs, insertJob, updateJobStatus, jobCounts,
  listRules, getRule, insertRule, setRuleEnabled, logRuleRun, listRuleRuns,
  privateContextStatus, listPrivateContextShards,
  listPrivateIdentityClaims,
  type EmailRow,
} from "./db";
import { isConnected } from "./gmail/auth";
import { archiveOnGmail, markReadOnGmail } from "./gmail/client";
import { ingestInbox } from "./gmail/ingest";
import { LANES, isLane, type Lane } from "./lanes";
import { heuristicClassify } from "./heuristic";
import { listPinnedArtifacts, updatePinnedArtifactState, upsertPinnedArtifact } from "./pinned-artifacts";

// ---------------------------------------------------------------------------
// Tool schemas (typebox) — pi-ai format
// ---------------------------------------------------------------------------

export const TOOL_LIST = [
  {
    name: "list_lanes",
    description: "Return per-lane card counts and the top N most-urgent cards in each lane.",
    parameters: Type.Object({
      top: Type.Optional(Type.Number({ description: "Top N cards per lane (default 5, max 20)" })),
    }),
  },
  {
    name: "search_emails",
    description: "Full-text search across subject, sender, snippet. Returns matches sorted by date desc.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query (1+ chars)" }),
      limit: Type.Optional(Type.Number({ description: "Max results (default 10, max 50)" })),
    }),
  },
  {
    name: "get_email",
    description: "Fetch full details for one email by id, including body and current classification.",
    parameters: Type.Object({
      id: Type.String({ description: "Email id" }),
    }),
  },
  {
    name: "archive_email",
    description: "Archive an email (sets labels=ARCHIVED, marks read). Atomic, undo-able via action log.",
    parameters: Type.Object({
      id: Type.String({ description: "Email id" }),
    }),
  },
  {
    name: "label_email",
    description: "Set the lane label for an email and re-classify it under the lane.",
    parameters: Type.Object({
      id: Type.String({ description: "Email id" }),
      lane: Type.String({ description: `One of: ${LANES.join(", ")}` }),
      reason: Type.Optional(Type.String({ description: "Why this lane (stored as rationale)" })),
    }),
  },
  {
    name: "draft_reply",
    description: "Save a draft reply for an email (does NOT send). Stored in the action log.",
    parameters: Type.Object({
      id: Type.String({ description: "Email id" }),
      body: Type.String({ description: "Reply body. Markdown OK." }),
    }),
  },
  {
    name: "snooze_email",
    description: "Snooze an email until a future timestamp.",
    parameters: Type.Object({
      id: Type.String({ description: "Email id" }),
      until_iso: Type.String({ description: "ISO 8601 timestamp" }),
    }),
  },
  {
    name: "bulk_archive",
    description: "Archive an array of emails atomically. Returns per-id ok/err.",
    parameters: Type.Object({
      ids: Type.Array(Type.String(), { description: "Email ids" }),
    }),
  },
  {
    name: "classify_unclassified",
    description: "Run the heuristic classifier on emails that have no classification yet. Returns counts.",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Max emails to classify in one call (default 200)" })),
    }),
  },
  {
    name: "lane_counts",
    description: "Return current count of emails per lane.",
    parameters: Type.Object({}),
  },
  {
    name: "list_pinned_artifacts",
    description: "Return the local artifacts pinned as workspace agent context, including preview summaries and safety policy.",
    parameters: Type.Object({}),
  },
  {
    name: "pin_artifact",
    description: "Pin a local artifact path or note as reusable agent context. Does not upload file contents.",
    parameters: Type.Object({
      name: Type.String({ description: "Human-readable artifact name" }),
      local_path: Type.Optional(Type.String({ description: "Local file path or reference" })),
      artifact_type: Type.Optional(Type.String({ description: "resume, story_bank, target_list, constraint, portfolio, or note" })),
      summary: Type.Optional(Type.String({ description: "Preview summary for the agent and UI" })),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Short tags" })),
      is_primary: Type.Optional(Type.Boolean({ description: "Make this the primary matching lens" })),
    }),
  },
  {
    name: "set_artifact_policy",
    description: "Update matching or external-research policy for a pinned artifact.",
    parameters: Type.Object({
      id: Type.String({ description: "Pinned artifact id" }),
      approved_for_matching: Type.Optional(Type.Boolean({ description: "Allow local matching and briefings" })),
      approved_for_external_research: Type.Optional(Type.Boolean({ description: "Allow summaries to be used for external research calls" })),
      is_primary: Type.Optional(Type.Boolean({ description: "Make this the primary lens" })),
      pinned: Type.Optional(Type.Boolean({ description: "Show or hide from workspace context" })),
    }),
  },
  // v0.2.0 additions
  {
    name: "extract_opportunities",
    description: "Extract opportunities from emails by id. Returns created opportunity records.",
    parameters: Type.Object({
      email_ids: Type.Array(Type.String(), { description: "Email ids to extract from"}),
    }),
  },
  {
    name: "score_opportunity",
    description: "Re-score an opportunity and update its estimated value.",
    parameters: Type.Object({
      id: Type.String({ description: "Opportunity id"}),
    }),
  },
  {
    name: "save_opportunity",
    description: "Save a new opportunity from email data.",
    parameters: Type.Object({
      email_id: Type.String({ description: "Source email id"}),
      name: Type.String({ description: "Opportunity name"}),
      est_value_usd: Type.Optional(Type.Number({ description: "Estimated value USD"})),
      deadline: Type.Optional(Type.String({ description: "Deadline ISO date"})),
    }),
  },
  {
    name: "apply_opportunity",
    description: "Mark opportunity as applied/won and create action record.",
    parameters: Type.Object({
      id: Type.String({ description: "Opportunity id"}),
    }),
  },
  {
    name: "extract_jobs",
    description: "Extract job matches from emails by id. Returns created job match records.",
    parameters: Type.Object({
      email_ids: Type.Array(Type.String(), { description: "Email ids to extract from"}),
    }),
  },
  {
    name: "save_job",
    description: "Save a job match from email.",
    parameters: Type.Object({
      email_id: Type.String({ description: "Source email id"}),
      title: Type.String({ description: "Job title"}),
      company: Type.Optional(Type.String({ description: "Company name"})),
    }),
  },
  {
    name: "mark_applied",
    description: "Mark a job match as applied.",
    parameters: Type.Object({
      id: Type.String({ description: "Job match id"}),
    }),
  },
  {
    name: "create_rule",
    description: "Create an automation rule.",
    parameters: Type.Object({
      name: Type.String({ description: "Rule name"}),
      description: Type.Optional(Type.String({ description: "Description"})),
      trigger: Type.String({ description: "Trigger type"}),
      conditions: Type.String({ description: "JSON conditions"}),
      actions: Type.String({ description: "JSON actions"}),
    }),
  },
  {
    name: "toggle_rule",
    description: "Enable/disable an automation rule.",
    parameters: Type.Object({
      id: Type.String({ description: "Rule id"}),
      enabled: Type.Boolean({ description: "Enable state"}),
    }),
  },
  {
    name: "simulate_rule",
    description: "Simulate a rule against sample data.",
    parameters: Type.Object({
      id: Type.String({ description: "Rule id"}),
      sample_size: Type.Optional(Type.Number({ description: "Sample size (default 100)"})),
    }),
  },
  {
    name: "list_rules",
    description: "List automation rules.",
    parameters: Type.Object({
      enabled_only: Type.Optional(Type.Boolean({ description: "Only enabled rules"})),
    }),
  },
  {
    name: "list_runs",
    description: "List rule execution runs.",
    parameters: Type.Object({
      rule_id: Type.Optional(Type.String({ description: "Filter by rule id"})),
      limit: Type.Optional(Type.Number({ description: "Max runs (default 50)"})),
    }),
  },
  {
    name: "ingest_inbox",
    description: "Pull latest emails from the connected Gmail account into the local store. Returns counts. Requires a connected account.",
    parameters: Type.Object({
      max_pages: Type.Optional(Type.Number({ description: "Max pages to fetch (cap 50, default 5 → ~500 messages)" })),
      page_size: Type.Optional(Type.Number({ description: "Messages per page (default 100, max 500)" })),
      query: Type.Optional(Type.String({ description: "Optional Gmail search query, e.g. 'newer_than:7d'" })),
    }),
  },
  {
    name: "private_context_status",
    description: "Return private full-body ingest and shard coverage. Does not return raw email bodies.",
    parameters: Type.Object({}),
  },
  {
    name: "list_private_context_shards",
    description: "List private context shards for agent reasoning. Returns aggregate summaries and evidence ids only, not raw bodies.",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Max shards (default 20, max 100)" })),
      status: Type.Optional(Type.String({ description: "Optional status filter, e.g. deterministic or queued" })),
    }),
  },
  {
    name: "list_private_identity_claims",
    description: "List supported private identity/memory claims promoted from judged shards. Returns summaries and evidence ids only, not raw bodies.",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Max claims (default 20, max 100)" })),
      topic: Type.Optional(Type.String({ description: "Optional topic filter, e.g. ai_agents or finance_risk" })),
      claim_type: Type.Optional(Type.String({ description: "Optional claim type filter, e.g. builder_identity_signal" })),
    }),
  },
] as const;

// ---------------------------------------------------------------------------
// zod schemas (used by MCP server)
// ---------------------------------------------------------------------------

export const ZodSchemas = {
  list_lanes:           z.object({ top: z.number().int().min(1).max(20).optional() }),
  search_emails:        z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(50).optional() }),
  get_email:            z.object({ id: z.string().min(1) }),
  archive_email:        z.object({ id: z.string().min(1) }),
  label_email:          z.object({ id: z.string().min(1), lane: z.string().min(1), reason: z.string().optional() }),
  draft_reply:          z.object({ id: z.string().min(1), body: z.string().min(1) }),
  snooze_email:         z.object({ id: z.string().min(1), until_iso: z.string().min(1) }),
  bulk_archive:         z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }),
  classify_unclassified:z.object({ limit: z.number().int().min(1).max(2000).optional() }),
  lane_counts:          z.object({}),
  list_pinned_artifacts:z.object({}),
  pin_artifact:         z.object({
    name: z.string().min(1),
    local_path: z.string().optional(),
    artifact_type: z.enum(["resume", "story_bank", "target_list", "constraint", "portfolio", "note"]).optional(),
    summary: z.string().optional(),
    tags: z.array(z.string()).optional(),
    is_primary: z.boolean().optional(),
  }),
  set_artifact_policy:  z.object({
    id: z.string().min(1),
    approved_for_matching: z.boolean().optional(),
    approved_for_external_research: z.boolean().optional(),
    is_primary: z.boolean().optional(),
    pinned: z.boolean().optional(),
  }),
  extract_opportunities:z.object({ email_ids: z.array(z.string().min(1)).min(1) }),
  score_opportunity:    z.object({ id: z.string().min(1) }),
  save_opportunity:     z.object({ email_id: z.string().min(1), name: z.string().min(1), est_value_usd: z.number().positive().optional(), deadline: z.string().optional() }),
  apply_opportunity:    z.object({ id: z.string().min(1) }),
  extract_jobs:         z.object({ email_ids: z.array(z.string().min(1)).min(1) }),
  save_job:             z.object({ email_id: z.string().min(1), title: z.string().min(1), company: z.string().optional() }),
  mark_applied:         z.object({ id: z.string().min(1) }),
  create_rule:          z.object({ name: z.string().min(1), description: z.string().optional(), trigger: z.string().min(1), conditions: z.string().min(1), actions: z.string().min(1) }),
  toggle_rule:          z.object({ id: z.string().min(1), enabled: z.boolean() }),
  simulate_rule:        z.object({ id: z.string().min(1), sample_size: z.number().int().min(1).max(1000).optional() }),
  list_rules:           z.object({ enabled_only: z.boolean().optional() }),
  list_runs:            z.object({ rule_id: z.string().min(1).optional(), limit: z.number().int().min(1).max(500).optional() }),
  ingest_inbox:         z.object({ max_pages: z.number().int().min(1).max(50).optional(), page_size: z.number().int().min(1).max(500).optional(), query: z.string().optional() }),
  private_context_status:z.object({}),
  list_private_context_shards:z.object({ limit: z.number().int().min(1).max(100).optional(), status: z.string().optional() }),
  list_private_identity_claims:z.object({ limit: z.number().int().min(1).max(100).optional(), topic: z.string().optional(), claim_type: z.string().optional() }),
} as const;

// ---------------------------------------------------------------------------
// Handlers — pure functions returning a JSON-able object
// ---------------------------------------------------------------------------

export type ToolResult = { ok: true; [k: string]: unknown } | { ok: false; error: string };
export type ToolHandler = (args: any) => ToolResult | Promise<ToolResult>;

export const handlers: Record<string, ToolHandler> = {
  list_lanes(args: { top?: number }) {
    const top = Math.min(args.top ?? 5, 20);
    const counts = getLaneCounts();
    const summary: Record<string, { count: number; top_cards: Array<{ id: string; from: string; subject: string; urgency: number; confidence: number }> }> = {};
    for (const lane of LANES) {
      const cards = listLaneCards(lane, top, 0);
      summary[lane] = {
        count: counts[lane] ?? 0,
        top_cards: cards.slice(0, top).map((c) => ({
          id: c.id, from: c.from_name ?? c.from_addr, subject: c.subject,
          urgency: c.urgency, confidence: c.confidence,
        })),
      };
    }
    return { ok: true, lanes: summary };
  },

  search_emails(args: { query: string; limit?: number }) {
    const limit = Math.min(args.limit ?? 10, 50);
    const rows = searchEmails(args.query, limit);
    return {
      ok: true, count: rows.length,
      results: rows.map(rowToBrief),
    };
  },

  get_email(args: { id: string }) {
    const e = getEmail(args.id);
    if (!e) return { ok: false, error: `email ${args.id} not found` };
    return {
      ok: true,
      email: {
        id: e.id, thread_id: e.thread_id,
        from: e.from_name ?? e.from_addr, from_addr: e.from_addr,
        to: e.to_addrs, subject: e.subject,
        snippet: e.snippet, body: e.body ?? e.snippet,
        date: new Date(e.internal_date * 1000).toISOString(),
        is_unread: !!e.is_unread, labels: e.labels,
        classification: e.lane ? {
          lane: e.lane, urgency: e.urgency, confidence: e.confidence,
          action: e.action, rationale: e.rationale, classifier: e.classifier,
        } : null,
      },
    };
  },

  async archive_email(args: { id: string }) {
    const e = getEmail(args.id);
    if (!e) return { ok: false, error: `email ${args.id} not found` };

    // If row is Gmail-sourced (gm_*) AND we have a connection, mirror to Gmail FIRST.
    // Per HONEST_STATUS: only mutate the local store AFTER Gmail confirms.
    let mirrored = false;
    if (e.id.startsWith("gm_") && isConnected()) {
      const gmailId = e.id.slice(3);
      const res = await archiveOnGmail({ id: gmailId });
      if (!res.ok) {
        return { ok: false, error: `Gmail archive failed: ${res.error}` };
      }
      mirrored = true;
    }

    const ok = applyArchive(args.id);
    if (!ok) return { ok: false, error: "archive failed locally" };
    recordAction(args.id, "archive", { mirrored_to_gmail: mirrored });
    return { ok: true, id: args.id, action: "archived", mirrored_to_gmail: mirrored };
  },

  label_email(args: { id: string; lane: string; reason?: string }) {
    if (!isLane(args.lane)) return { ok: false, error: `unknown lane ${args.lane}; valid=${LANES.join(",")}` };
    const e = getEmail(args.id);
    if (!e) return { ok: false, error: `email ${args.id} not found` };
    applyLabel(args.id, args.lane);
    upsertClassification({
      email_id: args.id, lane: args.lane, urgency: e.urgency ?? 0.5,
      action: "none", confidence: 1.0, model: "manual",
      rationale: args.reason ?? "manually labeled",
    });
    recordAction(args.id, "label", { lane: args.lane });
    return { ok: true, id: args.id, lane: args.lane };
  },

  draft_reply(args: { id: string; body: string }) {
    const e = getEmail(args.id);
    if (!e) return { ok: false, error: `email ${args.id} not found` };
    const action_id = recordAction(args.id, "draft_reply", { body: args.body });
    return { ok: true, id: args.id, action_id, draft_chars: args.body.length };
  },

  async snooze_email(args: { id: string; until_iso: string }) {
    const e = getEmail(args.id);
    if (!e) return { ok: false, error: `email ${args.id} not found` };
    const until = Date.parse(args.until_iso);
    if (!Number.isFinite(until)) return { ok: false, error: "invalid until_iso" };

    if (e.id.startsWith("gm_") && isConnected()) {
      const r = await markReadOnGmail({ id: e.id.slice(3) });
      if (!r.ok) return { ok: false, error: `Gmail markRead failed: ${r.error}` };
    }
    markRead(args.id);
    recordAction(args.id, "snooze", { until_iso: args.until_iso });
    return { ok: true, id: args.id, snoozed_until: new Date(until).toISOString() };
  },

  async bulk_archive(args: { ids: string[] }) {
    const connected = isConnected();
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of args.ids) {
      const e = getEmail(id);
      if (!e) { results.push({ id, ok: false, error: "not_found" }); continue; }
      let gmailOk = true;
      if (e.id.startsWith("gm_") && connected) {
        const r = await archiveOnGmail({ id: e.id.slice(3) });
        if (!r.ok) { results.push({ id, ok: false, error: r.error }); gmailOk = false; }
      }
      if (!gmailOk) continue;
      applyArchive(id);
      recordAction(id, "archive", { mirrored_to_gmail: e.id.startsWith("gm_") && connected });
      results.push({ id, ok: true });
    }
    const archived = results.filter((r) => r.ok).length;
    return { ok: true, archived, total: args.ids.length, results };
  },

  classify_unclassified(args: { limit?: number }) {
    const limit = Math.min(args.limit ?? 200, 2000);
    const unclassified = db().prepare(`
      SELECT e.* FROM emails e
      LEFT JOIN latest_classifications c ON c.email_id = e.id
      WHERE c.email_id IS NULL
      ORDER BY e.internal_date DESC LIMIT ?
    `).all(limit) as EmailRow[];

    let classified = 0, fellThrough = 0;
    for (const e of unclassified) {
      const r = heuristicClassify(e.from_addr, e.subject);
      const lane: Lane = r?.lane ?? "triage";
      const urgency = r?.urgency ?? 0.5;
      const confidence = r?.confidence ?? 0.3;
      upsertClassification({
        email_id: e.id, lane, urgency,
        action: lane === "auto_archive" ? "archive" : "none",
        confidence, model: r ? "heuristic" : "fallback_triage",
        rationale: r?.rule ?? "no rule matched",
      });
      classified++;
      if (!r) fellThrough++;
    }
    return { ok: true, classified, fell_through_to_triage: fellThrough };
  },

  lane_counts() {
    return { ok: true, counts: laneCounts() };
  },

  list_pinned_artifacts() {
    const artifacts = listPinnedArtifacts();
    return {
      ok: true,
      count: artifacts.length,
      primary: artifacts.find((artifact) => artifact.is_primary) ?? artifacts[0] ?? null,
      artifacts,
    };
  },

  pin_artifact(args: { name: string; local_path?: string; artifact_type?: any; summary?: string; tags?: string[]; is_primary?: boolean }) {
    const artifact = upsertPinnedArtifact({
      name: args.name,
      local_path: args.local_path,
      artifact_type: args.artifact_type,
      summary: args.summary,
      tags: args.tags,
      is_primary: args.is_primary,
      approved_for_matching: true,
      approved_for_external_research: false,
      visibility_policy: "local_summary_only",
    });
    return { ok: true, artifact };
  },

  set_artifact_policy(args: { id: string; approved_for_matching?: boolean; approved_for_external_research?: boolean; is_primary?: boolean; pinned?: boolean }) {
    const artifact = updatePinnedArtifactState(args.id, {
      approved_for_matching: args.approved_for_matching,
      approved_for_external_research: args.approved_for_external_research,
      visibility_policy: args.approved_for_external_research === true
        ? "approved_summary_to_nodebench"
        : args.approved_for_external_research === false
          ? "local_summary_only"
          : undefined,
      is_primary: args.is_primary,
      pinned: args.pinned,
    });
    if (!artifact) return { ok: false, error: `artifact ${args.id} not found` };
    return { ok: true, artifact };
  },

  // --- v0.2 ---

  extract_opportunities(args: { email_ids: string[] }) {
    const created: { id: string; name: string; email_id: string }[] = [];
    for (const eid of args.email_ids) {
      const e = getEmail(eid);
      if (!e) continue;
      const senderOrg = (e.from_addr.split("@")[1] || "").split(".")[0];
      const id = `opp_${eid}`;
      // Heuristic scoring: subject contains "credits", "grant", "funding", "program" → bump
      const subj = e.subject.toLowerCase();
      let score = 0.5;
      if (/credit|grant|fund|program|partnership|invest|opportunity/i.test(subj)) score = 0.75;
      if (/sequoia|y combinator|a16z|nvidia|microsoft|stripe|aws/i.test(e.subject + " " + e.from_addr)) score = 0.9;
      const valGuess = score >= 0.9 ? 150_000 : score >= 0.75 ? 50_000 : 10_000;
      insertOpportunity({
        id, email_id: eid, name: e.subject, sender_org: senderOrg,
        score, est_value_usd: valGuess, deadline: null,
        status: "new", next_action: "Review",
        source: "email_extraction",
      });
      created.push({ id, name: e.subject, email_id: eid });
    }
    return { ok: true, created: created.length, opportunities: created };
  },

  score_opportunity(args: { id: string }) {
    const o = getOpportunity(args.id);
    if (!o) return { ok: false, error: `opportunity ${args.id} not found` };
    // Re-score based on aging + status
    const ageDays = (Date.now() / 1000 - o.created_at) / 86400;
    const decay = Math.max(0, 1 - ageDays / 30);
    const newScore = Math.min(1, Math.max(0, o.score * 0.7 + decay * 0.3));
    updateOpportunityScore(args.id, newScore);
    return { ok: true, id: args.id, old_score: o.score, new_score: newScore };
  },

  save_opportunity(args: { email_id: string; name: string; est_value_usd?: number; deadline?: string }) {
    const e = getEmail(args.email_id);
    if (!e) return { ok: false, error: `email ${args.email_id} not found` };
    const id = `opp_manual_${Date.now()}`;
    const senderOrg = (e.from_addr.split("@")[1] || "").split(".")[0];
    const deadline = args.deadline ? Math.floor(Date.parse(args.deadline) / 1000) : null;
    const o = insertOpportunity({
      id, email_id: args.email_id, name: args.name, sender_org: senderOrg,
      score: 0.6, est_value_usd: args.est_value_usd ?? null, deadline,
      status: "new", next_action: "Review", source: "manual",
    });
    return { ok: true, opportunity: o };
  },

  apply_opportunity(args: { id: string }) {
    const o = getOpportunity(args.id);
    if (!o) return { ok: false, error: `opportunity ${args.id} not found` };
    updateOpportunityStatus(args.id, "proposal");
    return { ok: true, id: args.id, status: "proposal" };
  },

  extract_jobs(args: { email_ids: string[] }) {
    const created: { id: string; title: string; company: string | null }[] = [];
    for (const eid of args.email_ids) {
      const e = getEmail(eid);
      if (!e) continue;
      // Naive title extraction: first 60 chars of subject before " at "
      const subj = e.subject.split(" - ")[0].split(" at ")[0];
      const company = (e.subject.match(/\bat\s+([A-Z][\w&. ]{2,30})/) || [])[1] ?? null;
      const id = `job_${eid}`;
      // Heuristic fit: subject mentions AI/Engineer/Senior → higher
      let fit = 0.5;
      if (/ai|ml|agent|llm/i.test(e.subject)) fit = 0.75;
      if (/senior|staff|principal|lead/i.test(e.subject)) fit = Math.min(1, fit + 0.1);
      insertJob({
        id, email_id: eid, company,
        title: subj.length > 80 ? subj.slice(0, 80) : subj,
        location: "Remote", comp_low: null, comp_high: null,
        fit_score: fit, status: "new",
        source: e.from_addr, next_step: "Review & Save",
      });
      created.push({ id, title: subj, company });
    }
    return { ok: true, created: created.length, jobs: created };
  },

  save_job(args: { email_id: string; title: string; company?: string }) {
    const e = getEmail(args.email_id);
    if (!e) return { ok: false, error: `email ${args.email_id} not found` };
    const id = `job_manual_${Date.now()}`;
    const j = insertJob({
      id, email_id: args.email_id,
      company: args.company ?? null, title: args.title,
      location: null, comp_low: null, comp_high: null,
      fit_score: 0.6, status: "saved",
      source: e.from_addr, next_step: "Customize & Apply",
    });
    return { ok: true, job: j };
  },

  mark_applied(args: { id: string }) {
    const ok = updateJobStatus(args.id, "applied");
    if (!ok) return { ok: false, error: `job ${args.id} not found` };
    return { ok: true, id: args.id, status: "applied" };
  },

  create_rule(args: { name: string; description?: string; trigger: string; conditions: string; actions: string }) {
    const id = `rule_${Date.now()}`;
    // Validate JSON shape
    try { JSON.parse(args.conditions); JSON.parse(args.actions); }
    catch (e) { return { ok: false, error: `invalid JSON in conditions/actions: ${e instanceof Error ? e.message : String(e)}` }; }
    const r = insertRule({
      id, name: args.name, description: args.description ?? null,
      trigger: args.trigger, conditions: args.conditions, actions: args.actions,
      enabled: 1, model_routing: null,
    });
    return { ok: true, rule: r };
  },

  toggle_rule(args: { id: string; enabled: boolean }) {
    const ok = setRuleEnabled(args.id, args.enabled);
    if (!ok) return { ok: false, error: `rule ${args.id} not found` };
    return { ok: true, id: args.id, enabled: args.enabled };
  },

  simulate_rule(args: { id: string; sample_size?: number }) {
    const r = getRule(args.id);
    if (!r) return { ok: false, error: `rule ${args.id} not found` };
    const sampleSize = Math.min(args.sample_size ?? 100, 1000);
    // Naive simulation: count emails matching trigger=new_email + any conditions referencing fields
    let matched = 0;
    const sample = db().prepare(`SELECT * FROM emails ORDER BY internal_date DESC LIMIT ?`).all(sampleSize) as EmailRow[];
    for (const e of sample) {
      try {
        const conds = JSON.parse(r.conditions) as Array<{ field: string; op: string; value: string }>;
        const ok = conds.every((c) => {
          const v = (e as any)[c.field];
          if (typeof v !== "string") return false;
          if (c.op === "contains") return v.toLowerCase().includes(c.value.toLowerCase());
          if (c.op === "equals") return v === c.value;
          return false;
        });
        if (ok) matched++;
      } catch {}
    }
    return { ok: true, rule_id: args.id, sample_size: sampleSize, matched, match_rate: matched / sampleSize };
  },

  list_rules(args: { enabled_only?: boolean }) {
    return { ok: true, rules: listRules(args.enabled_only ?? false) };
  },

  list_runs(args: { rule_id?: string; limit?: number }) {
    return { ok: true, runs: listRuleRuns(args.rule_id, args.limit ?? 50) };
  },

  async ingest_inbox(args: { max_pages?: number; page_size?: number; query?: string }) {
    if (!isConnected()) return { ok: false, error: "no Gmail account connected — open /settings → Connect Gmail" };
    try {
      const r = await ingestInbox({ maxPages: args.max_pages ?? 5, pageSize: args.page_size, query: args.query });
      const { ok: _ok, ...rest } = r;
      return { ok: true, ...rest };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  private_context_status() {
    return { ok: true, status: privateContextStatus() };
  },

  list_private_context_shards(args: { limit?: number; status?: string }) {
    const shards = listPrivateContextShards(args.limit ?? 20, args.status);
    return {
      ok: true,
      count: shards.length,
      shards: shards.map((shard) => ({
        id: shard.id,
        shard_key: shard.shard_key,
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
        status: shard.status,
        confidence: shard.confidence,
        evidence_email_ids: JSON.parse(shard.evidence_email_ids_json || "[]"),
        aggregate: JSON.parse(shard.aggregate_json || "{}"),
      })),
    };
  },

  list_private_identity_claims(args: { limit?: number; topic?: string; claim_type?: string }) {
    const claims = listPrivateIdentityClaims({
      limit: args.limit ?? 20,
      topic: args.topic,
      claimType: args.claim_type,
    });
    return {
      ok: true,
      count: claims.length,
      claims: claims.map((claim) => ({
        id: claim.id,
        claim_type: claim.claim_type,
        topic: claim.topic,
        claim_text: claim.claim_text,
        time_range: JSON.parse(claim.time_range || "{}"),
        confidence: claim.confidence,
        judge_status: claim.judge_status,
        model: claim.model,
        private_boundary: claim.private_boundary,
        evidence_shard_ids: JSON.parse(claim.evidence_shard_ids_json || "[]"),
        evidence_email_ids: JSON.parse(claim.evidence_email_ids_json || "[]"),
        aggregate: JSON.parse(claim.aggregate_json || "{}"),
      })),
    };
  },
};
function rowToBrief(e: EmailRow) {
  return {
    id: e.id,
    from: e.from_name ?? e.from_addr,
    subject: e.subject,
    snippet: e.snippet.slice(0, 160),
    date: new Date(e.internal_date * 1000).toISOString(),
    is_unread: !!e.is_unread,
  };
}

export type ToolName = keyof typeof handlers;

export async function callTool(name: string, args: unknown): Promise<ToolResult> {
  const h = handlers[name];
  if (!h) return { ok: false, error: `unknown tool ${name}` };
  if ((name === "archive_email" || name === "bulk_archive") && !(args as any)?.__approved) {
    return {
      ok: false,
      error: "approval required before applying archive action",
      requires_approval: true,
      tool: name,
    } as ToolResult;
  }
  const schema = (ZodSchemas as Record<string, z.ZodTypeAny>)[name];
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) {
    return { ok: false, error: `invalid args: ${parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}` };
  }
  try {
    const out = h(parsed.data);
    return out instanceof Promise ? await out : out;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
