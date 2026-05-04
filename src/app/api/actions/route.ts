import { NextResponse } from "next/server";
import { createApprovalRequest, getEmail } from "@/lib/db";
import { callTool } from "@/lib/tools";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body || typeof body.tool !== "string") {
    return NextResponse.json({ ok: false, error: "missing tool" }, { status: 400 });
  }
  if (requiresApproval(body.tool) && body.approved !== true) {
    const approval = createApprovalRequest(describeApproval(body.tool, body.args ?? {}));
    return NextResponse.json({
      ok: true,
      pending_approval: true,
      approval,
      message: "Queued for approval. No mailbox changes were applied.",
    });
  }
  const toolArgs = body.approved === true && requiresApproval(body.tool)
    ? { ...(body.args ?? {}), __approved: true }
    : body.args ?? {};
  const result = await callTool(body.tool, toolArgs);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

function requiresApproval(tool: string) {
  return tool === "archive_email" || tool === "bulk_archive";
}

function describeApproval(tool: string, args: any) {
  if (tool === "archive_email") {
    const email = typeof args.id === "string" ? getEmail(args.id) : null;
    return {
      tool,
      args,
      summary: email ? `Archive "${email.subject}" from ${email.from_name ?? email.from_addr}` : `Archive email ${args.id ?? ""}`,
      risk: "Moves one email out of the active mailbox locally and may mirror to Gmail when connected.",
    };
  }
  const ids = Array.isArray(args.ids) ? args.ids : [];
  return {
    tool,
    args,
    summary: `Archive ${ids.length.toLocaleString()} selected emails`,
    risk: "Bulk archive can hide many messages from the active mailbox. Review before applying.",
  };
}
