#!/usr/bin/env bun
/**
 * Record an end-to-end demo of the Gmail Workspace dashboard as a video,
 * then convert to optimized GIF for the README.
 *
 * Output:
 *   - scripts/output/demo-raw.webm   (Playwright recording)
 *   - public/demo/dashboard-demo.gif (local-only generated preview)
 *
 * Run: BASE=http://localhost:3030 npx tsx scripts/record-demo.ts
 */

import { chromium, type Page } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = process.env.BASE ?? "http://localhost:3030";
const OUT_DIR = path.resolve("scripts/output");
const PUB_DIR = path.resolve("public", "demo");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(PUB_DIR)) fs.mkdirSync(PUB_DIR, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };

async function pause(p: Page, ms: number) {
  await p.waitForTimeout(ms);
}

async function captionStep(page: Page, text: string) {
  // Inject a subtle caption banner so each step is self-narrating in the GIF
  await page.evaluate((t) => {
    const id = "__demo_caption__";
    let el = document.getElementById(id) as HTMLDivElement | null;
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.style.cssText = [
        "position:fixed",
        "top:14px",
        "left:50%",
        "transform:translateX(-50%)",
        "z-index:99999",
        "background:rgba(17,24,39,0.92)",
        "color:#fff",
        "padding:8px 16px",
        "border-radius:999px",
        "font:600 13px/1.2 system-ui,-apple-system,sans-serif",
        "box-shadow:0 6px 20px rgba(0,0,0,0.35)",
        "pointer-events:none",
        "transition:opacity 200ms",
      ].join(";");
      document.body.appendChild(el);
    }
    el.textContent = t;
    el.style.opacity = "1";
  }, text);
}

async function clearCaption(page: Page) {
  await page.evaluate(() => {
    const el = document.getElementById("__demo_caption__");
    if (el) el.style.opacity = "0";
  });
}

async function safeClick(page: Page, selector: string, opts: { timeout?: number } = {}) {
  try {
    await page.click(selector, { timeout: opts.timeout ?? 3000 });
    return true;
  } catch {
    return false;
  }
}

async function record() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: {
      dir: OUT_DIR,
      size: VIEWPORT,
    },
  });
  const page = await ctx.newPage();

  console.log("recording demo flow...");

  // 1. Dashboard intro
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 20_000 });
  await pause(page, 1200);
  await captionStep(page, "Lane-based dashboard with real Gmail data");
  await pause(page, 2200);

  // 2. Hover/scroll through lanes
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 300);
  await pause(page, 1200);
  await page.mouse.wheel(0, -300);
  await pause(page, 800);

  // 3. Filter to a lane via sidebar
  await captionStep(page, "Filter to one lane");
  if (!(await safeClick(page, 'a[href="/?lane=career"]'))) {
    await safeClick(page, 'text=Career');
  }
  await pause(page, 2500);

  // 4. AI Triage view
  await captionStep(page, "AI Triage queue");
  await page.goto(`${BASE}/inbox?tab=triage`, { waitUntil: "networkidle", timeout: 15_000 });
  await pause(page, 2500);

  // 5. Opportunities view
  await captionStep(page, "Opportunities — extracted from inbox");
  await page.goto(`${BASE}/opportunities`, { waitUntil: "networkidle", timeout: 15_000 });
  await pause(page, 2500);

  // 6. Job alerts
  await captionStep(page, "Job leads — auto-deduped");
  await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle", timeout: 15_000 });
  await pause(page, 2500);

  // 7. Settings → show Gmail connected
  await captionStep(page, "OAuth: Gmail connected, AES-256 encrypted token");
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle", timeout: 15_000 });
  await pause(page, 1200);
  // click "Gmail" tab
  const gmailTab = page.locator('button', { hasText: /^gmail$/i });
  if ((await gmailTab.count()) > 0) {
    await gmailTab.first().click();
    await pause(page, 2500);
  }

  // 8. Agent chat — quick command
  await captionStep(page, "Agent chat — 25 atomic tools, pi-ai ReAct loop");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 15_000 });
  await pause(page, 1200);
  // Click "Agent" button in topbar
  const agentBtn = page.locator('button', { hasText: /^Agent$/ });
  if ((await agentBtn.count()) > 0) {
    await agentBtn.first().click();
    await pause(page, 800);
  }
  // Click quick command
  const cmd = page.locator('button', { hasText: /what's in my inbox right now/i });
  if ((await cmd.count()) > 0) {
    await cmd.first().click();
    await pause(page, 6000); // wait for stream
  } else {
    await pause(page, 3000);
  }

  // 9. End frame
  await captionStep(page, "Local-first · MCP-compatible · 25 tools · 9 routes");
  await pause(page, 2500);
  await clearCaption(page);
  await pause(page, 600);

  // Close to flush video
  await page.close();
  await ctx.close();
  await browser.close();

  // Find latest webm in output dir
  const files = fs.readdirSync(OUT_DIR)
    .filter(f => f.endsWith(".webm"))
    .map(f => ({ f, t: fs.statSync(path.join(OUT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (files.length === 0) throw new Error("no webm produced");
  const webm = path.join(OUT_DIR, files[0].f);
  const renamed = path.join(OUT_DIR, "demo-raw.webm");
  if (webm !== renamed) {
    if (fs.existsSync(renamed)) fs.unlinkSync(renamed);
    fs.renameSync(webm, renamed);
  }
  console.log(`✓ video: ${renamed} (${(fs.statSync(renamed).size / 1024).toFixed(0)}KB)`);

  // Convert to GIF via ffmpeg with palette for quality
  const palette = path.join(OUT_DIR, "palette.png");
  const gifOut = path.join(PUB_DIR, "dashboard-demo.gif");
  const fps = 12;
  const width = 960;

  console.log("ffmpeg pass 1: palette...");
  execSync(
    `ffmpeg -y -i "${renamed}" -vf "fps=${fps},scale=${width}:-1:flags=lanczos,palettegen=stats_mode=diff" "${palette}"`,
    { stdio: "inherit" },
  );

  console.log("ffmpeg pass 2: gif...");
  execSync(
    `ffmpeg -y -i "${renamed}" -i "${palette}" -lavfi "fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" "${gifOut}"`,
    { stdio: "inherit" },
  );

  const gifBytes = fs.statSync(gifOut).size;
  console.log(`\n✓ GIF: ${gifOut} (${(gifBytes / 1024 / 1024).toFixed(2)}MB, ${width}px wide, ${fps}fps)`);
}

record().catch((e) => {
  console.error(e);
  process.exit(1);
});
