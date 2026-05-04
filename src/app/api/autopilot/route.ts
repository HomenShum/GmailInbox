import { NextResponse } from "next/server";
import { autopilotStatus, runAutopilot, type AutopilotMode } from "@/lib/autopilot/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(autopilotStatus());
}

export async function POST(req: Request) {
  let body: { mode?: AutopilotMode; trigger?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const result = await runAutopilot({
    mode: body.mode === "suggest" ? "suggest" : "local",
    trigger: body.trigger ?? "manual",
  });

  return NextResponse.json(result, { status: result.errors.length ? 500 : 200 });
}
