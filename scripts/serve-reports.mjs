import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("reports");
const port = Number(process.env.REPORTS_PORT || 3041);

http.createServer((req, res) => {
  const pathname = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const filePath = path.resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.readFile(filePath, (err, body) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "content-type": filePath.endsWith(".html") ? "text/html; charset=utf-8" : "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(body);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`reports server listening on http://127.0.0.1:${port}`);
});
