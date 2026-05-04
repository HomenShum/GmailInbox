import { nowMs, timedJson } from "@/lib/api-response";
import { upsertCalendarOverride } from "@/lib/db";
import { getCalendarReadModel } from "@/lib/read-models";
import { buildCalendarSummary, clearOperatingSummaryCache, type CalendarBlockType } from "@/lib/operating-system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const startedAt = nowMs();
  const url = new URL(req.url);
  const force = url.searchParams.get("refresh") === "1";
  const anchorDate = url.searchParams.get("date") ?? undefined;
  const typeParam = url.searchParams.get("type") ?? "all";
  const type = isCalendarType(typeParam) ? typeParam : "all";
  if (anchorDate || type !== "all") {
    return timedJson(buildCalendarSummary({ anchorDate, type }), startedAt, { metric: "calendar", cacheStatus: "none" });
  }
  const result = getCalendarReadModel(force);
  return timedJson(result.value, startedAt, { metric: "calendar", cacheStatus: result.cacheStatus });
}

export async function PATCH(req: Request) {
  const startedAt = nowMs();
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string") {
    return timedJson({ ok: false, error: "Expected calendar block id" }, startedAt, { metric: "calendar", cacheStatus: "none" });
  }
  const status = body.status === "dismissed" ? "dismissed" : "scheduled";
  const row = upsertCalendarOverride({
    id: body.id,
    email_id: typeof body.emailId === "string" ? body.emailId : undefined,
    title: typeof body.title === "string" ? body.title : undefined,
    date: typeof body.date === "string" ? body.date : undefined,
    start_hour: typeof body.startHour === "number" ? body.startHour : undefined,
    duration_hours: typeof body.durationHours === "number" ? body.durationHours : undefined,
    type: isPersistedCalendarType(body.type) ? body.type : undefined,
    status,
  });
  clearOperatingSummaryCache("calendar");
  return timedJson({ ok: true, override: row }, startedAt, { metric: "calendar", cacheStatus: "none" });
}

function isCalendarType(value: unknown): value is CalendarBlockType | "all" {
  return value === "all" || value === "scheduling" || value === "deadline" || value === "follow_up" || value === "review" || value === "admin";
}

function isPersistedCalendarType(value: unknown): value is CalendarBlockType {
  return value === "scheduling" || value === "deadline" || value === "follow_up" || value === "review" || value === "admin";
}
