# Setup Gmail OAuth — 5-minute walkthrough

This wires your real Gmail inbox into the dashboard. Tokens stay on your machine, AES-256-GCM encrypted in `src/data/gmail.db`.

## 1. Create a Google Cloud Console OAuth client

1. Go to **<https://console.cloud.google.com/>** → top bar **"Select a project"** → **"New Project"**.
   - Name: `gmail-workspace-dev` (anything works).
2. With the new project selected, go to **"APIs & Services" → "Library"**.
   - Search **"Gmail API"** → click → **Enable**.
3. **"APIs & Services" → "OAuth consent screen"**:
   - User Type: **External** → Create.
   - App name: `gmail-workspace-dev`
   - User support email: your email
   - Developer contact: your email
   - **Save and continue** through the Scopes step (no need to add scopes here — we request them at runtime).
   - **Test users** → add your own Gmail address → **Save**.
   - You'll stay in **Testing** mode forever for personal use; that's fine.
4. **"APIs & Services" → "Credentials" → "+ Create Credentials" → "OAuth client ID"**:
   - Application type: **Web application**
   - Name: `gmail-workspace-local`
   - **Authorized redirect URIs** → Add URI: `http://localhost:3030/api/auth/google/callback`
   - **Create**
5. Copy the **Client ID** and **Client secret** that appear.

## 2. Drop them into `.env.local`

Append to `.env.local` in the repository root (create it if needed):

```env
GOOGLE_CLIENT_ID=<paste client id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<paste client secret>
GOOGLE_REDIRECT_URI=http://localhost:3030/api/auth/google/callback
```

(The redirect URI defaults to that value if omitted, so it's optional.)

## 3. Restart the dev server

```bash
bun run dev
```

The TopBar pill should now read **"Not connected"** (was previously the same but inert).

## 4. Click "Connect Gmail" in Settings

1. Visit **<http://localhost:3030/settings>** → tab **"Gmail"**.
2. Click **Connect Gmail** → Google consent screen → pick the test-user account you authorized → grant scopes.
3. You'll be redirected back to `/settings?gmail=connected&email=...`. The page now shows your account with a **Sync now** button.

## 5. First sync

Click **Sync now** (or in the chat: *"ingest my inbox"*).

What happens:

| Step | What | Where |
|---|---|---|
| 1 | `users.messages.list` (paginated, INBOX label) | Gmail API → 5 pages × 100 = up to 500 messages |
| 2 | `users.messages.get` × 25 in parallel × N batches | metadata only (From / To / Subject / Date / snippet — **no body**) |
| 3 | parse "Name <email>" headers | local |
| 4 | upsert into `emails` table (PK = `gm_<gmail_msg_id>`) | local SQLite |
| 5 | run heuristic classifier on every fresh row | local |
| 6 | store `historyId` watermark on the token row | for future incremental syncs |

Re-running is idempotent (same PK = update). Rows from `bun run seed` (PK = `seed_*`) coexist with real Gmail rows (PK = `gm_*`).

## 6. Real Gmail mutations

From the moment you're connected, these tools mirror to Gmail **before** mutating local state (per HONEST_STATUS):

- `archive_email` → `users.messages.modify({ removeLabelIds: ["INBOX"] })` then re-fetch to confirm
- `bulk_archive` → same, per id
- `snooze_email` → `removeLabelIds: ["UNREAD"]`

If Gmail returns an error (auth, network, rate limit), the tool returns `{ ok: false, error }` and **does not** touch local state. Fully reversible.

## 7. Privacy defaults

- Body content is **not** fetched by default. `format: "metadata"` only returns headers + Gmail's pre-computed snippet (~100 chars).
- LLM only ever sees subject + snippet (already true today). The new `summarize_thread` tool (forthcoming v0.3) is the only path that opts in to fetching body, and it caches per-email so the body is sent at most once.
- Refresh tokens are AES-256-GCM encrypted with a key in `src/data/.token-key` (mode 0600). Override via `GMAIL_TOKEN_KEY=<64 hex chars>` env if you'd rather manage the key yourself.

## 8. Disconnect

Settings → Gmail → **Disconnect** wipes the token row from `oauth_tokens`. The `gm_*` email rows remain in your local store (so you don't lose the lane organization). Re-running `bun run seed` does NOT delete them — only the seeds table is rewritten.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `state_mismatch` after callback | cookie blocked or session expired | Try again; ensure same browser tab |
| `Error 400: redirect_uri_mismatch` | URI not registered in console | Match exactly: `http://localhost:3030/api/auth/google/callback` (no trailing slash) |
| `access_denied` | App still in Testing + you're not a test user | Add your email to **OAuth consent screen → Test users** |
| `invalid_grant` after a few hours | refresh token expired (rare in Testing mode) | Click **Disconnect** + **Connect Gmail** again |
| Sync returns 0 messages | empty INBOX label or all archived | Try `query: "in:anywhere newer_than:30d"` via chat |

## Production hardening (deferred)

Current setup is fine for personal local-first use. Before exposing this on a server you'd want:

- Move `.token-key` to OS keychain (`keytar` or libsecret).
- Switch OAuth consent to **Production** (unlocks any Google account, not just listed test users).
- Add Pub/Sub watch for live push instead of polling (`gmail.users.watch` + Cloud Pub/Sub topic).
- Per-user accounts table (multi-user mode).
- Audit log of every `users.messages.modify` call before it executes.

[Change history](CHANGELOG/docs/setup-gmail.md).
