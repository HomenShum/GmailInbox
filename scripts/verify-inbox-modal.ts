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
  await page.goto(`${baseUrl}/inbox`, { waitUntil: "networkidle" });
  await page.locator("[data-testid='inbox-view']").waitFor({ timeout: 10_000 });
  await page.locator("[data-testid='thread-row']").first().click();

  const modal = page.locator("[data-testid='thread-modal']");
  await modal.waitFor({ timeout: 10_000 });
  await page.getByRole("dialog", { name: /Email reader:/ }).waitFor({ timeout: 10_000 });
  await modal.getByText("Email body").waitFor({ state: "attached", timeout: 10_000 });
  await modal.getByText("Reply").first().waitFor({ timeout: 10_000 });
  await page.screenshot({ path: path.join(snapshotDir, "inbox-thread-modal.png"), fullPage: true });

  await page.keyboard.press("Escape");
  await modal.waitFor({ state: "hidden", timeout: 10_000 });

  if (consoleErrors.length) {
    throw new Error(`console errors:\n${consoleErrors.join("\n")}`);
  }

  console.log("inbox modal smoke passed");
} finally {
  await browser.close();
}
