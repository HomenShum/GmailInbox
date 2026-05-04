import { NextResponse } from "next/server";
import { getEmail, getJobResearchContext } from "@/lib/db";
import { buildResearchView, runNodeBenchJobResearch } from "@/lib/nodebench/job-research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const emailId = url.searchParams.get("email_id");
  if (!emailId) {
    return NextResponse.json({ ok: false, error: "email_id is required" }, { status: 400 });
  }

  const email = getEmail(emailId);
  if (!email) {
    return NextResponse.json({ ok: false, error: "email not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, research: buildResearchView(email, getJobResearchContext(email.id)) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.email_id !== "string") {
    return NextResponse.json({ ok: false, error: "email_id is required" }, { status: 400 });
  }

  try {
    const research = await runNodeBenchJobResearch(body.email_id);
    return NextResponse.json({ ok: true, research });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 404 });
  }
}
