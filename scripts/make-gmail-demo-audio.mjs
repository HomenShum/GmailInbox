#!/usr/bin/env node
// Deterministic low-volume ambient bed for the Remotion Gmail demo.
// No network, no external music assets, no licensing ambiguity.

import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const duration = Number.parseInt(process.env.DURATION_SEC ?? "84", 10);
const output =
  process.env.OUTPUT ?? join(repoRoot, "public", "remotion-generated", "gmail-agent-demo-bed.m4a");

await mkdir(dirname(output), { recursive: true });

const fadeOutStart = Math.max(0, duration - 4);
const filter = [
  `sine=f=73.42:duration=${duration}:sample_rate=44100[d2]`,
  `sine=f=110.00:duration=${duration}:sample_rate=44100[a2]`,
  `sine=f=146.83:duration=${duration}:sample_rate=44100[d3]`,
  `sine=f=220.00:duration=${duration}:sample_rate=44100[a3]`,
  `sine=f=293.66:duration=${duration}:sample_rate=44100[d4]`,
  `sine=f=369.99:duration=${duration}:sample_rate=44100[fs4]`,
  "[d2][a2]amix=inputs=2:weights=1.0 0.7:duration=longest[low]",
  "[d3][a3]amix=inputs=2:weights=0.7 0.45:duration=longest[mid]",
  "[d4][fs4]amix=inputs=2:weights=0.35 0.28:duration=longest,tremolo=f=1.7:d=0.07[high]",
  `[low][mid][high]amix=inputs=3:weights=1.8 1.1 0.65:duration=longest,lowpass=f=1350,highshelf=f=2200:g=-7,volume=-24dB,afade=t=in:st=0:d=3,afade=t=out:st=${fadeOutStart}:d=4[out]`,
].join(";");

console.log(`[demo-audio] writing ${output}`);
const result = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-t",
    String(duration),
    output,
  ],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("[demo-audio] done");
