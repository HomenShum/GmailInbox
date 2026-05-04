import { NextResponse } from "next/server";
import { listRules, listRuleRuns, setRuleEnabled } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const enabledOnly = url.searchParams.get("enabled") === "true";
  const rules = listRules(enabledOnly);
  const runs = listRuleRuns(undefined, 20);
  return NextResponse.json({ rules, runs });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string" || typeof body.enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "Expected { id, enabled }" }, { status: 400 });
  }
  const ok = setRuleEnabled(body.id, body.enabled);
  return NextResponse.json({ ok, rules: listRules(false), runs: listRuleRuns(undefined, 20) }, { status: ok ? 200 : 404 });
}
