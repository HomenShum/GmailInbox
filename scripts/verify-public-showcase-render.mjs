import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const demoRoot = path.resolve("public", "demo");
const mimeTypes = new Map([
  [".gif", "image/gif"],
  [".png", "image/png"],
  [".html", "text/html; charset=utf-8"],
]);

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  if (pathname === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  const requested = path.resolve(demoRoot, `.${pathname}`);
  if (!requested.startsWith(demoRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(requested)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "content-type": mimeTypes.get(path.extname(requested)) ?? "application/octet-stream" });
  fs.createReadStream(requested).pipe(res);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const root = `http://127.0.0.1:${port}/`;

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        margin: 0;
        background: #0b1020;
        color: #e5e7eb;
        font-family: "Segoe UI", Arial, sans-serif;
      }
      main {
        width: 980px;
        margin: 32px auto;
      }
      h1 {
        font-size: 34px;
        margin: 0 0 10px;
      }
      h2 {
        font-size: 24px;
        margin: 34px 0 12px;
      }
      p {
        color: #a8b3cf;
      }
      img {
        width: 960px;
        border: 1px solid #334155;
        border-radius: 12px;
        background: white;
        display: block;
        margin: 12px 0 22px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Gmail Workspace Public Showcase</h1>
      <p>Local render using the same committed public demo assets.</p>
      <h2>Gmail Magic Resend / Reply QA</h2>
      <img src="${root}gmail-magic-resend.gif" alt="Magic resend QA" />
      <h2>QA Dogfood Corrections</h2>
      <img src="${root}qa-dogfood-snapshots.png" alt="QA dogfood corrections" />
      <h2>Clear Lanes</h2>
      <img src="${root}workflow-lanes-demo.gif" alt="Workflow lanes" />
      <h2>User And Person States</h2>
      <img src="${root}person-state-matrix.png" alt="Person state matrix" />
      <h2>Remotion Storyboard</h2>
      <img src="${root}remotion-workflow-storyboard.png" alt="Remotion storyboard" />
    </main>
  </body>
</html>`;

fs.mkdirSync("reports", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const page = await browser.newPage({ viewport: { width: 1200, height: 1800 }, deviceScaleFactor: 1 });
await page.goto(root, { waitUntil: "networkidle" });
await page.screenshot({ path: "reports/public-showcase-render-verify.png", fullPage: true });
const images = await page.locator("img").evaluateAll((imgs) =>
  imgs.map((img) => ({
    src: img.src,
    complete: img.complete,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
  })),
);
await browser.close();
server.close();

console.log(JSON.stringify(images, null, 2));
