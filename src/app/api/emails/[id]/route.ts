import { NextResponse } from "next/server";
import { getEmail } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const email = getEmail(id);
  if (!email) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ email });
}
