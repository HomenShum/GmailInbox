import { nowMs, timedJson } from "@/lib/api-response";
import { listEmailsForInbox } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const startedAt = nowMs();
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") ?? "all";
  const limit = Number(url.searchParams.get("limit") ?? "100");
  const query = url.searchParams.get("q") ?? undefined;
  const tabs = url.searchParams.get("tabs");

  if (tabs && !query) {
    const ids = tabs.split(",").map((id) => id.trim()).filter(Boolean).slice(0, 10);
    const hydrated = Object.fromEntries(
      ids.map((id) => [id, listEmailsForInbox({ tab: id, limit })]),
    );
    return timedJson({ tabs: hydrated }, startedAt, { metric: "inbox", cacheStatus: "none" });
  }

  const rows = listEmailsForInbox({ tab, limit, query });
  return timedJson({ threads: rows }, startedAt, { metric: "inbox", cacheStatus: "none" });
}
