import { NextResponse } from "next/server";
import { buildAuthUrl, hasOAuthCreds } from "@/lib/gmail/auth";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasOAuthCreds()) {
    return NextResponse.json(
      { ok: false, error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured. See SETUP_GMAIL.md." },
      { status: 400 },
    );
  }
  const state = crypto.randomBytes(16).toString("hex");
  const url = buildAuthUrl(state);
  const res = NextResponse.redirect(url);
  // Persist state in HTTP-only cookie for CSRF check
  res.cookies.set("oauth_state", state, {
    httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 600,
  });
  return res;
}
