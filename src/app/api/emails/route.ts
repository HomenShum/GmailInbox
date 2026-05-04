import { NextResponse } from "next/server";
import { laneCounts, listLaneCards, listTopLanes } from "@/lib/db";
import { isLane } from "@/lib/lanes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const includeLanes = url.searchParams.get("include_lanes") === "1";
  const lane = url.searchParams.get("lane");
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const counts = laneCounts();
  if (lane && isLane(lane)) {
    return NextResponse.json({
      counts,
      lane,
      cards: listLaneCards(lane, limit, offset),
      total: counts[lane] ?? 0,
      limit: Math.max(1, Math.min(limit, 200)),
      offset: Math.max(0, offset),
    });
  }
  if (includeLanes) {
    return NextResponse.json({ lanes: listTopLanes(Number(url.searchParams.get("top") ?? "10")), counts });
  }
  return NextResponse.json({ counts });
}
