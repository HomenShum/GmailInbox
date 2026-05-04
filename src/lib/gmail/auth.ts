/**
 * Google OAuth client + token lifecycle.
 *
 * Flow:
 *   /api/auth/google/init       → 302 to Google consent
 *   /api/auth/google/callback   → exchange code, persist tokens
 *   any tool that needs Gmail   → getAuthedClient(email?) returns OAuth2Client
 *
 * Tokens are AES-256-GCM encrypted in src/lib/db.ts before SQLite write.
 */

import { google, type Auth } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { saveToken, getToken } from "../db";

const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3030/api/auth/google/callback";

// Read-only + modify (archive/label). NOT send/compose — keep tight.
export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function hasOAuthCreds(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function makeOAuthClient(): OAuth2Client {
  if (!hasOAuthCreds()) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set in .env.local");
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    REDIRECT_URI,
  );
}

export function buildAuthUrl(state: string): string {
  const c = makeOAuthClient();
  return c.generateAuthUrl({
    access_type: "offline",     // need refresh_token
    prompt: "consent",          // force a refresh_token even on re-auth
    scope: SCOPES,
    state,
  });
}

/**
 * Exchange an auth code for tokens. Persists the result keyed by the user's
 * email address (resolved from the userinfo endpoint).
 */
export async function exchangeCode(code: string): Promise<{ email: string }> {
  const c = makeOAuthClient();
  const { tokens } = await c.getToken(code);
  c.setCredentials(tokens);

  // Resolve email from userinfo
  const oauth2 = google.oauth2({ version: "v2", auth: c });
  const ui = await oauth2.userinfo.get();
  const email = ui.data.email;
  if (!email) throw new Error("could not resolve account email from userinfo");

  saveToken({
    account_email: email,
    access_token: tokens.access_token ?? "",
    refresh_token: tokens.refresh_token ?? null,
    expiry_ms: tokens.expiry_date ?? null,
    scope: (tokens.scope ?? SCOPES.join(" ")) as string,
  });

  return { email };
}

/**
 * Returns an OAuth2Client primed with the latest tokens for the given account
 * (or the most-recently connected account if email is omitted). The client
 * auto-refreshes on 401 and persists refreshed access tokens back to SQLite.
 */
export function getAuthedClient(account_email?: string): OAuth2Client {
  const t = getToken(account_email);
  if (!t) throw new Error(account_email ? `no token for ${account_email}` : "no Gmail account connected");
  const c = makeOAuthClient();
  c.setCredentials({
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? undefined,
    expiry_date: t.expiry_ms ?? undefined,
    scope: t.scope ?? undefined,
  });
  // Persist refreshed tokens
  c.on("tokens", (newT) => {
    saveToken({
      account_email: t.account_email,
      access_token: newT.access_token ?? t.access_token,
      refresh_token: newT.refresh_token ?? null,
      expiry_ms: newT.expiry_date ?? null,
      scope: (newT.scope ?? t.scope) as string,
    });
  });
  return c;
}

export function isConnected(account_email?: string): boolean {
  try {
    return Boolean(getToken(account_email));
  } catch { return false; }
}
