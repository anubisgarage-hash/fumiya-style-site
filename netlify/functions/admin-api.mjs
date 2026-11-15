// Admin API for 参考実例. Every route except login/session requires a valid
// session cookie, and every state-changing route also requires a same-origin
// request — checked here on the server, not just in the browser.
import crypto from "node:crypto";
import { purgeCache } from "@netlify/functions";
import { checkPassword, isAdmin, makeSession, passwordConfigured, passwordState, sameOrigin, sessionCookie, SESSION_MAX_AGE } from "./_lib/auth.mjs";
import {
  CATEGORIES, PROGRESS, ROLES, contentChanged, defaultSlug, getPost, guidanceLeft, isId, loadIndex, mediaKeys,
  normalizePost, samplePost, saveIndex, sortByPublishDesc, stores, summarize, validSlug,
} from "./_lib/core.mjs";
import { renderArticle } from "./_lib/render.mjs";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", ...headers } });
const fail = (status, message, extra = {}) => json({ error: message, ...extra }, status);

async function purge(tags) {
  try { await purgeCache({ tags }); } catch { /* not available in local dev */ }
}
function stamp(p, action, now) {
  p.history = [...(p.history || []), { at: now, action }].slice(-50);
}
function upsert(idx, p) {
  const s = summarize(p);
  const i = idx.posts.findIndex((x) => x.id === p.id);
  if (i >= 0) idx.posts[i] = s; else idx.posts.push(s);
}
function slugTaken(idx, slug, id) {
  return idx.posts.some((s) => s.slug === slug && s.id !== id) || (idx.redirects[slug] && idx.redirects[slug] !== id);
}
function uniqueSlug(idx, id) {
  for (let i = 0; i < 20; i++) { const s = defaultSlug(); if (!slugTaken(idx, s, id)) return s; }
  return "work-" + crypto.randomUUID().slice(0, 8);
}
function detectImage(buf) {
  const b = new Uint8Array(buf.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: "image/png", ext: "png" };
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}
async function copyImages(st, src, newPostId) {
  const map = {};
  for (const key of mediaKeys(src)) {
    const r = await st.media.getWithMetadata(key, { type: "arrayBuffer" });
    if (!r) continue;
    const m = /^img\/[0-9a-f-]{36}-(l|s)\.(\w+)$/.exec(key);
    const base = map[key.replace(/-(l|s)\./, "-x.")] ||= crypto.randomUUID();
    const nk = `img/${base}-${m[1]}.${m[2]}`;
    await st.media.set(nk, r.data, { metadata: { ...r.metadata, postId: newPostId, createdAt: new Date().toISOString() } });
    map[key] = nk;
  }
  const re = (img) => img && img.key ? { ...img, key: map[img.key] || img.key, ...(img.s ? { s: { ...img.s, key: map[img.s.key] || img.s.key } } : {}) } : img;
  return { hero: re(src.hero), diagram: re(src.diagram), before: re(src.before), after: re(src.after), gallery: (src.gallery || []).map(re) };
}
async function ensureSample(st, idx) {
  if (idx.posts.some((s) => s.isSample)) return false;
  const sample = samplePost(crypto.randomUUID());
  if (slugTaken(idx, sample.slug, sample.id)) sample.slug = uniqueSlug(idx, sample.id);
  await st.data.setJSON("post/" + sample.id, sample);
  upsert(idx, sample);
  return true;
}

export default async (req, context) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/admin\/?/, "").replace(/\/$/, "");
  const st = stores(context);
  const method = req.method;

  // ---- public (no session) ----
  if (route === "session" && method === "GET") return json({ loggedIn: isAdmin(req), configured: passwordConfigured(), password: passwordState() });
  if (route === "login" && method === "POST") {
    if (!sameOrigin(req)) return fail(403, "不正なリクエストです。");
    if (!passwordConfigured()) return fail(503, "管理画面のパスワードがまだ設定されていません（Netlifyの環境変数 ADMIN_PASSWORD）。");
    const now = Date.now();
    const lock = (await st.data.get("auth/fails", { type: "json" })) || { count: 0, until: 0 };
    if (lock.until > now) return fail(429, `ログインの失敗が続いたため、${Math.ceil((lock.until - now) / 60000)}分ほど待ってからお試しください。`);
    let body = {};
    try { body = await req.json(); } catch {}
    if (!checkPassword(body.password)) {
      lock.count = (lock.count || 0) + 1;
      if (lock.count >= 5) { lock.until = now + 15 * 60e3; lock.count = 0; }
      await st.data.setJSON("auth/fails", lock);
      return fail(401, "パスワードが違います。");
    }
    await st.data.setJSON("auth/fails", { count: 0, until: 0 });
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(req, makeSession(), SESSION_MAX_AGE) });
  }
  if (route === "logout" && method === "POST") {
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(req, "", 0) });
  }

  // ---- everything below requires a valid session ----
  if (!isAdmin(req)) return fail(401, "ログインが必要です。");
  if (method !== "GET" && !sameOrigin(req)) return fail(403, "不正なリクエストです。");

  if (route === "meta" && method === "GET") return json({ categories: CATEGORIES, roles: ROLES, progress: PROGRESS, now: new Date().toISOString() });

  if (route === "posts" && method === "GET") {
    const idx = await loadIndex(st);
    if (await ensureSample(st, idx)) await saveIndex(st, idx);
    const posts = sortByPublishDesc(idx.posts.filter((s) => !s.isSample));
    const sample = idx.posts.find((s) => s.isSample);
    return json({ posts, sample, now: new Date().toISOString() });
  }

  if (route === "posts" && method === "POST") {
    let body = {};
    try { body = await req.json(); } catch {}
    if (!isId(body.id)) return fail(400, "記事IDが不正です。");
    const existing = await getPost(st, body.id);
    if (existing) return json({ post: existing }); // repeated tap → same post, no duplicate
    const idx = await loadIndex(st);
    const now = new Date().toISOString();
    let post;
    if (body.fromId) {
      const src = await getPost(st, body.fromId);
      if (!src) return fail(404, "複製元の記事が見つかりません。");
      const { id: _i, history: _h, version: _v, ...content } = src;
      post = { ...content, ...(await copyImages(st, src, body.id)), title: String(src.title || "").replace(/^【サンプル】/, ""),
        isSample: false, status: "draft", firstPublishedAt: null, contentUpdatedAt: null, history: [] };
      stamp(post, `「${(src.title || "無題").slice(0, 40)}」から複製`, now);
    } else {
      post = { title: "", summary: "", intro: "", background: "", work: "", ideas: "", current: "", team: "", rolesOther: "",
        categories: [], roles: [], progress: "", period: "", hero: null, diagram: null, before: null, after: null, gallery: [],
        seoTitle: "", seoDesc: "", isSample: false, status: "draft", firstPublishedAt: null, contentUpdatedAt: null, history: [] };
      stamp(post, "新規作成", now);
    }
    Object.assign(post, { id: body.id, slug: uniqueSlug(idx, body.id), publishAt: now, createdAt: now, updatedAt: now, version: 1 });
    await st.data.setJSON("post/" + post.id, post);
    upsert(idx, post);
    await saveIndex(st, idx);
    return json({ post }, 201);
  }

  const pm = /^posts\/([0-9a-f-]{36})$/.exec(route);
  if (pm && method === "GET") {
    const post = await getPost(st, pm[1]);
    return post ? json({ post }) : fail(404, "記事が見つかりません。");
  }

  if (pm && method === "PUT") {
    const id = pm[1];
    const prev = await getPost(st, id);
    if (!prev) return fail(404, "記事が見つかりません。");
    let body = {};
    try { body = await req.json(); } catch { return fail(400, "送信内容を読み取れませんでした。"); }
    if (body.version !== prev.version) return fail(409, "別の端末か画面で、この記事が先に保存されています。最新の内容を読み込み直してください。", { conflict: true });
    const action = ["save", "publish", "unpublish"].includes(body.action) ? body.action : "save";
    const n = normalizePost(body.post || {});
    const idx = await loadIndex(st);
    if (prev.isSample) {
      n.slug = prev.slug;
      if (action !== "save") return fail(400, "サンプルは公開できません。「複製して作成」で新しい記事を作ってください。");
    } else {
      if (!validSlug(n.slug)) return fail(422, "URLは半角英小文字・数字・ハイフンで3〜80文字にしてください。", { field: "slug" });
      if (slugTaken(idx, n.slug, id)) return fail(422, "このURLは別の記事で使われています。別のURLにしてください。", { field: "slug" });
    }
    const status = action === "publish" ? "published" : action === "unpublish" ? "draft" : prev.status;
    if (status === "published") {
      if (!n.title.trim()) return fail(422, "公開するにはタイトルが必要です。", { field: "title" });
      const left = guidanceLeft(n);
      if (left.length) return fail(422, `サンプルの案内文が残っています：${left.join("、")}`, { fields: left });
    }
    const now = new Date().toISOString();
    const changed = contentChanged(prev, n);
    const post = {
      ...prev, ...n, id, isSample: !!prev.isSample, status,
      createdAt: prev.createdAt, updatedAt: now, version: prev.version + 1,
      firstPublishedAt: prev.firstPublishedAt || (status === "published" ? now : null),
      // 更新日 moves only for real content edits on an already-published post, never for date-only changes.
      contentUpdatedAt: prev.status === "published" && status === "published" && changed ? now : prev.contentUpdatedAt || null,
    };
    if (prev.slug !== post.slug && prev.firstPublishedAt) idx.redirects[prev.slug] = id;
    if (idx.redirects[post.slug] === id) delete idx.redirects[post.slug];
    const label = action === "publish" ? (prev.status === "published" ? "公開中の記事を更新" : "公開")
      : action === "unpublish" ? "非公開に変更" : "下書き保存";
    stamp(post, label + (prev.publishAt !== post.publishAt ? "（公開日時を変更）" : ""), now);
    if (changed) await st.data.setJSON(`rev/${id}/${String(prev.version).padStart(6, "0")}`, prev);
    await st.data.setJSON("post/" + id, post);
    upsert(idx, post);
    await saveIndex(st, idx);
    const keep = new Set(mediaKeys(post));
    for (const k of mediaKeys(prev)) if (!keep.has(k)) await st.media.delete(k);
    await purge(["works", `post-${id}`]);
    return json({ post });
  }

  if (pm && method === "DELETE") {
    const id = pm[1];
    const prev = await getPost(st, id);
    if (!prev) return fail(404, "記事が見つかりません。");
    if (prev.isSample) return fail(400, "サンプルは削除できません。");
    if (prev.status === "published") return fail(400, "公開中の記事は、先に非公開にしてから削除してください。");
    const idx = await loadIndex(st);
    await st.data.setJSON(`deleted/${id}`, { ...prev, deletedAt: new Date().toISOString() });
    await st.data.delete("post/" + id);
    idx.posts = idx.posts.filter((s) => s.id !== id);
    for (const [k, v] of Object.entries(idx.redirects)) if (v === id) delete idx.redirects[k];
    await saveIndex(st, idx);
    for (const k of mediaKeys(prev)) await st.media.delete(k);
    await purge(["works", `post-${id}`]);
    return json({ ok: true });
  }

  if (route === "preview" && method === "POST") {
    let body = {};
    try { body = await req.json(); } catch {}
    const stored = isId(body.id) ? await getPost(st, body.id) : null;
    const n = normalizePost(body.post || {});
    const p = { ...(stored || {}), ...n, id: body.id, slug: validSlug(n.slug) ? n.slug : stored?.slug || "preview" };
    const idx = await loadIndex(st);
    const html = renderArticle(req, p, idx, { preview: true, placeholders: !!stored?.isSample });
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  }

  if (route === "media" && method === "POST") {
    const postId = url.searchParams.get("post");
    const uid = url.searchParams.get("uid");
    const variant = url.searchParams.get("variant") === "s" ? "s" : "l";
    if (!isId(postId) || !isId(uid)) return fail(400, "画像の送信内容が不正です。");
    if (!(await getPost(st, postId))) return fail(404, "記事が見つかりません。");
    const buf = await req.arrayBuffer();
    if (buf.byteLength < 100) return fail(400, "画像が空です。");
    if (buf.byteLength > MAX_IMAGE_BYTES) return fail(413, "画像が大きすぎます（5MBまで）。");
    const kind = detectImage(buf);
    if (!kind) return fail(415, "JPEG・PNG・WebPの画像を選んでください。");
    const w = Math.max(0, Math.min(20000, parseInt(url.searchParams.get("w") || "0", 10) || 0));
    const h = Math.max(0, Math.min(20000, parseInt(url.searchParams.get("h") || "0", 10) || 0));
    const key = `img/${uid}-${variant}.${kind.ext}`;
    await st.media.set(key, buf, { metadata: { postId, contentType: kind.type, w, h, createdAt: new Date().toISOString() } });
    return json({ key, w, h }, 201);
  }

  if (route === "export" && method === "GET") {
    const idx = await loadIndex(st);
    const posts = [];
    for (const s of idx.posts) { const p = await getPost(st, s.id); if (p) posts.push(p); }
    const date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    return json({ format: "fumiya-style-works/1", exportedAt: new Date().toISOString(), redirects: idx.redirects, posts,
      images: posts.flatMap((p) => mediaKeys(p).map((k) => ({ postId: p.id, key: k, url: "/media/" + k }))) }, 200,
      { "Content-Disposition": `attachment; filename="fumiya-style-works-${date}.json"` });
  }

  if (route === "import" && method === "POST") {
    let body = {};
    try { body = await req.json(); } catch { return fail(400, "バックアップファイルを読み取れませんでした。"); }
    if (body.format !== "fumiya-style-works/1" || !Array.isArray(body.posts)) return fail(400, "このサイトのバックアップファイルではありません。");
    const idx = await loadIndex(st);
    let count = 0;
    for (const raw of body.posts) {
      if (!isId(raw.id)) continue;
      const n = normalizePost(raw);
      if (!validSlug(n.slug) || slugTaken(idx, n.slug, raw.id)) n.slug = raw.isSample ? "sample-template" : uniqueSlug(idx, raw.id);
      const cur = await getPost(st, raw.id);
      const p = { ...n, id: raw.id, isSample: !!raw.isSample, status: raw.status === "published" && !raw.isSample ? "published" : "draft",
        createdAt: raw.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), contentUpdatedAt: raw.contentUpdatedAt || null,
        firstPublishedAt: raw.firstPublishedAt || null, version: (cur?.version || 0) + 1, history: raw.history || [] };
      stamp(p, "バックアップから復元", p.updatedAt);
      await st.data.setJSON("post/" + p.id, p);
      upsert(idx, p);
      count++;
    }
    Object.assign(idx.redirects, body.redirects || {});
    await saveIndex(st, idx);
    await purge(["works"]);
    return json({ ok: true, count });
  }

  return fail(404, "Not Found");
};

export const config = { path: "/api/admin/*" };
