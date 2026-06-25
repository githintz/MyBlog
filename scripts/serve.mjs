#!/usr/bin/env node
/* Tiny static file server for local preview of dist/. */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const PORT = process.env.PORT || 4173;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".xml": "application/xml",
  ".txt": "text/plain", ".ico": "image/x-icon", ".gif": "image/gif",
};

createServer(async (req, res) => {
  try {
    let rel = decodeURIComponent(req.url.split("?")[0]);
    if (rel.endsWith("/")) rel += "index.html";
    let file = path.join(ROOT, rel);
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    } catch { file = path.join(ROOT, rel + (rel.includes(".") ? "" : "/index.html")); }
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    try {
      const data = await readFile(path.join(ROOT, "404.html"));
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      res.end(data);
    } catch { res.writeHead(404); res.end("Not found"); }
  }
}).listen(PORT, () => console.log(`Preview: http://localhost:${PORT}/`));
