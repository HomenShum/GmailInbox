# Publication Checklist

Use this before making the repo public or pushing a demo branch that others can browse.

## What Is Viewable

Anything committed to git is viewable in a public GitHub repo, including files under `public/`, `docs/`, scripts, screenshots, videos, JSON reports, and old history. GitHub will also make images and videos reachable through raw file URLs.

## Safe Public Surface

- Source code for the app, tools, API routes, and Remotion composition
- Synthetic seed data
- Sanitized SVG assets in `public/remotion-public-assets/`
- Documentation that describes architecture without private inbox facts
- `.env.example` with placeholder values only

## Keep Local Only

- `.env*`
- `src/data/*.db`, `*.db-shm`, `*.db-wal`
- `src/data/.token-key`
- `client_secret_*.json`
- real Gmail screenshots
- rendered demo videos from a real account
- generated identity maps and recruiter trend charts from private Gmail history
- raw resumes, raw resume paths, and private file contents
- private body-ingest outputs, judge reports, and evidence exports

## Current Ignore Policy

The repo ignores the main generated-private locations:

- `public/demo/*.mp4`
- `public/demo/*.gif`
- `public/remotion-assets/`
- `public/all-time-identity-mindmap.*`
- `public/job-recruiter-signal-journey.*`
- `reports/`
- `docs/engineering-decision-log.md`
- `docs/private-context-pipeline-learning-points.md`
- `docs/sitflow-hifi/`

The public demo source should use `public/remotion-public-assets/`, not screenshots copied from a live personal account.

## Pre-Publish Commands

```bash
git status --short
git diff --cached --name-only
git ls-files public docs
rg -n "gmail.com|Downloads|client_secret|refresh_token|access_token|BEGIN PRIVATE|local private path" .
```

If any result points to a real account, raw local path, token, or private artifact, remove it before pushing.

## Demo Video Policy

Do not commit rendered MP4/GIF output by default. Render locally, inspect sample frames, then upload a sanitized final video to LinkedIn or GitHub Releases.

Reason: even a single frame can reveal senders, emails, local account names, private counts, browser tabs, or resume details.

## NodeBench Boundary

The Gmail dashboard can call NodeBench with public-safe job signals:

- company name
- role title
- sender domain
- recruiter name
- public job URL

The Gmail dashboard must keep private scoring local:

- raw email body
- raw resume text
- private pinned files
- user preferences
- final fit score inputs

NodeBench can store reusable public claims and dossiers. Gmail stores personal fit, evidence IDs, and private memory locally.
