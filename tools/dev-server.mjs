// Local test server: serves public/ and runs the real Netlify function handlers
// against an in-memory Blobs stand-in. Usage:
//   ADMIN_PASSWORD=... node tools/dev-server.mjs [port]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function memStore() {
  const m = new Map();
  return {
    async get(k, o = {}) { const v = m.get(k); if (!v) return null; return o.type === "json" ? JSON.parse(v.data) : v.data; },
    async getWithMetadata(k) { const v = m.get(k); return v ? { data: v.data, metadata: v.metadata || {} } : null; },
    async set(k, data, o = {}) { m.set(k, { data: data instanceof ArrayBuffer ? data : data, metadata: o.metadata }); },
    async setJSON(k, obj) { m.set(k, { data: JSON.stringify(obj) }); },
    async delete(k) { m.delete(k); },
    _map: m,
  };
}
globalThis.__FS_TEST_STORES__ = { data: memStore(), media: memStore() };

const works = (await import(path.join(root, "netlify/functions/works.mjs"))).default;
const media = (await import(path.join(root, "netlify/functions/media.mjs"))).default;
const admin = (await import(path.join(root, "netlify/functions/admin-api.mjs"))).default;
const ctx = { deploy: { context: "dev" } };
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".txt": "text/plain", ".json": "application/json", ".xml": "application/xml" };

http.createServer(async (req, res) => {
  try {
    const port = req.socket.localPort;
    const url = new URL(req.url, `http://localhost:${port}`);
    const p = url.pathname;
    let handler = null;
    if (p.startsWith("/api/admin/")) handler = admin;
    else if (p.startsWith("/media/")) handler = media;
    else if (p === "/sitemap.xml" || p === "/branding" || p.startsWith("/branding/")) handler = works;
    if (p === "/branding.html") { res.writeHead(301, { Location: "/branding/" }); return res.end(); }
    if (handler) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const r = await handler(new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body }), ctx);
      const headers = {}; r.headers.forEach((v, k) => (headers[k] = v));
      const setCookie = r.headers.getSetCookie?.() || [];
      if (setCookie.length) headers["set-cookie"] = setCookie;
      res.writeHead(r.status, headers);
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    let f = path.join(root, "public", decodeURIComponent(p));
    if (!f.startsWith(path.join(root, "public"))) { res.writeHead(400); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    if (!fs.existsSync(f)) { res.writeHead(404, { "Content-Type": TYPES[".html"] }); return res.end(fs.readFileSync(path.join(root, "public/404.html"))); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
    res.end(fs.readFileSync(f));
  } catch (e) {
    console.error(e); res.writeHead(500); res.end(String(e.stack || e));
  }
}).listen(+process.argv[2] || 8787, () => console.log("dev server on", +process.argv[2] || 8787));
