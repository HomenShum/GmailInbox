import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/gmail/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirectWithMessage(`/settings?gmail=error&msg=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return redirectWithMessage("/settings?gmail=error&msg=no_code");
  }

  // CSRF: state cookie check
  const cookieState = req.headers.get("cookie")?.match(/oauth_state=([^;]+)/)?.[1];
  if (!state || state !== cookieState) {
    return redirectWithMessage("/settings?gmail=error&msg=state_mismatch");
  }

  try {
    const { email } = await exchangeCode(code);
    const res = redirectWithMessage(`/settings?gmail=connected&email=${encodeURIComponent(email)}`);
    res.cookies.delete("oauth_state");
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return redirectWithMessage(`/settings?gmail=error&msg=${encodeURIComponent(msg)}`);
  }
}

function redirectWithMessage(path: string) {
  // 303 = "see other" → ensures GET on the next page
  return NextResponse.redirect(new URL(path, "http://localhost:3030"), { status: 303 });
}
