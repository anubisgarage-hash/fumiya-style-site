// API rules test against tools/dev-server.mjs (run with BASE=http://localhost:8787).
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = process.env.BASE || "http://localhost:8787";
const PW = process.env.PW || "test-pass-1234";
let cookie = "";
async function call(path, { method = "GET", body, origin = true, raw, type, auth = true } = {}) {
  const headers = {};
  if (origin) headers.Origin = BASE;
  if (auth && cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (type) headers["Content-Type"] = type;
  const r = await fetch(BASE + path, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined), redirect: "manual" });
  const sc = r.headers.get("set-cookie");
  if (sc && sc.startsWith("fs_admin=")) cookie = sc.split(";")[0];
  const ct = r.headers.get("content-type") || "";
  return { status: r.status, headers: r.headers, data: ct.includes("json") ? await r.json() : await r.text() };
}
const jpeg = () => { const b = Buffer.alloc(400, 1); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; return b; };

let sample, draft;

test("unauthenticated requests are refused server-side", async () => {
  assert.equal((await call("/api/admin/posts", { auth: false })).status, 401);
  assert.equal((await call("/api/admin/posts", { method: "POST", body: { id: crypto.randomUUID() }, auth: false })).status, 401);
  assert.equal((await call(`/api/admin/media?post=${crypto.randomUUID()}&uid=${crypto.randomUUID()}`, { method: "POST", raw: jpeg(), type: "image/jpeg", auth: false })).status, 401);
});

test("login needs same-origin and the right password", async () => {
  assert.equal((await call("/api/admin/login", { method: "POST", body: { password: PW }, origin: false })).status, 403);
  assert.equal((await call("/api/admin/login", { method: "POST", body: { password: "wrong-pass" } })).status, 401);
  const ok = await call("/api/admin/login", { method: "POST", body: { password: PW } });
  assert.equal(ok.status, 200);
  assert.match(cookie, /^fs_admin=/);
  assert.equal((await call("/api/admin/session")).data.loggedIn, true);
});

test("sample is seeded, hidden from public, and cannot be published", async () => {
  const list = await call("/api/admin/posts");
  sample = list.data.sample;
  assert.ok(sample && sample.isSample);
  const full = (await call("/api/admin/posts/" + sample.id)).data.post;
  const pub = await call("/api/admin/posts/" + sample.id, { method: "PUT", body: { post: full, version: full.version, action: "publish" } });
  assert.equal(pub.status, 400);
  assert.equal((await call("/branding/works/" + sample.slug + "/", { auth: false })).status, 404);
  assert.ok(!(await call("/sitemap.xml", { auth: false })).data.includes(sample.slug));
});

test("duplicate from sample → new draft, unique slug, double tap does not duplicate", async () => {
  const id = crypto.randomUUID();
  const a = await call("/api/admin/posts", { method: "POST", body: { id, fromId: sample.id } });
  const b = await call("/api/admin/posts", { method: "POST", body: { id, fromId: sample.id } });
  assert.equal(a.status, 201); assert.equal(b.status, 200);
  draft = a.data.post;
  assert.equal(draft.status, "draft"); assert.equal(draft.isSample, false);
  assert.notEqual(draft.slug, sample.slug);
  assert.ok(!draft.title.startsWith("【サンプル】"));
  const list = await call("/api/admin/posts");
  assert.equal(list.data.posts.filter((p) => p.id === id).length, 1);
});

test("publishing is blocked while sample guidance text remains", async () => {
  const r = await call("/api/admin/posts/" + draft.id, { method: "PUT", body: { post: draft, version: draft.version, action: "publish" } });
  assert.equal(r.status, 422);
  assert.match(r.data.error, /案内文/);
});

test("images: type and size are validated", async () => {
  const bad = await call(`/api/admin/media?post=${draft.id}&uid=${crypto.randomUUID()}&variant=l`, { method: "POST", raw: Buffer.from("<script>alert(1)</script>".repeat(10)), type: "image/jpeg" });
  assert.equal(bad.status, 415);
  const big = await call(`/api/admin/media?post=${draft.id}&uid=${crypto.randomUUID()}&variant=l`, { method: "POST", raw: Buffer.concat([jpeg(), Buffer.alloc(5.4e6)]), type: "image/jpeg" });
  assert.equal(big.status, 413);
});

test("draft content and draft images are not public; publish → visible; unpublish → hidden", async () => {
  const uid = crypto.randomUUID();
  const up = await call(`/api/admin/media?post=${draft.id}&uid=${uid}&variant=l&w=1200&h=800`, { method: "POST", raw: jpeg(), type: "image/jpeg" });
  assert.equal(up.status, 201);
  const post = { ...draft, title: "名古屋市の小売業様｜テスト記事 <script>alert(1)</script>", summary: "テスト概要", intro: "導入文です。", background: "背景です。",
    work: "・作業A\n・作業B", ideas: "", current: "公開済み", team: "", diagram: null, hero: { key: up.data.key, w: 1200, h: 800, alt: "外観" }, slug: "test-nagoya-retail" };
  let r = await call("/api/admin/posts/" + draft.id, { method: "PUT", body: { post, version: draft.version, action: "save" } });
  assert.equal(r.status, 200); draft = r.data.post;
  assert.equal((await call("/branding/works/test-nagoya-retail/", { auth: false })).status, 404);
  assert.equal((await call("/media/" + up.data.key, { auth: false })).status, 404);
  assert.equal((await call("/media/" + up.data.key)).status, 200); // admin can see draft image

  r = await call("/api/admin/posts/" + draft.id, { method: "PUT", body: { post: draft, version: draft.version, action: "publish" } });
  assert.equal(r.status, 200); draft = r.data.post;
  const page = await call("/branding/works/test-nagoya-retail/", { auth: false });
  assert.equal(page.status, 200);
  assert.ok(!page.data.includes("<script>alert(1)</script>"), "title must be escaped");
  assert.match(page.data, /"@type":"BlogPosting"/);
  assert.match(page.data, /"@type":"BreadcrumbList"/);
  assert.match(page.data, /rel="canonical" href="[^"]*\/branding\/works\/test-nagoya-retail\/"/);
  assert.match(page.data, /<ul class="wk-ul"><li>作業A<\/li><li>作業B<\/li><\/ul>/);
  assert.ok(!page.data.includes("工夫した点"), "empty sections are hidden");
  assert.equal((await call("/media/" + up.data.key, { auth: false })).status, 200);
  assert.ok((await call("/sitemap.xml", { auth: false })).data.includes("/branding/works/test-nagoya-retail/"));
  assert.ok((await call("/branding/works/", { auth: false })).data.includes("test-nagoya-retail"));

  r = await call("/api/admin/posts/" + draft.id, { method: "PUT", body: { post: draft, version: draft.version, action: "unpublish" } });
  draft = r.data.post;
  assert.equal((await call("/branding/works/test-nagoya-retail/", { auth: false })).status, 404);
  assert.equal((await call("/media/" + up.data.key, { auth: false })).status, 404);
  assert.ok(!(await call("/sitemap.xml", { auth: false })).data.includes("test-nagoya-retail"));
});

test("dates: date-only change keeps 更新日; content change sets it; list sorted by publishAt; future = scheduled", async () => {
  let r = await call("/api/admin/posts/" + draft.id, { method: "PUT", body: { post: { ...draft, publishAt: "2024-03-01T01:00:00.000Z" }, version: draft.version, action: "publish" } });
  draft = r.data.post;
  assert.equal(draft.contentUpdatedAt, null);
  r = await call("/api/admin/posts/" + draft.id, { method: "PUT", body: { post: { ...draft, publishAt: "2024-03-05T01:00:00.000Z" }, version: draft.version, action: "publish" } });
  draft = r.data.post;
  assert.equal(draft.contentUpdatedAt, null, "date-only change must not move 更新日");
  assert.equal(draft.slug, "test-nagoya-retail", "date change must not change URL");
  r = await call("/api/admin/posts/" + draft.id, { method: "PUT", body: { post: { ...draft, background: "背景を更新しました。" }, version: draft.version, action: "publish" } });
  draft = r.data.post;
  assert.ok(draft.contentUpdatedAt);
  const pg = (await call("/branding/works/test-nagoya-retail/", { auth: false })).data;
  assert.match(pg, /datetime="2024-03-05T01:00:00.000Z">2024年3月5日/);

  // second post, newer date → listed first
  const id2 = crypto.randomUUID();
  let p2 = (await call("/api/admin/posts", { method: "POST", body: { id: id2 } })).data.post;
  r = await call("/api/admin/posts/" + id2, { method: "PUT", body: { post: { ...p2, title: "岡崎市の建設業様｜SNS運用", publishAt: "2025-06-01T00:00:00.000Z" }, version: p2.version, action: "publish" } });
  p2 = r.data.post;
  const list = (await call("/branding/works/", { auth: false })).data;
  assert.ok(list.indexOf(p2.slug) < list.indexOf("test-nagoya-retail"));
  // future date → scheduled (not public yet)
  const future = new Date(Date.now() + 3600e3).toISOString();
  r = await call("/api/admin/posts/" + id2, { method: "PUT", body: { post: { ...p2, publishAt: future }, version: p2.version, action: "publish" } });
  p2 = r.data.post;
  assert.equal((await call(`/branding/works/${p2.slug}/`, { auth: false })).status, 404);
  assert.ok(!(await call("/branding/works/", { auth: false })).data.includes(p2.slug));
});

test("slug: duplicates rejected, change after publish redirects old URL", async () => {
  const id3 = crypto.randomUUID();
  const p3 = (await call("/api/admin/posts", { method: "POST", body: { id: id3 } })).data.post;
  const dup = await call("/api/admin/posts/" + id3, { method: "PUT", body: { post: { ...p3, slug: "test-nagoya-retail" }, version: p3.version, action: "save" } });
  assert.equal(dup.status, 422);
  const r = await call("/api/admin/posts/" + draft.id, { method: "PUT", body: { post: { ...draft, slug: "nagoya-retail-web" }, version: draft.version, action: "publish" } });
  draft = r.data.post;
  const old = await call("/branding/works/test-nagoya-retail/", { auth: false });
  assert.equal(old.status, 301);
  assert.equal(old.headers.get("location"), "/branding/works/nagoya-retail-web/");
});

test("stale version is rejected (edit from another device)", async () => {
  const r = await call("/api/admin/posts/" + draft.id, { method: "PUT", body: { post: draft, version: draft.version - 1, action: "save" } });
  assert.equal(r.status, 409);
});

test("published posts cannot be deleted; drafts can", async () => {
  assert.equal((await call("/api/admin/posts/" + draft.id, { method: "DELETE" })).status, 400);
});

test("cross-origin writes are refused even with a valid cookie", async () => {
  const r = await call("/api/admin/posts/" + draft.id, { method: "PUT", body: { post: draft, version: draft.version }, origin: false });
  assert.equal(r.status, 403);
});

test("branding page shows latest works; unknown article is a real 404", async () => {
  const b = (await call("/branding/", { auth: false })).data;
  assert.match(b, /参考実例をすべて見る/);
  assert.match(b, /nagoya-retail-web/);
  assert.equal((await call("/branding/works/does-not-exist/", { auth: false })).status, 404);
});
