// Single-administrator auth. The password lives only in the Netlify
// environment variable ADMIN_PASSWORD; sessions are HMAC-signed cookies whose
// key is derived from it, so changing the password signs everyone out.
import crypto from "node:crypto";

const COOKIE = "fs_admin";
const SESSION_DAYS = 30;

function adminPassword() {
  let v = "";
  try { v = globalThis.Netlify?.env?.get?.("ADMIN_PASSWORD") || ""; } catch {}
  return norm(v || process.env.ADMIN_PASSWORD || "");
}
// Full-width characters (Japanese keyboard) and stray spaces should not cause a mismatch.
function norm(x) { return String(x || "").normalize("NFKC").trim(); }
export function passwordState() {
  const pw = adminPassword();
  return !pw ? "missing" : pw.length < 8 ? "short" : "ok";
}
function signingKey() {
  const pw = adminPassword();
  if (pw.length < 8) return null;
  return crypto.createHash("sha256").update("fs-session-v1:" + pw).digest();
}
export function passwordConfigured() { return !!signingKey(); }

export function checkPassword(input) {
  const pw = adminPassword();
  const a = crypto.createHash("sha256").update(norm(input)).digest();
  const b = crypto.createHash("sha256").update(pw).digest();
  return pw.length >= 8 && crypto.timingSafeEqual(a, b);
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function makeSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_DAYS * 864e5, n: crypto.randomBytes(9).toString("hex") })).toString("base64url");
  const sig = crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return payload + "." + sig;
}

export function isAdmin(req) {
  const key = signingKey();
  if (!key) return false;
  const token = parseCookies(req.headers.get("cookie"))[COOKIE];
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = crypto.createHmac("sha256", key).update(payload).digest("base64url");
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now(); } catch { return false; }
}

export function sessionCookie(req, value, maxAgeSec) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`;
}
export const SESSION_MAX_AGE = SESSION_DAYS * 86400;

// State-changing requests must come from this site's own pages.
export function sameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(req.url).origin;
}
