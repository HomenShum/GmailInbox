# Gmail Workspace

Local-first Gmail command center for turning a large inbox into a small set of decisions: top jobs, reply queues, calendar blocks, goals, briefings, and agent-assisted follow-up.

The core idea is simple: private data stays local, public research is delegated to NodeBench, and every agent output needs evidence.

## Visual Showcase

This repo is meant to communicate by artifact: every feature claim should have a public-safe visual, a QA dogfood note, and a reproducible script.

| Artifact | What It Proves | File |
| --- | --- | --- |
| Today Queue demo | A public-safe, minimal career-inbox triage surface: one queue, one decision, daily sweep archive | `public/demo/today-queue.html` |
| Magic resend / reply QA | Draft, check, and approval-gate follow-up without sending externally | `public/demo/gmail-magic-resend.gif` |
| One workspace lanes | Today, Inbox, Calendar, and Goals stay distinct and readable | `public/demo/workflow-lanes-demo.gif` |
| Snapshot correction | Before/finding/after dogfood proof for UI changes | `public/demo/qa-dogfood-snapshots.png` |
| Person-state matrix | Same lanes adapt to job seeker, recruiter, student, and operator states | `public/demo/person-state-matrix.png` |
| Remotion storyboard | End-to-end video scenes generated from sanitized assets | `public/demo/remotion-workflow-storyboard.png` |

### Today Queue / Minimal Inbox Triage

The latest public-safe artifact is a deliberately simplified career-inbox interface:

- one oversized next-best-action
- one ranked queue instead of a dashboard wall
- daily sweeps visible in the rail
- simple `Now`, `Prep`, `Batch`, and `Later` filters
- `Cmd/Ctrl+K` search for person, company, or action
- a full-height right-side chat rail: one-line selected object bar, mode/model/tool state, subtle Parity Studio-style run telemetry, compact actions, message sources/actions/reasoning, collapsed run/tool ledger, collapsed proof drawer, suggested prompts, explicit permission boundary, and sticky composer
- NodeBench-style run anatomy: `plan -> tool_start -> tool_done -> answer -> ledger`, with visible steps, tool calls, latency, estimated cost, model route, source count, and `0 writes` until approval

Open the standalone demo:

[public/demo/today-queue.html](public/demo/today-queue.html)

Privacy note: the demo uses synthetic/anonymized names, companies, and messages. The private Gmail/LinkedIn tracker that inspired it is not committed.

<p>
  <img src="https://github.com/HomenShum/GmailInbox/raw/main/public/demo/today-queue-preview.png" alt="Today Queue minimal inbox triage demo" width="960" />
</p>

### Agent Method / Redesign Skill

This repo includes a dedicated agent playbook for reproducing the meta-research and redesign process:

- Skill: [`.claude/skills/minimal-inbox-redesign/SKILL.md`](.claude/skills/minimal-inbox-redesign/SKILL.md)
- Agent entry point: [`AGENTS.md`](AGENTS.md)
- Method note: [`docs/agent-methods/minimal-inbox-redesign.md`](docs/agent-methods/minimal-inbox-redesign.md)
- Demo artifact: [`public/demo/today-queue.html`](public/demo/today-queue.html)

Claude Code can load the skill directly. Codex, Cursor, Windsurf, and other agents can read the same `SKILL.md` as a portable methodology: inspect the current UI, research comparable interaction patterns, collapse the workflow into `Now / Prep / Batch / Later`, produce a synthetic public artifact, and verify both UX and privacy before publishing.

The current agent rail method also documents the run trace contract: keep the chat usable by default, show a compact run strip, and put the full step/tool/telemetry ledger behind an inspect drawer.

### Gmail Magic Resend / Reply QA

<p>
  <img src="https://github.com/HomenShum/GmailInbox/raw/main/public/demo/gmail-magic-resend.gif" alt="Gmail magic resend QA flow" width="960" />
</p>

Feature contract:

- Read the job thread from synthetic/public-safe data.
- Pull pinned context and public NodeBench research.
- Produce a review-safe draft.
- Stop at a human approval gate before any real send.

### QA Dogfood Corrections

<p>
  <img src="https://github.com/HomenShum/GmailInbox/raw/main/public/demo/qa-dogfood-snapshots.png" alt="QA dogfood before finding after correction" width="960" />
</p>

Every visible UI correction should leave a trail: what looked wrong, what the dogfood finding was, and what changed.

### Clear Lanes

<p>
  <img src="https://github.com/HomenShum/GmailInbox/raw/main/public/demo/workflow-lanes-demo.gif" alt="One workspace clear lanes demo" width="960" />
</p>

The downsized navigation is intentional: one workspace with stable lanes instead of many similar pages.

### User And Person States

<p>
  <img src="https://github.com/HomenShum/GmailInbox/raw/main/public/demo/person-state-matrix.png" alt="User states and person states matrix" width="960" />
</p>

The same workspace should work for different people by changing defaults, copy, and artifacts, not by fragmenting the app into more tabs.

### Remotion End-to-End Workflow Video

<p>
  <img src="https://github.com/HomenShum/GmailInbox/raw/main/public/demo/remotion-workflow-storyboard.png" alt="Remotion end-to-end workflow storyboard" width="960" />
</p>

The Remotion demo is scene-based so the video can explain every state transition: scale problem, private memory, top jobs, NodeBench research, identity trends, and QA proof.

```bash
npm run demo:video
npm run demo:video:vertical
```

### Public-Safe Overview GIF

<p>
  <img src="https://github.com/HomenShum/GmailInbox/raw/main/public/demo/gmail-inbox-demo.gif" alt="Public-safe Gmail Inbox animated demo" width="960" />
</p>

## Runtime At A Glance

```text
+------------------------- USER / BROWSER -------------------------+
| Next.js workspace UI                                              |
| Today, Inbox, Calendar, Settings, TopJobEmails, Pinned Context     |
| Runs on localhost:3030 now; Vercel is the public web host target   |
+-------------------------------+----------------------------------+
                                | fetch / REST
                                v
+------------------------- NEXT API RUNTIME ------------------------+
| app/api/* route handlers                                          |
| career-fit, nodebench/job-research, pinned-artifacts, chat, Gmail  |
| MCP-compatible tool handlers live in src/lib/tools.ts              |
+----------------+---------------------------+----------------------+
                 | better-sqlite3            | public-safe MCP/REST
                 v                           v
+---------------- LOCAL PRIVATE STORE -------+    +--- NODEBENCH PUBLIC LAYER ---+
| SQLite WAL in src/data/*.db                     | Hosted MCP gateway             |
| emails, private_email_bodies, pinned_artifacts  | Render service endpoint        |
| private_identity_claims, job_research_contexts  | Convex public research/ledger  |
| Raw Gmail bodies, resumes, and local scoring    | Reusable sourced dossiers      |
+----------------+----------------------------+    +---------------+--------------+
                 | aggregate shards + claims                       | public packs
                 v                                                  v
+---------------- AGENT / MODEL LAYER ------------------------------+
| Local demo agent or OpenRouter / Anthropic / OpenAI / Gemini       |
| Sees snippets, aggregate shard summaries, and public context packs |
| Does not receive raw resume files or raw Gmail bodies by default   |
+-------------------------------------------------------------------+
```

## What It Does

- **Today-first workspace**: starts from the jobs and decisions that need attention now instead of showing every lane at once.
- **Inbox triage**: classifies Gmail into bounded lanes, keeps low-confidence items reviewable, and supports modal email reading.
- **Pinned context**: lets a user pin resumes, story banks, target lists, prompts, and local files as visible agent context.
- **Top job ranking**: ranks job and recruiter emails against pinned local context without sending raw resumes externally.
- **NodeBench bridge**: sends only public-safe signals such as company, role title, sender domain, and public job URL to NodeBench for sourced public dossiers.
- **Private memory pipeline**: can ingest full thread bodies locally, shard them, judge aggregate claims, and promote evidence-backed memory for agent use.
- **Remotion demo**: renders a public-safe product video from sanitized source assets.

## Privacy Boundary

This repo is designed to be publicizable without exposing a real Gmail account, but only if generated private artifacts stay out of git.

Safe to commit:

- app source code
- synthetic seed data
- public-safe SVG demo assets in `public/remotion-public-assets/`
- Remotion composition source
- docs that do not include raw inbox content, local paths, tokens, or personal account traces

Do not commit:

- `.env*`
- SQLite data in `src/data/*.db*`
- OAuth token key at `src/data/.token-key`
- Google OAuth client secrets
- rendered videos or GIFs from a real account
- raw app screenshots from a real account
- generated identity maps or recruiter trend files from private email history
- raw resume paths or private document contents

The `.gitignore` enforces the main local-only artifact paths. See [docs/publication-checklist.md](docs/publication-checklist.md) before making the repo public, and [docs/publication-decisions.md](docs/publication-decisions.md) for the decision log behind the cleanup.

## Demo Video

The public Remotion source uses sanitized SVG assets. Generated videos are local-only by default because a video can easily capture private screenshots or account text.

```bash
npm run demo:video:audio
npm run demo:video
npm run demo:video:vertical
```

Outputs are written to `public/demo/` and ignored by git:

- `public/demo/gmail-agent-memory-demo.mp4`
- `public/demo/gmail-agent-memory-demo-vertical.mp4`

For a public release, render with sanitized assets, inspect the frames, then upload the final MP4 as a GitHub Release asset or LinkedIn upload rather than committing it into repo history.

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run seed
npm run dev
```

Open `http://localhost:3030`.

Optional model keys:

- `OPENROUTER_API_KEY`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`

Without a model key, the app uses a deterministic demo agent for core flows.

## Real Gmail

Gmail OAuth is local-first:

- tokens are encrypted at rest
- metadata sync is idempotent
- archive and mutation flows mirror to Gmail first, then update local state
- full body ingest is opt-in and private

Set up OAuth with:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Redirect URI:

```text
http://localhost:3030/api/auth/google/callback
```

## NodeBench Integration

The Gmail app can call the hosted NodeBench MCP gateway for public research:

```text
NODEBENCH_MCP_URL=https://nodebench-mcp-unified.onrender.com?profile=gmail-research
NODEBENCH_MCP_PROFILE=gmail-research
NODEBENCH_MCP_CLIENT_ID=gmail-dashboard-local
```

Tokens are optional for anonymous metered usage:

```text
NODEBENCH_MCP_TOKEN=...
NODEBENCH_GMAIL_RESEARCH_TOKEN=...
```

Allowed outbound signals:

- company name
- role title
- sender domain
- recruiter name
- public job URL

Never send:

- raw email bodies
- raw resume text
- private notes
- private files
- local fit score inputs

## Architecture

The headline runtime diagram is intentionally visible at the top of this README.

Deployment boundary:

- **Vercel**: intended host for the Next.js web/API surface.
- **Local SQLite**: private Gmail data, raw bodies, pinned files, and fit scoring.
- **NodeBench MCP on Render**: public-safe company, person, and role research.
- **NodeBench Convex**: public research storage, usage ledger, and reusable claims.
- **Google Gmail API**: OAuth and mailbox actions; tokens stay encrypted locally.

More detailed runtime diagrams for the NodeBench job bridge, private memory pipeline, and pinned context matching live in [docs/RUNTIME.md](docs/RUNTIME.md).

```text
Next.js app
|-- src/app                workspace routes and API routes
|-- src/components         inbox, jobs, shell, context, approvals
|-- src/lib/db.ts          SQLite schema, read models, local persistence
|-- src/lib/tools.ts       MCP-compatible tool handlers
|-- src/lib/nodebench      public research bridge
|-- src/lib/pinned-*       local pinned context
|-- scripts                ingest, verify, trend, demo, NodeBench jobs
|-- remotion               demo video composition
```

## Useful Scripts

```bash
npm run typecheck
npm run build
npm run seed
npm run verify:nodebench
npm run nodebench:top-jobs
npm run gmail:body-ingest
npm run private-context:status
npm run private-context:judge
npm run demo:video
```

## Publicizing Safely

Before changing repository visibility:

```bash
git status --short
git diff --cached --name-only
rg -n "gmail.com|Downloads|client_secret|refresh_token|access_token|BEGIN PRIVATE|local private path" .
```

Then inspect any media that would be committed:

```bash
git ls-files public
```

The current policy is: publish source, sanitized assets, and docs; keep private videos, screenshots, databases, logs, and generated identity artifacts local.

To distribute a public version, generate a sanitized mirror instead of flipping this private working repo public:

```bash
npm run public:export -- C:/tmp/gmail-inbox
```

See [docs/public-distribution.md](docs/public-distribution.md).
