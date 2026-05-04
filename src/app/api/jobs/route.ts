import { NextResponse } from "next/server";
import { listJobs, jobCounts } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const items = listJobs(status);
  const counts = jobCounts();
  return NextResponse.json({ items, counts });
}
