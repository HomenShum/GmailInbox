# Minimal Inbox Redesign Method

This method explains how the public Today Queue demo was produced from a cluttered private inbox/workspace surface without publishing private email, LinkedIn, calendar, or resume content.

Use it when an agent is asked to reimagine a crowded command center, CRM, inbox, recruiter tracker, or personal operating workspace.

## Agent Entry Point

The executable agent playbook lives at:

```text
.claude/skills/minimal-inbox-redesign/SKILL.md
```

Claude Code can load it as a skill. Codex, Cursor, Windsurf, and other coding agents can read the same file as a portable methodology.

## Core Workflow

```text
private screenshots / live UI
-> screenshot and workflow diagnosis
-> public pattern research
-> information architecture collapse
-> synthetic public demo
-> browser and privacy verification
-> README artifact trail
```

The goal is not a prettier dashboard. The goal is to reduce the number of things the user must interpret before acting.

## Research Method

Research interaction patterns, not visual decoration.

Useful reference buckets:

| Reference Type | Pattern To Extract | How It Applies |
| --- | --- | --- |
| Task managers | Today, Upcoming, Inbox | Separate immediate action from staging |
| Email clients | Fast triage, split inbox, keyboard flow | Make reply/book/archive obvious |
| Linear-style tools | Command menu, fast lists, low-friction status | Prefer one searchable queue over page sprawl |
| Notion-style workspaces | Quiet hierarchy and editable structure | Let details unfold instead of showing every block |
| Agent skill repos | Repeatable procedures and verification loops | Make the redesign reproducible by other agents |

Capture each reference as:

```text
Reference -> Pattern observed -> How it applies here -> What we will not copy
```

## Information Architecture Collapse

Most overbuilt personal workspaces can be reduced to four states:

```text
Now   = respond, book, decide today
Prep  = research before acting
Batch = handle with a repeated lightweight action
Later = defer, archive, or low-fit
```

For this repo, the older workspace had many similar surfaces: Today, Inbox, Briefing, Career, Admin, Progress, Automations, Analytics, and Settings. The redesign collapsed the active work into one Today Queue plus supporting context.

## UI Principles

1. Lead with one large answer to "what should I do next?"
2. Show one ranked queue instead of several lanes.
3. Keep daily sweeps visible as a memory rail.
4. Use search and lightweight filters instead of many tabs.
5. Put detail on selection, not as default page clutter.
6. Preserve negative space around the current focus.
7. Remove KPIs unless the page is explicitly an analytics page.
8. Show pinned context when ranking depends on user artifacts.
9. Show evidence beside the selected item: fit reason, public research status, calendar suggestion, and privacy boundary.
10. Use a persistent right-side agent rail on desktop, but keep it contextual and collapsible.

## Agent Chat Pattern

The agent chat panel should be useful without making the page feel like a generic chat app.

For desktop agent-native workspaces, use a full right-side rail. For tablet/mobile, collapse it into a drawer.

```text
selected queue row
-> active pinned context
-> public research proof
-> agent suggestion
-> explicit human action
```

The drawer should answer:

- Why is this ranked here?
- What evidence is missing?
- What reply would be safe to draft?
- What booking or prep block should be suggested?
- What should be deferred?

The drawer should not auto-send email, auto-book calendar events, or expose raw private text in a public demo.

## Privacy Boundary

Do not publish:

- real Gmail or LinkedIn screenshots
- raw message bodies
- real recruiter names
- exact private company threads
- raw thread IDs
- resume paths or local file paths
- OAuth credentials, API keys, or `.env` values

Publish only:

- synthetic or anonymized names
- synthetic summaries
- public-safe screenshots generated from the demo itself
- reusable UI source
- method documentation

## Verification Checklist

Before claiming the artifact is public-ready:

- Open the HTML or deployed page in a browser.
- Confirm the primary queue is visible above the fold.
- Confirm filters update the queue.
- Confirm search updates the visible set.
- Confirm selected detail updates.
- Confirm no text clips at the target viewport.
- Run a privacy scan against account-specific strings, raw URLs, tokens, and local paths.
- Update README with the artifact, preview, privacy note, and method link.

## Today Queue Mapping

The Today Queue demo applies the method as:

```text
Many private inflows
-> daily sweep snapshots
-> ranked career/action queue
-> Now / Prep / Batch / Later filters
-> pinned-context fit reasons
-> selected detail card
-> right-side agent rail
-> synthetic public artifact
```

The public demo is intentionally smaller than the private workspace because the demo should prove the decision model, not recreate the user's entire inbox.
