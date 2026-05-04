import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, invalidateReadModels } from "./db";
import type {
  PinnedArtifactPreview,
  PinnedArtifactType,
  PinnedArtifactView,
  PinnedArtifactVisibility,
  PinnedContextSummary,
} from "./pinned-types";

type PinnedArtifactRow = {
  id: string;
  name: string;
  artifact_type: PinnedArtifactType;
  local_path: string | null;
  source: string;
  summary: string | null;
  preview_json: string | null;
  tags: string | null;
  visibility_policy: PinnedArtifactVisibility;
  approved_for_matching: number;
  approved_for_external_research: number;
  pinned: number;
  is_primary: number;
  created_at: number;
  updated_at: number;
};

export type UpsertPinnedArtifactInput = {
  id?: string;
  name: string;
  artifact_type?: PinnedArtifactType;
  local_path?: string | null;
  source?: string;
  summary?: string | null;
  preview?: Partial<PinnedArtifactPreview> | null;
  tags?: string[];
  visibility_policy?: PinnedArtifactVisibility;
  approved_for_matching?: boolean;
  approved_for_external_research?: boolean;
  pinned?: boolean;
  is_primary?: boolean;
};

const DEFAULT_RESUME_PATHS = [
  {
    id: "artifact_resume_primary",
    name: process.env.GMAIL_WORKSPACE_PRIMARY_RESUME_NAME ?? "Primary Resume",
    local_path: process.env.GMAIL_WORKSPACE_PRIMARY_RESUME_PATH ?? null,
    summary: "Primary matching lens for software, FDE, and agentic workflow roles.",
    tags: ["resume", "fde", "career", "matching"],
    is_primary: true,
    preview: {
      headline: "Primary career matching context",
      bullets: [
        "Use this resume first when ranking job alerts and recruiter threads.",
        "Good for role fit, interview prep, and concise recruiter replies.",
        "Raw PDF remains local unless a future explicit approval allows export.",
      ],
      signals: ["Full-stack engineering", "Agentic workflow systems", "Research pipelines", "Product execution"],
      agentUses: ["Score job fit", "Prepare interview packets", "Draft recruiter replies", "Plan follow-up blocks"],
      safety: "Local summary only. Not approved for external research upload.",
    },
  },
  {
    id: "artifact_resume_broad",
    name: process.env.GMAIL_WORKSPACE_BROAD_RESUME_NAME ?? "Broad Resume",
    local_path: process.env.GMAIL_WORKSPACE_BROAD_RESUME_PATH ?? null,
    summary: "Broader career artifact for finance, product, automation, and AI workflow context.",
    tags: ["resume", "full", "career", "background"],
    is_primary: false,
    preview: {
      headline: "Broad career context",
      bullets: [
        "Use when an opportunity needs the fuller finance, operations, and product story.",
        "Helps the agent connect inbox items to interview stories and background themes.",
        "Raw PDF remains local unless a future explicit approval allows export.",
      ],
      signals: ["Finance workflow knowledge", "Automation", "Agentic systems", "Operator-builder narrative"],
      agentUses: ["Build story bank", "Compare opportunity themes", "Generate interview walkthrough notes"],
      safety: "Local summary only. Not approved for external research upload.",
    },
  },
] satisfies Array<UpsertPinnedArtifactInput & { id: string; local_path: string | null; preview: PinnedArtifactPreview }>;

export function listPinnedArtifacts(options: { includeHidden?: boolean } = {}): PinnedArtifactView[] {
  ensureDefaultPinnedArtifacts();
  const rows = db().prepare(`
    SELECT *
    FROM pinned_artifacts
    ${options.includeHidden ? "" : "WHERE pinned = 1"}
    ORDER BY is_primary DESC, pinned DESC, updated_at DESC, name ASC
  `).all() as PinnedArtifactRow[];
  return rows.map(toView);
}

export function getPinnedContextSummary(): PinnedContextSummary {
  const artifacts = listPinnedArtifacts();
  return {
    artifacts,
    primary: artifacts.find((artifact) => artifact.is_primary) ?? artifacts[0] ?? null,
    count: artifacts.length,
    matchingCount: artifacts.filter((artifact) => artifact.approved_for_matching).length,
    externalResearchCount: artifacts.filter((artifact) => artifact.approved_for_external_research).length,
  };
}

export function upsertPinnedArtifact(input: UpsertPinnedArtifactInput): PinnedArtifactView {
  const localPath = normalizeLocalPath(input.local_path);
  const id = input.id ?? artifactId(input.name, localPath);
  const preview = buildPreview(input);
  const tags = normalizeTags(input.tags);

  db().prepare(`
    INSERT INTO pinned_artifacts (
      id, name, artifact_type, local_path, source, summary, preview_json, tags,
      visibility_policy, approved_for_matching, approved_for_external_research,
      pinned, is_primary
    )
    VALUES (
      @id, @name, @artifact_type, @local_path, @source, @summary, @preview_json, @tags,
      @visibility_policy, @approved_for_matching, @approved_for_external_research,
      @pinned, @is_primary
    )
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      artifact_type=excluded.artifact_type,
      local_path=excluded.local_path,
      source=excluded.source,
      summary=excluded.summary,
      preview_json=excluded.preview_json,
      tags=excluded.tags,
      visibility_policy=excluded.visibility_policy,
      approved_for_matching=excluded.approved_for_matching,
      approved_for_external_research=excluded.approved_for_external_research,
      pinned=excluded.pinned,
      is_primary=excluded.is_primary,
      updated_at=unixepoch()
  `).run({
    id,
    name: input.name.trim(),
    artifact_type: input.artifact_type ?? "resume",
    local_path: localPath,
    source: input.source ?? "local_path",
    summary: input.summary?.trim() || null,
    preview_json: JSON.stringify(preview),
    tags: JSON.stringify(tags),
    visibility_policy: input.visibility_policy ?? "local_summary_only",
    approved_for_matching: boolToInt(input.approved_for_matching ?? true),
    approved_for_external_research: boolToInt(input.approved_for_external_research ?? false),
    pinned: boolToInt(input.pinned ?? true),
    is_primary: boolToInt(input.is_primary ?? false),
  });

  if (input.is_primary) {
    db().prepare(`UPDATE pinned_artifacts SET is_primary = 0 WHERE id != ?`).run(id);
  }

  invalidatePinnedContext();
  return getPinnedArtifact(id)!;
}

export function updatePinnedArtifactState(
  id: string,
  changes: Partial<Pick<PinnedArtifactView,
    "pinned" | "is_primary" | "approved_for_matching" | "approved_for_external_research" | "visibility_policy"
  >>,
): PinnedArtifactView | null {
  const current = getPinnedArtifact(id);
  if (!current) return null;

  db().prepare(`
    UPDATE pinned_artifacts
    SET pinned = ?,
        is_primary = ?,
        approved_for_matching = ?,
        approved_for_external_research = ?,
        visibility_policy = ?,
        updated_at = unixepoch()
    WHERE id = ?
  `).run(
    boolToInt(changes.pinned ?? current.pinned),
    boolToInt(changes.is_primary ?? current.is_primary),
    boolToInt(changes.approved_for_matching ?? current.approved_for_matching),
    boolToInt(changes.approved_for_external_research ?? current.approved_for_external_research),
    changes.visibility_policy ?? current.visibility_policy,
    id,
  );

  if (changes.is_primary) {
    db().prepare(`UPDATE pinned_artifacts SET is_primary = 0 WHERE id != ?`).run(id);
  }

  invalidatePinnedContext();
  return getPinnedArtifact(id);
}

export function updatePinnedArtifactDetails(
  id: string,
  changes: Partial<Pick<PinnedArtifactView, "name" | "artifact_type" | "local_path" | "summary" | "tags">>,
): PinnedArtifactView | null {
  const current = getPinnedArtifact(id);
  if (!current) return null;
  return upsertPinnedArtifact({
    id,
    name: changes.name?.trim() || current.name,
    artifact_type: changes.artifact_type ?? current.artifact_type,
    local_path: changes.local_path === undefined ? current.local_path : changes.local_path,
    source: current.source,
    summary: changes.summary === undefined ? current.summary : changes.summary,
    tags: changes.tags ?? current.tags,
    visibility_policy: current.visibility_policy,
    approved_for_matching: current.approved_for_matching,
    approved_for_external_research: current.approved_for_external_research,
    pinned: current.pinned,
    is_primary: current.is_primary,
  });
}

export function getPinnedArtifact(id: string): PinnedArtifactView | null {
  ensureDefaultPinnedArtifacts();
  const row = db().prepare(`SELECT * FROM pinned_artifacts WHERE id = ? LIMIT 1`).get(id) as PinnedArtifactRow | undefined;
  return row ? toView(row) : null;
}

function ensureDefaultPinnedArtifacts() {
  const count = (db().prepare(`SELECT COUNT(*) AS n FROM pinned_artifacts`).get() as { n: number }).n;
  if (count > 0) return;
  for (const artifact of DEFAULT_RESUME_PATHS) {
    upsertPinnedArtifact({
      ...artifact,
      artifact_type: "resume",
      visibility_policy: "local_summary_only",
      approved_for_matching: true,
      approved_for_external_research: false,
      pinned: true,
    });
  }
}

function toView(row: PinnedArtifactRow): PinnedArtifactView {
  const preview = parseJson<PinnedArtifactPreview>(row.preview_json) ?? buildPreview({
    name: row.name,
    summary: row.summary,
    tags: parseTags(row.tags),
    approved_for_external_research: row.approved_for_external_research === 1,
  });

  return {
    id: row.id,
    name: row.name,
    artifact_type: row.artifact_type,
    local_path: row.local_path,
    file_name: row.local_path ? path.win32.basename(row.local_path) : null,
    source: row.source,
    summary: row.summary,
    preview,
    tags: parseTags(row.tags),
    visibility_policy: row.visibility_policy,
    approved_for_matching: row.approved_for_matching === 1,
    approved_for_external_research: row.approved_for_external_research === 1,
    pinned: row.pinned === 1,
    is_primary: row.is_primary === 1,
    exists: row.local_path ? fs.existsSync(row.local_path) : false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildPreview(input: UpsertPinnedArtifactInput): PinnedArtifactPreview {
  const base = input.preview ?? {};
  const tags = normalizeTags(input.tags);
  const external = input.approved_for_external_research === true;
  return {
    headline: base.headline ?? input.summary ?? `${input.name} is pinned for workspace context.`,
    bullets: base.bullets ?? [
      input.summary ?? "Pinned artifact available to the local workspace agent.",
      "Use this for matching, briefing, and planning decisions where relevant.",
    ],
    signals: base.signals ?? tags.slice(0, 6),
    agentUses: base.agentUses ?? ["Match opportunities", "Draft context-aware replies", "Prepare briefings"],
    safety: base.safety ?? (external
      ? "Approved for external research summaries. Review before sharing raw contents."
      : "Local summary only. Raw contents are not sent externally."),
    needsExtraction: base.needsExtraction ?? false,
  };
}

function normalizeLocalPath(localPath: string | null | undefined) {
  const trimmed = localPath?.trim();
  return trimmed ? trimmed.replaceAll("\\", "/") : null;
}

function artifactId(name: string, localPath: string | null) {
  const basis = `${localPath ?? name}`.toLowerCase();
  return `artifact_${crypto.createHash("sha1").update(basis).digest("hex").slice(0, 16)}`;
}

function normalizeTags(tags: string[] | undefined) {
  return [...new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

function parseTags(raw: string | null) {
  const parsed = parseJson<string[]>(raw);
  return Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === "string") : [];
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function boolToInt(value: boolean) {
  return value ? 1 : 0;
}

function invalidatePinnedContext() {
  invalidateReadModels(["pulse:v1", "briefings:v1", "planner:v1"]);
}
