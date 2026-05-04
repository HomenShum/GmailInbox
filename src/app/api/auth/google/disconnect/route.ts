import { NextResponse } from "next/server";
import { deleteToken } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({ email: null }));
  if (!email) return NextResponse.json({ ok: false, error: "missing email" }, { status: 400 });
  const ok = deleteToken(email);
  return NextResponse.json({ ok });
}
