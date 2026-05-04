import { NextResponse } from "next/server";
import { buildCareerFitSummary } from "@/lib/career-fit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "30");
  return NextResponse.json(buildCareerFitSummary(limit), {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
