import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.APP_URL ?? "http://localhost:3030";
const snapshotDir = path.resolve(process.cwd(), "snapshots");
fs.mkdirSync(snapshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors: string[] = [];

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => {
  consoleErrors.push(err.message);
});

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("[data-testid='lane-kanban']").waitFor({ timeout: 10_000 });
  await page.getByText("Select a card to open a popover without leaving Today.").waitFor({ timeout: 10_000 });

  await page.locator("[data-testid='lane-card']").first().click();
  const reader = page.locator("[data-testid='focused-email-reader']");
  await reader.waitFor({ timeout: 10_000 });
  await page.getByRole("dialog", { name: /Email reader:/ }).waitFor({ timeout: 10_000 });
  await reader.getByText("Quick read").waitFor({ timeout: 10_000 });
  await reader.getByText("Email body").waitFor({ state: "attached", timeout: 10_000 });
  const readerText = await reader.innerText();
  assertIncludes(readerText, "Quick read");
  assertIncludes(readerText, "Reply");
  await page.screenshot({ path: path.join(snapshotDir, "focused-board-reader.png"), fullPage: true });

  await page.keyboard.press("Escape");
  await reader.waitFor({ state: "hidden", timeout: 10_000 });

  await page.locator("[data-testid='more-lane-previews']").click();
  await page.locator("[data-testid='lane-job_alerts']").waitFor({ timeout: 10_000 });
  await page.screenshot({ path: path.join(snapshotDir, "focused-board-more-lanes.png"), fullPage: true });

  if (consoleErrors.length) {
    throw new Error(`console errors:\n${consoleErrors.join("\n")}`);
  }

  console.log("focused board smoke passed");
} finally {
  await browser.close();
}

function assertIncludes(haystack: string, needle: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`Expected text to include "${needle}"`);
  }
}
