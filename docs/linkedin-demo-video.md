# LinkedIn Demo Video

## Output

Rendered Remotion cuts:

- Landscape: `public/demo/gmail-agent-memory-demo.mp4`
- Vertical: `public/demo/gmail-agent-memory-demo-vertical.mp4`

Both are 84 seconds at 30fps with a deterministic low-volume audio bed. Rendered files are local-only by default and ignored by git.

## Story

This video is built in the same spirit as the Parity Studio demo system:

- scene-based
- self-narrating captions
- sanitized product screenshots or SVG stand-ins for public repo use
- short evidence counters
- no raw private email bodies
- no voiceover baked in

The video story:

1. The inbox is the real production-scale problem.
2. A 90k-email archive cannot be summarized by one model call.
3. The correct primitive is local private memory: bodies, shards, evidence IDs, judge, claims.
4. Today becomes top jobs, not another wall of mail.
5. NodeBench supplies public company/role research while Gmail keeps private scoring local.
6. The identity arc is visible: finance/risk plus newer software, product, AI agents, and startup-builder work.
7. The LLM judge is valuable because it can reject weak or stale claims.
8. Closing thesis: personal agents need memory, and memory needs evidence.

## Commands

```bash
npm run demo:video:audio
npm run demo:video
npm run demo:video:vertical
```

Preview:

```bash
npm run demo:video:preview
```

The render scripts pin Remotion to non-default ports because this workspace often has other local services on port 3000.

## Verification

Checked with `ffprobe`:

- Landscape: 1920x1080, 84 seconds, AAC audio.
- Vertical: 1080x1920, 84 seconds, AAC audio.

Sample frames were extracted to:

```text
reports/remotion-demo-check/
```

The root `zod` dependency is pinned to `4.3.6` to match Remotion's current package set. The app-side Zod v4 migration required only one code change: `ZodError.errors` became `ZodError.issues` in the agent tool argument validator.

## Publication Rule

Do not commit MP4, GIF, or raw screenshot output from a real account. Publish the Remotion source and sanitized SVG assets in git; upload the reviewed final video to LinkedIn or GitHub Releases after frame inspection.
