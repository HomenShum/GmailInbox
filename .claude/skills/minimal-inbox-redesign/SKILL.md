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
- a persistent right-side agent rail on desktop, collapsed drawer on smaller screens
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
- a right-side agent rail that can explain the selected row, draft a reply, plan booking, or produce a research checklist

Do not include:

- KPI walls unless the user is doing analytics
- four-plus kanban lanes by default
- multiple charts on a triage surface
- generic productivity copy
- real private names/messages in a public artifact

## Agent Panel Rule

Include the agent when it makes the current decision easier. For modern agent-native desktop apps, use a persistent right-side rail. On smaller screens, collapse it into a drawer.

The philosophy is not "dump all context on the side." The rail is chat with context:

- one compact selected object
- one active object, never a generic assistant state
- a real conversation area visible without scrolling
- short action commands near the top
- proof, readiness, trace, and missing evidence behind disclosure
- explicit permission boundary before any send, schedule, archive, or external research write

The right rail must remain contextual, not generic chat:

```text
selected row -> pinned context + proof -> agent suggestion -> human action
```

The rail should read as a chat surface with compact decision context. Give it this anatomy:

```text
rail header with active object
-> one-line selected object bar
-> mode/model/tool state chips
-> compact run telemetry strip
-> quick action row
-> visible chat thread
-> source chips, response actions, and collapsible reasoning inside messages
-> collapsed inspect-run drawer for steps, tool calls, telemetry, cost, and approval gates
-> collapsed inspect-context drawer for readiness, proof, trace, missing gaps, and permission boundary
-> suggested prompt chips + sticky compact composer
```

The rail should:

- update when the selected row changes
- show which context it is using without consuming the entire panel
- offer concrete commands, not an open-ended wall of prompts
- detect common prompt intent such as draft, book, schedule, research, verify, and explain
- expose model/mode/tool state in compact chips
- put sources, response actions, and reasoning controls inside the message they belong to
- keep suggestions close to the composer, not as large cards in the content stream
- keep private data boundaries visible
- stop at draft, booking suggestion, research checklist, or explanation unless the product has explicit send/schedule approval
- be collapsible so the main queue can reclaim width when needed

## Agent Run Trace Rule

If the agent recommends, ranks, researches, drafts, or schedules, expose the run anatomy without turning the rail into a telemetry dashboard.

Use the NodeBench-style lifecycle:

```text
plan -> tool_start -> tool_done -> answer -> ledger
```

The default rail should show only a compact strip:

```text
Run ready / run_id / 5 steps / 5 tools / 2.4s / $0.004 / 0 writes
```

Keep that strip visually quiet. Use the Parity Studio chat rule: tool state should feel like a faint inline affordance, not a metrics card. Prefer mono microcopy, low-contrast chips, small status dots, and one-line tool result rows.

The selected object should also be quiet. Keep it to one compact row with object name, fit score, lane, and proof state. Put the actual recommendation inside the assistant message so the rail remains chat-first.

The detailed run trace belongs behind a disclosure:

- step plan with status and duration
- tool call cards with name, args, result, and telemetry
- model route and cost estimate
- source and confidence count
- write/action gate
- error or stale-data state when applicable

Recommended tool names for the public-safe Gmail/job workflow:

```text
gmail.thread.extract
pinnedContext.match
nodebench.context.pack
calendar.availability.suggest
gmail.draft.create
```

The write gate is mandatory. A public demo can show that a draft or calendar action is possible, but it must also show that no send, label mutation, archive, or calendar write happened without explicit approval.

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
7. Add a persistent right-side agent rail for desktop, with collapsed drawer behavior on smaller screens.
8. Add run telemetry: compact run strip, expandable steps, tool calls, cost, latency, model route, and write gate.
9. Sanitize all private data for public sharing.
10. Verify load, filters, search, detail updates, agent drawer updates, run trace, and privacy scan.
11. Update README with the artifact, preview, and method.
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
