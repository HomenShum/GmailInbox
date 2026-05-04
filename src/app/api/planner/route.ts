import { nowMs, timedJson } from "@/lib/api-response";
import { deletePlannerTodo, setPlannerTodoStatus, upsertPlannerOverride, upsertPlannerTodo } from "@/lib/db";
import { clearOperatingSummaryCache } from "@/lib/operating-system";
import { getPlannerReadModel } from "@/lib/read-models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const startedAt = nowMs();
  const force = new URL(req.url).searchParams.get("refresh") === "1";
  const result = getPlannerReadModel(force);
  return timedJson(result.value, startedAt, { metric: "planner", cacheStatus: result.cacheStatus });
}

export async function POST(req: Request) {
  const startedAt = nowMs();
  const body = await req.json().catch(() => ({}));
  if (typeof body.title !== "string" || !body.title.trim()) {
    return timedJson({ ok: false, error: "Expected todo title" }, startedAt, { metric: "planner", cacheStatus: "none" });
  }
  const todo = upsertPlannerTodo({
    title: body.title.trim(),
    status: body.status === "done" ? "done" : "open",
    source: typeof body.source === "string" ? body.source : "manual",
    linked_email_id: typeof body.linkedEmailId === "string" ? body.linkedEmailId : null,
  });
  clearOperatingSummaryCache("planner");
  return timedJson({ ok: true, todo }, startedAt, { metric: "planner", cacheStatus: "none" });
}

export async function PATCH(req: Request) {
  const startedAt = nowMs();
  const body = await req.json().catch(() => ({}));

  if (body.kind === "todo") {
    if (typeof body.id !== "string") {
      return timedJson({ ok: false, error: "Expected todo id" }, startedAt, { metric: "planner", cacheStatus: "none" });
    }
    const ok = setPlannerTodoStatus(body.id, body.status === "done" ? "done" : "open");
    clearOperatingSummaryCache("planner");
    return timedJson({ ok }, startedAt, { metric: "planner", cacheStatus: "none" });
  }

  if (typeof body.id !== "string") {
    return timedJson({ ok: false, error: "Expected milestone id" }, startedAt, { metric: "planner", cacheStatus: "none" });
  }
  const override = upsertPlannerOverride({
    id: body.id,
    title: typeof body.title === "string" ? body.title : undefined,
    status: isPlannerStatus(body.status) ? body.status : undefined,
    progress: typeof body.progress === "number" ? body.progress : undefined,
    date_label: typeof body.dateLabel === "string" ? body.dateLabel : undefined,
  });
  clearOperatingSummaryCache("planner");
  return timedJson({ ok: true, override }, startedAt, { metric: "planner", cacheStatus: "none" });
}

export async function DELETE(req: Request) {
  const startedAt = nowMs();
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string") {
    return timedJson({ ok: false, error: "Expected todo id" }, startedAt, { metric: "planner", cacheStatus: "none" });
  }
  const ok = deletePlannerTodo(body.id);
  clearOperatingSummaryCache("planner");
  return timedJson({ ok }, startedAt, { metric: "planner", cacheStatus: "none" });
}

function isPlannerStatus(value: unknown): value is "completed" | "in_progress" | "planned" | "at_risk" {
  return value === "completed" || value === "in_progress" || value === "planned" || value === "at_risk";
}
