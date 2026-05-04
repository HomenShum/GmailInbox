/**
 * Thin Gmail API helpers — kept minimal so failure modes are visible.
 *
 * All functions return raw Gmail responses; ingest.ts maps them into our schema.
 */

import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { getAuthedClient } from "./auth";

export function gmailApi(account_email?: string) {
  const auth = getAuthedClient(account_email);
  return google.gmail({ version: "v1", auth });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isQuotaError(err: unknown) {
  const text = err instanceof Error ? err.message : String(err);
  return /quota|rate limit|rateLimitExceeded|userRateLimitExceeded|429/i.test(text);
}

async function withGmailRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (const delayMs of [0, 15_000, 45_000, 90_000]) {
    if (delayMs > 0) await sleep(delayMs);
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isQuotaError(err)) throw err;
    }
  }
  throw lastErr;
}

export interface GmailListPage {
  ids: string[];
  nextPageToken?: string;
  estimateTotal?: number;
}

export interface GmailMessageRef {
  id: string;
  threadId: string;
}

export interface GmailMessageFull {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: number;
  headers: Record<string, string>;
  bodyText: string;
}

export interface GmailThreadFull {
  id: string;
  messages: GmailMessageFull[];
}

/**
 * Page through messages.list. Defaults to INBOX only, newest first.
 *
 * Per CLAUDE.md BOUND rule: hard-cap pages so a single ingest never burns
 * unlimited quota. Caller must pass `maxPages`.
 */
export async function listInboxIds(opts: {
  account_email?: string;
  maxPages: number;
  pageSize?: number;
  query?: string;
}): Promise<GmailListPage> {
  const gm = gmailApi(opts.account_email);
  const collected: string[] = [];
  let nextPageToken: string | undefined;
  let estimateTotal: number | undefined;
  for (let i = 0; i < opts.maxPages; i++) {
    const r = await withGmailRetry(() => gm.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      q: opts.query,
      maxResults: opts.pageSize ?? 100,
      pageToken: nextPageToken,
    }));
    estimateTotal = r.data.resultSizeEstimate ?? estimateTotal;
    const batch = (r.data.messages ?? []).map((m) => m.id!).filter(Boolean);
    collected.push(...batch);
    nextPageToken = r.data.nextPageToken ?? undefined;
    if (!nextPageToken) break;
  }
  return { ids: collected, nextPageToken, estimateTotal };
}

/**
 * General message listing for private body backfills. By default this searches
 * all visible mail rather than only INBOX. Caller must pass maxPages.
 */
export async function listMessageRefs(opts: {
  account_email?: string;
  maxPages: number;
  pageSize?: number;
  query?: string;
  labelIds?: string[];
  includeSpamTrash?: boolean;
}): Promise<{ refs: GmailMessageRef[]; nextPageToken?: string; estimateTotal?: number }> {
  const gm = gmailApi(opts.account_email);
  const refs: GmailMessageRef[] = [];
  let nextPageToken: string | undefined;
  let estimateTotal: number | undefined;
  for (let i = 0; i < opts.maxPages; i++) {
    const r = await withGmailRetry(() => gm.users.messages.list({
      userId: "me",
      labelIds: opts.labelIds,
      q: opts.query,
      includeSpamTrash: opts.includeSpamTrash ?? false,
      maxResults: opts.pageSize ?? 100,
      pageToken: nextPageToken,
    }));
    estimateTotal = r.data.resultSizeEstimate ?? estimateTotal;
    for (const message of r.data.messages ?? []) {
      if (message.id) refs.push({ id: message.id, threadId: message.threadId ?? message.id });
    }
    nextPageToken = r.data.nextPageToken ?? undefined;
    if (!nextPageToken) break;
  }
  return { refs, nextPageToken, estimateTotal };
}

/**
 * Fetch metadata for a list of message ids in batches of 50.
 *
 * Format `metadata` returns headers + snippet only — no body. We add `body`
 * fetching as a separate opt-in pass for emails the user actually opens
 * (privacy default per PARITY_PLAN §11).
 */
export async function fetchMessagesMetadata(opts: {
  account_email?: string;
  ids: string[];
}) {
  const gm = gmailApi(opts.account_email);
  const out: Array<{
    id: string;
    threadId: string;
    labelIds: string[];
    snippet: string;
    internalDate: number;
    headers: Record<string, string>;
  }> = [];
  // Sequential to keep within free-quota budget; 50/batch in flight via Promise.all
  const BATCH = 10;
  for (let i = 0; i < opts.ids.length; i += BATCH) {
    const slice = opts.ids.slice(i, i + BATCH);
    const results = await Promise.all(slice.map((id) =>
      withGmailRetry(() => gm.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date", "List-Unsubscribe", "Message-ID"],
      })).catch((err) => ({ data: null, _err: err }) as any)
    ));
    for (const r of results) {
      const d = r.data;
      if (!d) continue;
      const headers: Record<string, string> = {};
      for (const h of (d.payload?.headers ?? [])) {
        if (h.name && h.value) headers[h.name.toLowerCase()] = h.value;
      }
      out.push({
        id: d.id!,
        threadId: d.threadId ?? d.id!,
        labelIds: d.labelIds ?? [],
        snippet: d.snippet ?? "",
        internalDate: Number(d.internalDate ?? Date.now()),
        headers,
      });
    }
  }
  return out;
}

/** Archive (remove INBOX label). HONEST_STATUS — re-fetch label state to confirm. */
/**
 * Fetch full Gmail threads and extract plain text bodies locally. This is the
 * opt-in private path: bodyText must not be sent to public research endpoints.
 */
export async function fetchThreadsFull(opts: {
  account_email?: string;
  threadIds: string[];
}): Promise<GmailThreadFull[]> {
  const gm = gmailApi(opts.account_email);
  const out: GmailThreadFull[] = [];
  const uniqueThreadIds = Array.from(new Set(opts.threadIds.filter(Boolean)));
  const BATCH = 4;
  for (let i = 0; i < uniqueThreadIds.length; i += BATCH) {
    const slice = uniqueThreadIds.slice(i, i + BATCH);
    const results = await Promise.all(slice.map((id) =>
      withGmailRetry(() => gm.users.threads.get({
        userId: "me",
        id,
        format: "full",
      })).catch((err) => ({ data: null, _err: err }) as any)
    ));
    for (const r of results) {
      const d = r.data;
      if (!d?.id) continue;
      out.push({
        id: d.id,
        messages: (d.messages ?? []).map((message: any) => messageToFull(message)).filter(Boolean),
      });
    }
  }
  return out;
}

function messageToFull(message: any): GmailMessageFull {
  const headers: Record<string, string> = {};
  for (const h of (message.payload?.headers ?? [])) {
    if (h.name && h.value) headers[String(h.name).toLowerCase()] = String(h.value);
  }
  return {
    id: message.id,
    threadId: message.threadId ?? message.id,
    labelIds: message.labelIds ?? [],
    snippet: message.snippet ?? "",
    internalDate: Number(message.internalDate ?? Date.now()),
    headers,
    bodyText: extractBodyText(message.payload),
  };
}

function extractBodyText(payload: any): string {
  const plain: string[] = [];
  const html: string[] = [];
  walkPayload(payload, plain, html);
  const raw = plain.join("\n\n").trim() || stripHtml(html.join("\n\n"));
  return normalizeBodyText(raw);
}

function walkPayload(part: any, plain: string[], html: string[]) {
  if (!part) return;
  const mimeType = String(part.mimeType ?? "").toLowerCase();
  const data = part.body?.data;
  if (data && mimeType === "text/plain") plain.push(decodeBase64Url(data));
  if (data && mimeType === "text/html") html.push(decodeBase64Url(data));
  for (const child of part.parts ?? []) walkPayload(child, plain, html);
}

function decodeBase64Url(data: string): string {
  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeBodyText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function archiveOnGmail(opts: { account_email?: string; id: string }): Promise<{ ok: boolean; error?: string }> {
  const gm = gmailApi(opts.account_email);
  try {
    await gm.users.messages.modify({
      userId: "me", id: opts.id,
      requestBody: { removeLabelIds: ["INBOX"] },
    });
    // Re-fetch to confirm label state
    const v = await gm.users.messages.get({ userId: "me", id: opts.id, format: "minimal" });
    const stillInbox = (v.data.labelIds ?? []).includes("INBOX");
    return stillInbox ? { ok: false, error: "Gmail still reports INBOX label after modify" } : { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Add label, optionally remove INBOX (sounds like archive+label). */
export async function applyGmailLabel(opts: { account_email?: string; id: string; addLabelIds?: string[]; removeLabelIds?: string[] }) {
  const gm = gmailApi(opts.account_email);
  try {
    await gm.users.messages.modify({
      userId: "me", id: opts.id,
      requestBody: { addLabelIds: opts.addLabelIds, removeLabelIds: opts.removeLabelIds },
    });
    return { ok: true } as const;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) } as const;
  }
}

/** Mark read = remove UNREAD label. */
export async function markReadOnGmail(opts: { account_email?: string; id: string }) {
  const gm = gmailApi(opts.account_email);
  try {
    await gm.users.messages.modify({
      userId: "me", id: opts.id,
      requestBody: { removeLabelIds: ["UNREAD"] },
    });
    return { ok: true } as const;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) } as const;
  }
}
