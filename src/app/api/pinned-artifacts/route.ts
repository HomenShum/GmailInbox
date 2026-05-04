import { NextResponse } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getPinnedContextSummary,
  updatePinnedArtifactDetails,
  updatePinnedArtifactState,
  upsertPinnedArtifact,
} from "@/lib/pinned-artifacts";
import type { PinnedArtifactType, PinnedArtifactVisibility } from "@/lib/pinned-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getPinnedContextSummary());
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return handleMultipartPost(req);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  }

  const artifact = upsertPinnedArtifact({
    name: body.name,
    artifact_type: normalizeArtifactType(body.artifact_type),
    local_path: typeof body.local_path === "string" ? body.local_path : null,
    summary: typeof body.summary === "string" ? body.summary : null,
    tags: normalizeTags(body.tags),
    visibility_policy: normalizeVisibility(body.visibility_policy),
    approved_for_matching: body.approved_for_matching !== false,
    approved_for_external_research: body.approved_for_external_research === true,
    pinned: body.pinned !== false,
    is_primary: body.is_primary === true,
  });

  return NextResponse.json({ ok: true, artifact, context: getPinnedContextSummary() });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  }

  let artifact = updatePinnedArtifactState(body.id, {
    pinned: typeof body.pinned === "boolean" ? body.pinned : undefined,
    is_primary: typeof body.is_primary === "boolean" ? body.is_primary : undefined,
    approved_for_matching: typeof body.approved_for_matching === "boolean" ? body.approved_for_matching : undefined,
    approved_for_external_research: typeof body.approved_for_external_research === "boolean" ? body.approved_for_external_research : undefined,
    visibility_policy: normalizeVisibility(body.visibility_policy, true),
  });

  if (artifact && hasDetailPatch(body)) {
    artifact = updatePinnedArtifactDetails(body.id, {
      name: typeof body.name === "string" ? body.name : undefined,
      artifact_type: typeof body.artifact_type === "string" ? normalizeArtifactType(body.artifact_type) : undefined,
      local_path: typeof body.local_path === "string" ? body.local_path : undefined,
      summary: typeof body.summary === "string" ? body.summary : undefined,
      tags: body.tags === undefined ? undefined : normalizeTags(body.tags),
    });
  }

  if (!artifact) {
    return NextResponse.json({ ok: false, error: "artifact not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, artifact, context: getPinnedContextSummary() });
}

async function handleMultipartPost(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ ok: false, error: "file is empty" }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "file is larger than 25 MB" }, { status: 400 });
  }

  const uploadDir = path.resolve(process.cwd(), "src/data/artifacts");
  await fs.mkdir(uploadDir, { recursive: true });

  const originalName = sanitizeFileName(file.name || "artifact");
  const storedName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${originalName}`;
  const storedPath = path.join(uploadDir, storedName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(storedPath, buffer);

  const artifact = upsertPinnedArtifact({
    name: stringFormValue(form.get("name")) || labelFromFileName(originalName),
    artifact_type: normalizeArtifactType(stringFormValue(form.get("artifact_type")) ?? inferArtifactType(originalName)),
    local_path: storedPath.replaceAll("\\", "/"),
    source: "uploaded_file",
    summary: stringFormValue(form.get("summary")) || `Uploaded local file ${originalName}.`,
    tags: normalizeTags(stringFormValue(form.get("tags")) ?? ["uploaded"]),
    visibility_policy: normalizeVisibility(stringFormValue(form.get("visibility_policy"))),
    approved_for_matching: stringFormValue(form.get("approved_for_matching")) !== "false",
    approved_for_external_research: stringFormValue(form.get("approved_for_external_research")) === "true",
    pinned: true,
    is_primary: stringFormValue(form.get("is_primary")) === "true",
  });

  return NextResponse.json({ ok: true, artifact, context: getPinnedContextSummary() });
}

function normalizeArtifactType(value: unknown): PinnedArtifactType {
  const allowed = new Set<PinnedArtifactType>(["resume", "story_bank", "target_list", "constraint", "portfolio", "note"]);
  return typeof value === "string" && allowed.has(value as PinnedArtifactType) ? value as PinnedArtifactType : "resume";
}

function normalizeVisibility(value: unknown, optional?: false): PinnedArtifactVisibility;
function normalizeVisibility(value: unknown, optional: true): PinnedArtifactVisibility | undefined;
function normalizeVisibility(value: unknown, optional = false) {
  const allowed = new Set<PinnedArtifactVisibility>([
    "local_only",
    "local_summary_only",
    "approved_summary_to_nodebench",
    "approved_full_text",
  ]);
  if (typeof value === "string" && allowed.has(value as PinnedArtifactVisibility)) return value;
  return optional ? undefined : "local_summary_only";
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((tag): tag is string => typeof tag === "string");
  if (typeof value === "string") return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  return [];
}

function hasDetailPatch(body: Record<string, unknown>) {
  return ["name", "artifact_type", "local_path", "summary", "tags"].some((key) => key in body);
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "artifact";
}

function labelFromFileName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Pinned artifact";
}

function inferArtifactType(name: string): PinnedArtifactType {
  const lower = name.toLowerCase();
  if (lower.includes("resume") || lower.endsWith(".pdf")) return "resume";
  if (lower.includes("portfolio")) return "portfolio";
  if (lower.includes("target")) return "target_list";
  return "note";
}

function stringFormValue(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
