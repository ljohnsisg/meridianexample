// Minimal static server for hosting the clickable mockup on Railway.
// Serves public/prototype.html at "/" plus anything else in public/.
// Zero dependencies — `node server.mjs`.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize, extname } from "node:path";

const PUBLIC_DIR = new URL("./public", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".csv": "text/csv",
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const rel = path === "/" ? "prototype.html" : normalize(path).replace(/^([/\\]|\.\.)+/, "");
  try {
    const file = await readFile(join(PUBLIC_DIR, rel));
    res.writeHead(200, { "content-type": MIME[extname(rel).toLowerCase()] ?? "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
}).listen(PORT, () => console.log(`Mockup at http://localhost:${PORT}`));
