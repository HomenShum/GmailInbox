import { NextResponse } from "next/server";
import { getApprovalRequest, listApprovalRequests, updateApprovalRequest } from "@/lib/db";
import { callTool } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "pending";
  const limit = Number(url.searchParams.get("limit") ?? "50");
  return NextResponse.json({ approvals: listApprovalRequests(status, limit) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  const decision = body?.decision;
  if (!Number.isFinite(id) || !["approve", "reject"].includes(decision)) {
    return NextResponse.json({ ok: false, error: "expected { id, decision: 'approve' | 'reject' }" }, { status: 400 });
  }

  const approval = getApprovalRequest(id);
  if (!approval) return NextResponse.json({ ok: false, error: "approval not found" }, { status: 404 });
  if (approval.status !== "pending") {
    return NextResponse.json({ ok: false, error: `approval already ${approval.status}` }, { status: 409 });
  }

  if (decision === "reject") {
    updateApprovalRequest(id, "rejected", { rejected: true });
    return NextResponse.json({ ok: true, approval: getApprovalRequest(id) });
  }

  updateApprovalRequest(id, "approved", { approved: true });
  const args = { ...JSON.parse(approval.args), __approved: true };
  const result = await callTool(approval.tool, args);
  updateApprovalRequest(id, result.ok ? "applied" : "failed", result);
  return NextResponse.json({ ok: result.ok, result, approval: getApprovalRequest(id) }, { status: result.ok ? 200 : 400 });
}
