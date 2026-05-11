---
name: minimal-inbox-redesign
description: Reimagine cluttered inbox, recruiter, CRM, or command-center interfaces into a public-safe, minimal, evidence-backed decision surface. Use when asked to simplify UI/UX, redesign from screenshots, conduct meta-research, create a public demo artifact, or help Claude Code, Codex, Cursor, or Windsurf agents reproduce a redesign methodology.
---

# Minimal Inbox Redesign

Use this skill when a workspace has become too broad, repetitive, or dashboard-heavy and the user needs a simpler product surface.

The output is not just prettier UI. The output is a smaller operating model:

```text
raw inflow -> researched patterns -> privacy-safe synthesis -> one decision queue -> verified public artifact
```

## Operating Principle

Do not make a cluttered interface more polished. First reduce the user's decision surface.

Prefer:

- one ranked queue over many lanes
- one next-best-action over many KPIs
- a small number of durable states over many tabs
- a command/search affordance over visible button sprawl
- a contextual agent drawer over a permanent chat column
- public-safe demo data over screenshots from private accounts
- evidence-backed design references over taste-only redesigns

## Phase 1 - Diagnose The Current Surface

Start by looking at the live UI or screenshot and write down:

1. What is the user trying to decide right now?
2. Which visible elements help that decision?
3. Which visible elements are duplicated, stale, generic, or decorative?
4. Which labels sound similar but mean different things?
5. Which private data cannot be published?

If a page contains many cards, stats, tabs, or lanes, assume it is too much until proven otherwise.

## Phase 2 - Conduct Meta-Research

Use current sources when the user asks for research or inspiration. Look for interaction patterns, not visual copying.

Recommended reference buckets:

- **Things / task managers**: Today, Upcoming, Inbox as staging.
- **Superhuman / email triage**: split inbox, keyboard-first triage, action vs later.
- **Linear**: command menu, issue list, fast transitions, low-friction state changes.
- **Notion / document workspaces**: quiet hierarchy and editable structured pages.
- **Claude / agent skill repos**: repeatable agent instructions, public artifacts, verification loops.

Capture the research as short principles:

```text
Reference -> Pattern observed -> How it applies here -> What we will not copy
```

Example:

```text
Linear -> command/search reduces surface area -> add Cmd/Ctrl+K search -> do not imitate dark sidebar density
```

## Phase 3 - Collapse The Information Architecture

Before drawing UI, collapse the product into four states:

```text
Now     = must decide or book today
Prep    = worth research or interview prep
Batch   = worth one filter reply
Later   = archive, defer, or low-fit
```

Avoid adding more states unless the user has a real workflow distinction.

If the app already has many pages, map them down:

```text
Today + Inbox + Briefing -> Today Queue
Calendar + Goals         -> Schedule / Plan context
Analytics + Progress     -> Archive / Weekly review
Automations + Settings   -> Advanced
```

## Phase 4 - Design The Minimal Surface

Use this default layout:

```text
+------------------+---------------------------------------------+
| daily sweep rail |  oversized headline / next-best-action      |
| archive          |                                             |
| current pressure |  selected sweep summary                     |
|                  |                                             |
|                  |  single ranked queue                        |
|                  |  selected-row detail                         |
+------------------+---------------------------------------------+
```

Required elements:

- one large headline that tells the user what the page is for
- one next-best-action card
- one ranked queue
- one visible daily sweep/history area
- one search box or command affordance
- a small filter set such as `All / Now / Prep / Batch / Later`
- visible pinned context when ranking depends on user artifacts
- selected-row proof, such as fit reasons, public research status, calendar suggestion, and privacy boundary
- a compact agent drawer that can explain the selected row, draft a reply, plan booking, or produce a research checklist

Do not include:

- KPI walls unless the user is doing analytics
- four-plus kanban lanes by default
- multiple charts on a triage surface
- generic productivity copy
- real private names/messages in a public artifact

## Agent Panel Rule

Include the agent when it makes the current decision easier. Do not give it a full-height permanent column unless chat is the main product surface.

For triage views, use a compact contextual drawer:

```text
selected row -> pinned context + proof -> agent suggestion -> human action
```

The drawer should:

- update when the selected row changes
- show which context it is using
- offer a few concrete commands, not an open-ended wall of prompts
- keep private data boundaries visible
- stop at draft, booking suggestion, research checklist, or explanation unless the product has explicit send/schedule approval

## Phase 5 - Sanitize For Public Release

Before committing or publishing:

Replace all private data:

- real names -> role labels such as `Warm Intro Lead`
- real companies -> category labels such as `YC AI Ops Co`
- private emails -> synthetic summaries
- exact private URLs -> omit or use demo paths
- screenshots from logged-in accounts -> public-safe render or synthetic asset

Run a private-leak scan against the files being published.

Minimum scan patterns:

```text
gmail.com
mail.google
linkedin.com/messaging
real account handles
real recruiter names
raw thread ids
Downloads/
client_secret
access_token
refresh_token
.env
```

If a private source inspired the design, say so plainly:

```text
Privacy note: this demo uses synthetic/anonymized names, companies, and messages.
The private tracker that inspired it is not committed.
```

## Phase 6 - Verify The Artifact

Verification is part of the deliverable.

Check:

- page loads from the public or local URL
- all expected daily sweeps are visible
- filters work
- search works
- selected detail updates
- agent drawer updates from selected row and action buttons
- text does not clip on the target viewport
- no private strings remain

For static HTML demos, keep the artifact self-contained unless the repo already has a build system for the demo.

## Phase 7 - Document For Other Agents

Add a README section that explains:

- what artifact was created
- what workflow it proves
- which privacy boundary was enforced
- how another agent can reproduce the redesign
- where the `SKILL.md` lives

Recommended public repo paths:

```text
.claude/skills/minimal-inbox-redesign/SKILL.md
docs/agent-methods/minimal-inbox-redesign.md
public/demo/today-queue.html
public/demo/today-queue-preview.png
```

## Reusable Prompt For Agents

```text
Use the minimal-inbox-redesign skill.

Goal: turn this cluttered inbox/workspace UI into the smallest useful decision surface.

Process:
1. Inspect the current UI or screenshot.
2. Identify the user's immediate decision.
3. Research 3-5 relevant interface patterns.
4. Collapse the workflow into Now / Prep / Batch / Later.
5. Redesign as one ranked queue with one next-best-action.
6. Add selected-row proof: pinned match, public research, calendar suggestion, and privacy boundary.
7. Add a compact contextual agent drawer for explain/draft/book/research commands.
8. Sanitize all private data for public sharing.
9. Verify load, filters, search, detail updates, agent drawer updates, and privacy scan.
10. Update README with the artifact, preview, and method.
```

## Quality Bar

The redesign is successful when a user can answer these in under ten seconds:

1. What should I do next?
2. What can wait?
3. What is worth researching?
4. What can be batch-processed?
5. What happened in prior daily sweeps?
6. Why did the agent rank this item here, and what evidence is missing?

If the user still has to interpret a dashboard, the redesign is not done.
