import { nowMs, timedJson } from "@/lib/api-response";
import { dashboardMetrics, listTopLanes, laneCounts, reviewQueueSummary } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = nowMs();
  const metrics = dashboardMetrics();
  const lanes = listTopLanes(10);
  const counts = laneCounts();
  const reviewQueues = reviewQueueSummary();
  return timedJson({ metrics, lanes, counts, reviewQueues }, startedAt, { metric: "dashboard", cacheStatus: "none" });
}
