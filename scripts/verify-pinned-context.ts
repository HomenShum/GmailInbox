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
  await page.goto(`${baseUrl}/settings?tab=context`, { waitUntil: "networkidle" });
  await page.getByText("Pinned Workspace Context").waitFor({ timeout: 10_000 });
  await page.getByText("Primary Resume").first().waitFor({ timeout: 10_000 });
  await page.getByText("Local matching").first().waitFor({ timeout: 10_000 });
  await page.getByText("Drop a file here").waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: /Prompt/ }).waitFor({ timeout: 10_000 });
  await page.screenshot({ path: path.join(snapshotDir, "settings-context.png"), fullPage: true });

  const uploadBody = new FormData();
  uploadBody.set("file", new Blob(["Pinned context smoke test artifact."], { type: "text/plain" }), "smoke-context.txt");
  uploadBody.set("name", "Smoke Context Artifact");
  uploadBody.set("artifact_type", "note");
  uploadBody.set("summary", "Temporary artifact created by the pinned context smoke test.");
  uploadBody.set("tags", "smoke,context");
  const uploadResponse = await fetch(`${baseUrl}/api/pinned-artifacts`, { method: "POST", body: uploadBody });
  if (!uploadResponse.ok) throw new Error(`upload failed: ${uploadResponse.status}`);
  const uploadPayload = await uploadResponse.json() as { artifact?: { id?: string; local_path?: string | null } };
  const uploadedId = uploadPayload.artifact?.id;
  if (!uploadedId) throw new Error("upload did not return an artifact id");
  await fetch(`${baseUrl}/api/pinned-artifacts`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: uploadedId, pinned: false }),
  });
  const uploadedPath = uploadPayload.artifact?.local_path;
  if (uploadedPath?.includes("/src/data/artifacts/") || uploadedPath?.includes("\\src\\data\\artifacts\\")) {
    fs.rmSync(uploadedPath, { force: true });
  }

  await page.getByRole("button", { name: "Pinned workspace context" }).click();
  const popover = page.locator("[data-testid='pinned-context-popover']");
  await popover.waitFor({ timeout: 10_000 });
  const popoverText = await popover.innerText();
  assertIncludes(popoverText, "Pinned Agent Context");
  assertIncludes(popoverText, "Primary Resume");
  assertIncludes(popoverText, "Primary career matching context");
  await page.screenshot({ path: path.join(snapshotDir, "pinned-context-popover.png"), fullPage: true });

  await page.goto(`${baseUrl}/career`, { waitUntil: "networkidle" });
  await page.getByText("Pinned matching context").waitFor({ timeout: 10_000 });
  await page.getByText("Manage context").waitFor({ timeout: 10_000 });
  await page.getByText("Primary Resume").first().waitFor({ timeout: 10_000 });

  if (consoleErrors.length) {
    throw new Error(`console errors:\n${consoleErrors.join("\n")}`);
  }

  console.log("pinned context smoke passed");
} finally {
  await browser.close();
}

function assertIncludes(haystack: string, needle: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`Expected text to include "${needle}"`);
  }
}
