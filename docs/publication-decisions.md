# Publication Decisions

Publicizing this repo is not just a GitHub visibility toggle. The app works with Gmail, resumes, local screenshots, private memory shards, and generated demo media, so the repo needs a clear public/private split.

## D1: Keep Generated Media Local

Decision: rendered MP4, GIF, poster, and raw screenshot outputs are ignored.

Why it matters: a single frame can expose account names, senders, browser tabs, private counts, local file names, or snippets from a real inbox. The source composition is safe to publish; the rendered artifact must be reviewed separately.

## D2: Use Sanitized Demo Assets in Git

Decision: public Remotion scenes use sanitized SVG assets in `public/remotion-public-assets/`.

Why it matters: this keeps the demo reproducible for contributors while avoiding accidental publication of live Gmail screenshots.

## D3: Move Resume Paths Out of Source

Decision: default pinned artifacts use generic names and optional `.env.local` paths.

Why it matters: source code should not reveal a user's local Windows profile path, resume filenames, or private document locations. Users can still pin real files through Settings or environment variables.

## D4: Publish the NodeBench Boundary

Decision: README documents which signals can leave Gmail for NodeBench and which private inputs must remain local.

Why it matters: this is the product trust contract. NodeBench should store reusable public research; Gmail should own private scoring, raw email access, resumes, and personal preferences.

## D5: Remove the Old Tracked GIF

Decision: `public/demo.gif` was removed from the tracked public surface.

Why it matters: `.gitignore` cannot protect already tracked files. Public repos expose tracked media through GitHub file views and raw URLs.

## D6: Public README Over Internal Notes

Decision: the README now points to a publication checklist instead of private engineering logs.

Why it matters: internal dogfood logs are useful but often contain account-specific facts. The public landing page should explain the architecture and safety model without exposing private context.

## D7: Use ASCII Runtime Diagrams for Multi-Layer Flows

Decision: the README now shows the headline ASCII runtime diagram inline, including the Vercel deploy boundary, NodeBench MCP/Render service, NodeBench Convex ledger, local SQLite store, and agent/model layer. `docs/RUNTIME.md` keeps the longer drill-down diagrams for NodeBench research, private memory, and pinned context matching.

Why it matters: these flows cross frontend, backend, database, and agent layers. ASCII renders in GitHub markdown, commit bodies, PR descriptions, terminals, and plain text handoffs without screenshots or extra tooling.
