// 参考実例 (works) — data model, validation and storage helpers.
// Posts live in Netlify Blobs. Production and non-production deploys use
// separate stores so preview testing never touches live articles.
import { getStore } from "@netlify/blobs";

export const CATEGORIES = [
  { id: "web", name: "ホームページ制作" },
  { id: "sns", name: "SNS新設・運用" },
  { id: "design", name: "Web・SNS活用設計" },
  { id: "branding", name: "ブランディング" },
  { id: "ai", name: "AI活用・業務改善" },
];
export const ROLES = ["企画", "全体設計", "ディレクション", "構成", "撮影", "デザイン", "実装", "SNS運用", "運用サポート"];
export const PROGRESS = ["構想段階", "デザイン確認段階", "制作中", "リニューアル進行中", "公開済み", "運用中", "完了"];

const TEXT_LIMITS = {
  title: 120, summary: 300, intro: 3000, background: 10000, work: 10000, ideas: 10000,
  current: 5000, team: 1500, rolesOther: 200, seoTitle: 120, seoDesc: 300,
};
// Fields whose change counts as a real content update (drives 更新日).
export const CONTENT_FIELDS = ["title", "summary", "intro", "background", "work", "ideas", "current", "team",
  "roles", "rolesOther", "hero", "diagram", "before", "after", "gallery", "categories", "progress", "period"];
const RESERVED_SLUGS = new Set(["page", "category", "admin", "api", "feed", "index"]);
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MEDIA_KEY_RE = /^img\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(l|s)\.(jpg|png|webp)$/;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isId(v) { return typeof v === "string" && ID_RE.test(v); }

export function deployContext(context) {
  return context?.deploy?.context || process.env.CONTEXT || "dev";
}

export function stores(context) {
  if (globalThis.__FS_TEST_STORES__) return globalThis.__FS_TEST_STORES__;
  const suffix = deployContext(context) === "production" ? "" : "-preview";
  return {
    data: getStore({ name: "works" + suffix, consistency: "strong" }),
    media: getStore({ name: "works-media" + suffix, consistency: "strong" }),
  };
}

// ---- index (one small JSON doc with a summary of every post) ----
export async function loadIndex(st) {
  const idx = await st.data.get("index", { type: "json" });
  return idx && Array.isArray(idx.posts) ? { posts: idx.posts, redirects: idx.redirects || {} } : { posts: [], redirects: {} };
}
export async function saveIndex(st, idx) { await st.data.setJSON("index", idx); }
export async function getPost(st, id) {
  if (!isId(id)) return null;
  return st.data.get("post/" + id, { type: "json" });
}

export function isPublic(p, now = Date.now()) {
  return !!p && p.status === "published" && !p.isSample && Date.parse(p.publishAt) <= now;
}

export function summarize(p) {
  return {
    id: p.id, slug: p.slug, title: p.title, status: p.status, isSample: !!p.isSample,
    publishAt: p.publishAt, contentUpdatedAt: p.contentUpdatedAt || null, updatedAt: p.updatedAt,
    summary: autoSummary(p), categories: p.categories, progress: p.progress || "",
    thumb: p.hero && p.hero.key ? { key: p.hero.s?.key || p.hero.key, w: p.hero.s?.w || p.hero.w, h: p.hero.s?.h || p.hero.h, alt: p.hero.alt || "" } : null,
    media: mediaKeys(p),
  };
}

export function sortByPublishDesc(list) {
  return [...list].sort((a, b) => Date.parse(b.publishAt) - Date.parse(a.publishAt) || (a.id < b.id ? 1 : -1));
}

// ---- text helpers ----
export function plain(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
export function clip(s, n) { const t = plain(s); return t.length > n ? t.slice(0, n - 1) + "…" : t; }
export function autoSummary(p) {
  return clip(p.summary || p.intro || p.background || p.work || "", 90);
}

// Guidance text from the sample ("ここに〜を記入") must not be published.
export function guidanceLeft(p) {
  const fields = { title: "タイトル", summary: "一覧用の紹介文", intro: "導入文", background: "相談の背景", work: "取り組んだ内容",
    ideas: "工夫した点", current: "現在の状況", team: "制作体制" };
  const out = [];
  for (const [k, label] of Object.entries(fields)) if (/ここに.{0,40}記入/.test(p[k] || "")) out.push(label);
  if (/ここに.{0,40}記入/.test(p.diagram?.text || "")) out.push("構造図の説明");
  if (/^【サンプル】/.test(p.title || "")) out.push("タイトル（【サンプル】）");
  return out;
}

export function mediaKeys(p) {
  const keys = [];
  const add = (img) => { if (img && img.key) { keys.push(img.key); if (img.s?.key) keys.push(img.s.key); } };
  add(p.hero); add(p.diagram); add(p.before); add(p.after);
  (p.gallery || []).forEach(add);
  return keys;
}

// ---- normalization: whitelist + limits for anything coming from the admin ----
function text(v, max) { return String(v ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max); }
function int(v, max = 20000) { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 && n <= max ? n : 0; }
function img(v, withCaption = false) {
  if (!v || typeof v !== "object" || !MEDIA_KEY_RE.test(v.key || "")) return null;
  const out = { key: v.key, w: int(v.w), h: int(v.h), alt: text(v.alt, 200) };
  if (v.s && MEDIA_KEY_RE.test(v.s.key || "")) out.s = { key: v.s.key, w: int(v.s.w), h: int(v.s.h) };
  if (withCaption) out.caption = text(v.caption, 300);
  return out;
}
export function validSlug(slug) {
  return typeof slug === "string" && slug.length >= 3 && slug.length <= 80 && SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}
export function defaultSlug(now = new Date()) {
  const d = new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");
  return `work-${d}-${Math.random().toString(36).slice(2, 6)}`;
}
export function normalizePost(input) {
  const p = {};
  for (const [k, max] of Object.entries(TEXT_LIMITS)) p[k] = text(input[k], max);
  p.title = p.title.replace(/\n/g, " ").trim();
  p.slug = String(input.slug || "").trim().toLowerCase();
  const catIds = new Set(CATEGORIES.map((c) => c.id));
  p.categories = [...new Set((Array.isArray(input.categories) ? input.categories : []).filter((c) => catIds.has(c)))];
  p.roles = [...new Set((Array.isArray(input.roles) ? input.roles : []).filter((r) => ROLES.includes(r)))];
  p.progress = PROGRESS.includes(input.progress) ? input.progress : "";
  p.period = /^\d{4}-(0[1-9]|1[0-2])$/.test(input.period || "") ? input.period : "";
  const t = Date.parse(input.publishAt);
  p.publishAt = Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
  p.hero = img(input.hero);
  p.diagram = img(input.diagram) || (input.diagram?.text ? {} : null);
  if (p.diagram || input.diagram?.text) p.diagram = { ...(p.diagram || {}), text: text(input.diagram?.text, 5000) };
  p.before = img(input.before);
  p.after = img(input.after);
  p.gallery = (Array.isArray(input.gallery) ? input.gallery : []).map((g) => img(g, true)).filter(Boolean).slice(0, 24);
  return p;
}

export function contentChanged(a, b) {
  return CONTENT_FIELDS.some((k) => JSON.stringify(a?.[k] ?? null) !== JSON.stringify(b?.[k] ?? null));
}

export function samplePost(id, now = new Date()) {
  return {
    id, isSample: true, status: "draft", slug: "sample-template",
    title: "【サンプル】○○市の製造業様｜ホームページ制作・SNS活用支援",
    summary: "ここに一覧用の紹介文を記入（80字前後。どの地域・業種の企業に、何を支援したか）",
    intro: "ここに導入文を記入（記事の最初に表示される2〜3行。支援内容を短く説明）",
    background: "ここに相談の背景を記入（お客様が困っていたこと、目指したいこと）",
    diagram: { text: "ここに構造図の要点を記入（例：ホームページを拠点に、各SNSの役割と問い合わせまでの流れ）" },
    work: "ここに取り組んだ内容を記入\n・行頭に「・」を付けると箇条書きになります\n・",
    ideas: "ここに工夫した点を記入（判断の理由や、こだわったところ）",
    current: "ここに現在の状況を記入（例：デザイン確認段階、公開済みなど。確認できた事実のみ）",
    team: "ここに制作体制を記入（任意。協力会社・パートナーのクレジットなど）",
    categories: ["web", "design"], roles: ["企画", "全体設計"], rolesOther: "", progress: "", period: "",
    hero: null, before: null, after: null, gallery: [], seoTitle: "", seoDesc: "",
    publishAt: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString(),
    contentUpdatedAt: null, firstPublishedAt: null, version: 1,
    history: [{ at: now.toISOString(), action: "サンプルを作成" }],
  };
}
