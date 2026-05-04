import { nowMs, timedJson } from "@/lib/api-response";
import { getBriefingReadModel } from "@/lib/read-models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const startedAt = nowMs();
  const force = new URL(req.url).searchParams.get("refresh") === "1";
  const result = getBriefingReadModel(force);
  return timedJson(result.value, startedAt, { metric: "briefings", cacheStatus: result.cacheStatus });
}
