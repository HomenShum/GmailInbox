#!/usr/bin/env node
/**
 * Capture and audit workspace routes for visual QA.
 *
 * Output: snapshots/<route>.png at 1680x945.
 *
 * Run: BASE=http://localhost:3030 npx tsx scripts/snapshot.ts
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3030";
const OUT = path.resolve("snapshots");
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const ROUTES: Array<{
  slug: string;
  path: string;
  testId: string;
  expectedUrlIncludes?: string;
}> = [
  { slug: "01-today", path: "/", testId: "today-top-jobs-view" },
  { slug: "02-inbox", path: "/inbox", testId: "inbox-view" },
  { slug: "03-inbox-reply", path: "/inbox?tab=reply_now", testId: "inbox-view" },
  { slug: "04-inbox-triage", path: "/inbox?tab=triage", testId: "inbox-view" },
  { slug: "05-calendar", path: "/calendar", testId: "calendar-view" },
  { slug: "06-goals", path: "/goals", testId: "goals-view" },
  { slug: "07-settings", path: "/settings", testId: "settings-view" },
  { slug: "08-settings-automations", path: "/settings?tab=automations", testId: "settings-view" },
  { slug: "09-planner-redirect", path: "/planner", testId: "goals-view", expectedUrlIncludes: "/goals" },
  { slug: "10-career-redirect", path: "/career", testId: "goals-view", expectedUrlIncludes: "/goals?domain=career" },
  { slug: "11-admin-redirect", path: "/personal", testId: "goals-view", expectedUrlIncludes: "/goals?domain=admin" },
  { slug: "12-automations-redirect", path: "/automations", testId: "settings-view", expectedUrlIncludes: "/settings?tab=automations" },
  { slug: "13-top-jobs", path: "/jobs", testId: "jobs-fit-view" },
  { slug: "14-today-route", path: "/today", testId: "today-top-jobs-view" },
  { slug: "15-triage-redirect", path: "/triage", testId: "inbox-view", expectedUrlIncludes: "/inbox?tab=triage" },
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1680, height: 945 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
const failures: string[] = [];

page.on("console", (message) => {
  if (message.type() === "error") failures.push(`console error: ${message.text()}`);
});
page.on("pageerror", (error) => {
  failures.push(`page error: ${error.message}`);
});

console.log(`\naudit snapshotting ${ROUTES.length} routes from ${BASE}\n`);

for (const route of ROUTES) {
  const start = Date.now();
  const beforeFailures = failures.length;
  const url = `${BASE}${route.path}`;
  let routeOk = true;
  let notes = "";

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
    await page.locator(`[data-testid="${route.testId}"]`).waitFor({ state: "visible", timeout: 12_000 });

    const currentUrl = page.url();
    if (route.expectedUrlIncludes && !currentUrl.includes(route.expectedUrlIncludes)) {
      routeOk = false;
      notes += ` expected url to include ${route.expectedUrlIncludes}; got ${currentUrl}`;
    }

    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const overflowSample = Array.from(document.querySelectorAll("main *"))
        .filter((el) => {
          const element = el as HTMLElement;
          if (element instanceof SVGElement) return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && element.scrollWidth > element.clientWidth + 2;
        })
        .slice(0, 8)
        .map((el) => {
          const element = el as HTMLElement;
          const styles = getComputedStyle(element);
          return {
            tag: element.tagName,
            className: element.className,
            text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
            overflowX: styles.overflowX,
            textOverflow: styles.textOverflow,
            whiteSpace: styles.whiteSpace,
          };
        });

      const unexpectedOverflowSample = overflowSample.filter((item) => {
        const className = String(item.className);
        const intentionalClass =
          className.includes("truncate") ||
          className.includes("overflow-hidden") ||
          className.includes("overflow-x-auto") ||
          className.includes("[overflow-wrap:anywhere]");
        const intentionalStyle = item.textOverflow === "ellipsis";
        return !intentionalClass && !intentionalStyle;
      });

      return {
        horizontalOverflowPx: root.scrollWidth - root.clientWidth,
        overflowSample,
        unexpectedOverflowSample,
      };
    });

    if (layout.horizontalOverflowPx > 2) {
      routeOk = false;
      notes += ` horizontal overflow ${layout.horizontalOverflowPx}px`;
    }
    if (layout.unexpectedOverflowSample.length > 0) {
      routeOk = false;
      notes += ` unexpected text overflow=${layout.unexpectedOverflowSample.length}`;
      notes += ` sample="${layout.unexpectedOverflowSample[0]?.text ?? ""}"`;
    } else if (layout.overflowSample.length > 0) {
      notes += ` intentional truncation=${layout.overflowSample.length}`;
    }

    const out = path.join(OUT, `${route.slug}.png`);
    await page.screenshot({ path: out, fullPage: false });
    const stat = fs.statSync(out);
    const newFailures = failures.slice(beforeFailures);
    if (newFailures.length > 0) {
      routeOk = false;
      notes += ` console/page errors=${newFailures.length}`;
    }

    const mark = routeOk ? "OK" : "FAIL";
    console.log(`  ${mark} ${route.slug.padEnd(24)} ${String(Date.now() - start).padStart(5)}ms ${String((stat.size / 1024).toFixed(0)).padStart(4)}KB ${notes}`);
    if (!routeOk) failures.push(`${route.slug}: ${notes.trim() || "route check failed"}`);
  } catch (error) {
    routeOk = false;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${route.slug}: ${message}`);
    console.log(`  FAIL ${route.slug.padEnd(24)} ${message}`);
  }
}

await browser.close();

console.log(`\nsnapshots -> ${OUT}\n`);

if (failures.length > 0) {
  console.log("Failures:");
  for (const failure of failures.slice(0, 20)) console.log(`- ${failure}`);
  process.exit(1);
}

console.log("route audit passed");
