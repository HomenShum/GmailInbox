import { NextResponse } from "next/server";
import { listOpportunities, opportunityCounts } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const items = listOpportunities(status);
  const counts = opportunityCounts();
  return NextResponse.json({ items, counts });
}
