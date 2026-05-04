import { NextResponse } from "next/server";
import { resolveModel, hasAnyKey, FREE_LADDER, PAID_LADDER } from "@/lib/models";
import { getWorkspaceSettings, setWorkspaceSettings } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = resolveModel();
  const settings = getWorkspaceSettings();
  return NextResponse.json({
    current: { provider: cfg.provider, model: cfg.model, keyVar: cfg.apiKeyVar },
    hasKey: hasAnyKey(),
    settings,
    free: FREE_LADDER,
    paid: PAID_LADDER,
  });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if (body.account && typeof body.account === "object") {
    updates.account = {
      displayName: String(body.account.displayName ?? ""),
      email: String(body.account.email ?? ""),
      timezone: String(body.account.timezone ?? "America/Los_Angeles"),
      language: String(body.account.language ?? "English"),
    };
  }

  if (body.model && typeof body.model === "object") {
    updates.model = {
      provider: String(body.model.provider ?? "openrouter"),
      model: String(body.model.model ?? ""),
    };
  }

  if (body.privacy && typeof body.privacy === "object") {
    updates.privacy = {
      storeEmailContent: body.privacy.storeEmailContent ?? body.privacy.storeEmailContentLocally ?? true,
      modelImprovement: body.privacy.modelImprovement ?? body.privacy.shareDataForModelImprovement ?? false,
      autoDeleteAfterYear: body.privacy.autoDeleteAfterYear ?? body.privacy.autoDeleteAfterOneYear ?? false,
      approvalRequired: body.privacy.approvalRequired ?? true,
    };
  }

  if (body.workspace && typeof body.workspace === "object") {
    updates.workspace = {
      density: String(body.workspace.density ?? "compact"),
      appearance: String(body.workspace.appearance ?? "light"),
    };
  }

  const settings = setWorkspaceSettings(updates);
  const cfg = resolveModel();
  return NextResponse.json({
    ok: true,
    current: { provider: cfg.provider, model: cfg.model, keyVar: cfg.apiKeyVar },
    hasKey: hasAnyKey(),
    settings,
  });
}
