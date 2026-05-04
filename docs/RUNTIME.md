# Runtime Diagrams

These diagrams document existing multi-layer flows.

This is documentation only, so runtime boxes use `· UNCHANGED` for code that already exists.

## 1. NodeBench Job Research Bridge

Top job emails can request public company and role research without leaking private inbox content.

```
┌──────────────────────────── FRONTEND ────────────────────────────┐
│ · components/jobs/TopJobEmails.tsx                                │
│     • user clicks "Run research" on a ranked job email            │
│     • POSTs email id to /api/nodebench/job-research               │
│     • renders public dossier, status, cost, and privacy flags     │
└───────────────────────────────┬──────────────────────────────────┘
                                │ fetch / REST
                                ▼
┌──────────────────────────── BACKEND ─────────────────────────────┐
│ · src/app/api/nodebench/job-research/route.ts                    │
│     • loads the job row and public-safe role signals             │
│ · src/lib/nodebench/job-research.ts                              │
│     • builds request preview: no raw email, no raw resume        │
│ · src/lib/nodebench/client.ts                                    │
│     • prefers hosted MCP, falls back to REST if configured       │
└───────────────────────────────┬──────────────────────────────────┘
                                │ better-sqlite3
                                ▼
┌──────────────────────────── DATABASE ────────────────────────────┐
│ · job_research_contexts                                          │
│     • email_id links research context to the private Gmail row   │
│     • context_pack_json stores public dossier output             │
│     • metering_json records NodeBench account/cost metadata      │
└───────────────────────────────┬──────────────────────────────────┘
                                │ MCP JSON-RPC / REST public research
                                ▼
┌──────────────────────────── AGENT / RESEARCH ────────────────────┐
│ · NodeBench hosted MCP: profile=gmail-research                   │
│     • receives company, role title, sender domain, public URL    │
│     • returns sourced public context pack                        │
│     • never receives raw email bodies or raw resume files        │
└──────────────────────────────────────────────────────────────────┘

Legend:  + NEW   ~ MODIFIED   - REMOVED   · UNCHANGED (shown for context)
```

Privacy rule: Gmail owns private scoring. NodeBench owns reusable public facts.

## 2. Private Memory Pipeline

The all-time inbox analysis works by sharding private context locally.

Models judge aggregate claims rather than reading the full archive directly.

```
┌──────────────────────────── FRONTEND ────────────────────────────┐
│ · Today / Pulse / Briefing / Agent surfaces                       │
│     • consume promoted private claims through local read models   │
│     • show evidence-backed memory only after local promotion      │
│     • do not expose raw body text in public-facing docs or media  │
└───────────────────────────────┬──────────────────────────────────┘
                                │ local API + MCP-compatible tools
                                ▼
┌──────────────────────────── BACKEND / SCRIPTS ───────────────────┐
│ · scripts/ingest-private-thread-bodies.ts                        │
│     • fetches full Gmail thread bodies into local storage         │
│ · scripts/judge-private-context-shards.ts                        │
│     • sends aggregate shard summaries to the model                │
│ · scripts/promote-private-identity-claims.ts                     │
│     • promotes supported claims into agent-readable memory        │
│ · src/lib/tools.ts                                               │
│     • exposes list_private_identity_claims to the agent           │
└───────────────────────────────┬──────────────────────────────────┘
                                │ better-sqlite3 + hash invalidation
                                ▼
┌──────────────────────────── DATABASE ────────────────────────────┐
│ · private_email_bodies                                           │
│     • raw body text stays local                                  │
│     • body_hash invalidates stale shard evidence                  │
│ · private_context_shards                                         │
│     • bounded aggregate context windows                           │
│ · private_identity_claims                                        │
│     • judge_status, confidence, topic, evidence ids               │
└───────────────────────────────┬──────────────────────────────────┘
                                │ LLM judge sees aggregate summary only
                                ▼
┌──────────────────────────── AGENT / JUDGE ───────────────────────┐
│ · free-model or configured model router                           │
│     • verifies claim support against shard aggregates             │
│     • can reject weak, stale, or unsupported claims                │
│     • returns verdicts, rationales, and revision notes            │
└──────────────────────────────────────────────────────────────────┘

Legend:  + NEW   ~ MODIFIED   - REMOVED   · UNCHANGED (shown for context)
```

Scale rule: do not summarize 60k+ emails in one prompt.

Build local shards, judge claims, then expose only promoted memory to the workspace agent.

## 3. Pinned Context Matching

Pinned artifacts make the ambient agent legible.

Users can see which resumes, story banks, prompts, or target lists shape job ranking and drafting.

```
┌──────────────────────────── FRONTEND ────────────────────────────┐
│ · components/context/PinnedContextManager.tsx                    │
│     • pin, preview, edit, and approve local artifacts             │
│ · components/jobs/TopJobEmails.tsx                               │
│     • ranks job rows against the active pinned context            │
│ · Settings → Context                                             │
│     • explicit controls for matching and external research flags  │
└───────────────────────────────┬──────────────────────────────────┘
                                │ fetch / REST
                                ▼
┌──────────────────────────── BACKEND ─────────────────────────────┐
│ · src/app/api/pinned-artifacts/route.ts                          │
│     • CRUD for pinned artifact state                             │
│ · src/app/api/career-fit/route.ts                                │
│     • returns top job emails ranked for current context           │
│ · src/lib/pinned-artifacts.ts                                    │
│     • generic defaults, optional .env.local file paths            │
│ · src/lib/career-fit.ts                                          │
│     • local fit scoring and private evidence blend                │
└───────────────────────────────┬──────────────────────────────────┘
                                │ better-sqlite3
                                ▼
┌──────────────────────────── DATABASE ────────────────────────────┐
│ · pinned_artifacts                                               │
│     • local_path, preview_json, visibility_policy                 │
│     • approved_for_matching and approved_for_external_research    │
│ · job_research_contexts                                          │
│     • public NodeBench context is joined locally for ranking      │
│ · private_identity_claims                                        │
│     • optional private memory signals for fit context             │
└───────────────────────────────┬──────────────────────────────────┘
                                │ MCP-compatible local tools
                                ▼
┌──────────────────────────── AGENT ───────────────────────────────┐
│ · list_pinned_artifacts                                          │
│     • shows what context the agent is using                       │
│ · list_private_identity_claims                                   │
│     • uses promoted local memory, not raw private archives        │
│ · draft/research flows                                           │
│     • combine local fit with public NodeBench context             │
└──────────────────────────────────────────────────────────────────┘

Legend:  + NEW   ~ MODIFIED   - REMOVED   · UNCHANGED (shown for context)
```

UX rule: users should never wonder why a job was ranked.

Pinned context, public research, memory signals, and fit rationale must be visible from the job row.

## Last Change

2026-05-03: Added public-safe runtime diagrams for:

- NodeBench bridge
- private memory pipeline
- pinned context matching

This follows the `easier-to-read-submissions` Phase 4 convention.

Future commits and PRs can explain multi-layer changes without making reviewers rebuild the flow.
