import { NextResponse } from "next/server";
import { analyticsSummary } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "30");
  return NextResponse.json(analyticsSummary(days));
}
