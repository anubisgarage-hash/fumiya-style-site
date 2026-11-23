// Server-side HTML for /branding/, 参考実例 list and article pages.
// Everything user-entered is escaped; body text supports paragraphs and
// "・" bullet lines only, so posts can never inject markup or scripts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, autoSummary, clip, isPublic, sortByPublishDesc } from "./core.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
function readLib(name) {
  for (const dir of [here, path.join(process.cwd(), "netlify/functions/_lib")]) {
    try { return fs.readFileSync(path.join(dir, name), "utf8"); } catch {}
  }
  throw new Error("missing " + name);
}
let _chrome, _branding;
export function chrome() { return (_chrome ||= JSON.parse(readLib("chrome.json"))); }
function brandingTemplate() { return (_branding ||= readLib("branding.html")); }

export const SITE_NAME = "FUMIYA STYLE";
export const AUTHOR = "佐野史弥";
export function siteUrl(req) {
  return chrome().site || new URL(req.url).origin;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
}
const catName = (id) => CATEGORIES.find((c) => c.id === id)?.name || "";

const JST = "Asia/Tokyo";
export function fmtDate(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: JST, year: "numeric", month: "long", day: "numeric" }).format(d);
}
function fmtPeriod(ym) { const m = /^(\d{4})-(\d{2})$/.exec(ym || ""); return m ? `${m[1]}年${Number(m[2])}月` : ""; }

// Paragraphs (blank line), line breaks, and "・"/"- " bullet lists.
export function fmtText(s) {
  const blocks = String(s || "").trim().split(/\n\s*\n/);
  return blocks.map((b) => {
    const lines = b.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
    if (!lines.length) return "";
    if (lines.every((l) => /^\s*(・|-\s|•)/.test(l))) {
      const items = lines.map((l) => l.replace(/^\s*(・|-\s|•)\s*/, "")).filter(Boolean);
      return items.length ? `<ul class="wk-ul">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "";
    }
    return `<p>${lines.map(esc).join("<br>")}</p>`;
  }).join("\n");
}

function mediaUrl(key) { return "/media/" + key; }
function imgTag(img, { alt, sizes = "(min-width: 1000px) 1000px, 100vw", eager = false, cls = "" } = {}) {
  if (!img || !img.key) return "";
  const srcset = img.s?.key ? ` srcset="${mediaUrl(img.s.key)} ${img.s.w || 800}w, ${mediaUrl(img.key)} ${img.w || 2000}w" sizes="${sizes}"` : "";
  const dims = img.w && img.h ? ` width="${img.w}" height="${img.h}"` : "";
  return `<img src="${mediaUrl(img.key)}"${srcset}${dims} alt="${esc(alt ?? img.alt ?? "")}"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}${cls ? ` class="${cls}"` : ""}>`;
}
function zoomable(img, label, opts = {}) {
  if (!img || !img.key) return "";
  return `<button type="button" class="wk-zoom" data-full="${mediaUrl(img.key)}" data-alt="${esc(img.alt || label)}" aria-label="${esc(label)}を拡大">${imgTag(img, opts)}</button>`;
}
const placeholder = (label) => `<div class="wk-ph" role="img" aria-label="${esc(label)}">${esc(label)}<br><small>管理画面で画像を差し替え</small></div>`;

const WORKS_CSS = `
.wk-wrap{max-width:1000px;margin:0 auto;padding:0 20px}
.wk-crumb{max-width:1000px;margin:0 auto;padding:20px 20px 0;font-size:12px;color:#767676}
.wk-crumb ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px 8px}
.wk-crumb li+li::before{content:"›";margin-right:8px;color:#BDBDB8}
.wk-crumb a{color:#6B6B6B;text-decoration:none}
.wk-lbl{margin:0;font-family:'Cormorant Garamond',serif;font-size:13px;letter-spacing:.4em;color:#3F3F3F}
.wk-h1{margin:0;font-family:'Shippori Mincho',serif;font-weight:500;font-size:clamp(22px,5.6vw,34px);line-height:1.6;letter-spacing:.06em;color:#222222;overflow-wrap:anywhere}
.wk-h2{margin:0 0 16px;font-family:'Shippori Mincho',serif;font-weight:500;font-size:clamp(19px,4.8vw,24px);line-height:1.6;letter-spacing:.08em;color:#222222;padding-top:20px;border-top:1px solid #DEDED9}
.wk-body p{margin:0 0 1.2em;font-size:16px;line-height:2;color:#3D3D3D}
.wk-ul{margin:0 0 1.2em;padding-left:1.2em;color:#3D3D3D;line-height:2}
.wk-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.wk-chip{padding:3px 10px;border:1px solid #D2D2CD;font-size:12px;color:#555555}
.wk-badge{padding:3px 10px;background:#E8E8E4;color:#222222;font-size:12px}
.wk-meta{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:#6B6B6B}
.wk-sec{margin:56px 0}
.wk-fig{margin:0}
.wk-fig figcaption{margin-top:8px;font-size:13px;color:#767676}
.wk-zoom{display:block;width:100%;padding:0;border:0;background:#FFFFFF;cursor:zoom-in}
.wk-zoom img{display:block;width:100%;height:auto}
.wk-ba{display:grid;grid-template-columns:1fr;gap:20px}
@media (min-width:768px){.wk-ba.two{grid-template-columns:1fr 1fr}}
.wk-ba-item{margin:0}
.wk-ba-lbl{display:inline-block;margin-bottom:8px;padding:2px 12px;font-family:'Cormorant Garamond',serif;font-size:15px;letter-spacing:.3em;border:1px solid #3F3F3F;color:#3F3F3F}
.wk-ba-lbl.after{background:#3F3F3F;color:#F4F4F2}
.wk-ba-box{aspect-ratio:4/3;background:#FFFFFF;border:1px solid #DEDED9;display:flex;align-items:center;justify-content:center}
.wk-ba-box .wk-zoom{height:100%;background:transparent}
.wk-ba-box img{width:100%;height:100%;object-fit:contain}
.wk-diagram-tools{display:flex;gap:12px;margin-top:10px;flex-wrap:wrap}
.wk-btn{min-height:44px;padding:0 16px;display:inline-flex;align-items:center;gap:8px;border:1px solid #3F3F3F;background:transparent;color:#3F3F3F;font-size:14px;font-family:inherit;text-decoration:none;cursor:pointer}
.wk-cta{display:flex;justify-content:center;align-items:center;min-height:56px;width:100%;max-width:440px;padding:10px 16px;background:#3F3F3F;color:#F4F4F2!important;font-size:15px;font-weight:500;letter-spacing:.04em;line-height:1.5;text-decoration:none;text-align:center}
.wk-roles dt{font-size:13px;color:#767676;margin:12px 0 6px}
.wk-roles dd{margin:0;color:#3D3D3D}
.wk-grid{display:grid;grid-template-columns:1fr;gap:16px}
@media (min-width:640px){.wk-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:1000px){.wk-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}}
.wk-card{display:flex;flex-direction:column;background:#FFFFFF;border:1px solid #DEDED9;color:#222222;text-decoration:none;min-width:0}
.wk-card:hover{border-color:#BDBDB8}
.wk-thumb{aspect-ratio:3/2;background:#E8E8E4;overflow:hidden}
.wk-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.wk-thumb.none{display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;letter-spacing:.3em;color:#BDBDB8;font-size:14px}
.wk-card-body{padding:18px 18px 20px;display:flex;flex-direction:column;gap:10px}
.wk-card-title{margin:0;font-family:'Shippori Mincho',serif;font-weight:500;font-size:17px;line-height:1.7;letter-spacing:.04em;color:#222222;overflow-wrap:anywhere}
.wk-card-sum{margin:0;font-size:14px;line-height:1.8;color:#6B6B6B;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.wk-card-date{font-size:12px;color:#767676}
.wk-filter{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.wk-filter a{min-height:40px;padding:0 14px;display:inline-flex;align-items:center;border:1px solid #D2D2CD;color:#3D3D3D;font-size:13px;text-decoration:none}
.wk-filter a[aria-current="page"]{background:#3F3F3F;border-color:#3F3F3F;color:#F4F4F2}
.wk-pager{display:flex;justify-content:space-between;gap:12px;margin-top:32px}
.wk-ph{aspect-ratio:3/2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1px dashed #BDBDB8;background:#FFFFFF;color:#777777;font-size:14px;text-align:center}
.wk-ph small{font-size:11px;color:#8A8A8A}
.wk-preview-bar{position:sticky;top:0;z-index:60;background:#7A2E1E;color:#fff;text-align:center;font-size:13px;padding:8px 12px}
.wk-lb{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.94);display:flex;flex-direction:column}
.wk-lb[hidden]{display:none}
.wk-lb-bar{display:flex;justify-content:flex-end;gap:8px;padding:10px 12px;flex:none}
.wk-lb-bar button,.wk-lb-bar a{min-width:44px;min-height:44px;padding:0 12px;border:1px solid #555;background:#111;color:#F4F4F2;font-size:15px;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;cursor:pointer}
.wk-lb-view{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;display:flex;align-items:flex-start;justify-content:center;touch-action:pan-x pan-y pinch-zoom}
.wk-lb-view img{display:block;max-width:none;margin:auto}
`;

const LIGHTBOX_HTML = `<div class="wk-lb" id="wk-lb" hidden role="dialog" aria-modal="true" aria-label="画像の拡大表示">
<div class="wk-lb-bar"><button type="button" id="wk-lb-out" aria-label="縮小">−</button><button type="button" id="wk-lb-in" aria-label="拡大">＋</button><a id="wk-lb-raw" href="#" target="_blank" rel="noopener">画像だけを開く</a><button type="button" id="wk-lb-close" aria-label="閉じる">✕</button></div>
<div class="wk-lb-view" id="wk-lb-view"><img id="wk-lb-img" alt=""></div></div>`;
const LIGHTBOX_JS = `(function(){var lb=document.getElementById('wk-lb');if(!lb)return;var img=document.getElementById('wk-lb-img'),raw=document.getElementById('wk-lb-raw'),view=document.getElementById('wk-lb-view'),z=1,last=null;
function fit(){var vw=view.clientWidth;img.style.width=Math.round(vw*z)+'px';}
function open(b){last=b;z=1;img.src=b.getAttribute('data-full');img.alt=b.getAttribute('data-alt')||'';raw.href=img.src;lb.hidden=false;document.body.style.overflow='hidden';fit();document.getElementById('wk-lb-close').focus();}
function close(){lb.hidden=true;img.removeAttribute('src');document.body.style.overflow='';if(last)last.focus();}
document.querySelectorAll('.wk-zoom').forEach(function(b){b.addEventListener('click',function(){open(b);});});
document.getElementById('wk-lb-close').addEventListener('click',close);
document.getElementById('wk-lb-in').addEventListener('click',function(){z=Math.min(z*1.6,6);fit();});
document.getElementById('wk-lb-out').addEventListener('click',function(){z=Math.max(z/1.6,1);fit();});
view.addEventListener('click',function(e){if(e.target===view)close();});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!lb.hidden)close();});window.addEventListener('resize',function(){if(!lb.hidden)fit();});})();`;

export function page({ req, title, desc, canonicalPath, ogImage, ogType = "website", robots, jsonld = [], body, preview = false }) {
  const c = chrome();
  const base = siteUrl(req);
  const canonical = canonicalPath ? base + canonicalPath : "";
  const og = ogImage ? (ogImage.startsWith("http") ? ogImage : base + ogImage) : base + "/ogp.png";
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${robots ? `<meta name="robots" content="${robots}">\n` : ""}${canonical && !preview ? `<link rel="canonical" href="${esc(canonical)}">\n` : ""}${preview ? "" : `<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">\n` : ""}<meta property="og:image" content="${esc(og)}">
<meta name="twitter:card" content="summary_large_image">
`}<meta name="theme-color" content="#F4F4F2">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${c.fonts}
<style>
${c.css}
${WORKS_CSS}
</style>
${preview ? "" : jsonld.map(jsonLd).join("\n")}
</head>
<body>
${preview ? '<div class="wk-preview-bar">プレビュー（一般には公開されていません）</div>\n' : ""}${c.header}
<main>
${body}
</main>
${c.footer}
${LIGHTBOX_HTML}
<script>
${c.menu_js}${LIGHTBOX_JS}
</script>
</body>
</html>
`;
}

function breadcrumb(items) {
  return `<nav class="wk-crumb" aria-label="パンくずリスト"><ol>${items.map((it, i) =>
    `<li>${it.href && i < items.length - 1 ? `<a href="${it.href}">${esc(it.name)}</a>` : `<span aria-current="page">${esc(it.name)}</span>`}</li>`).join("")}</ol></nav>`;
}
function breadcrumbLd(base, items) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: base + it.href })) };
}

export function card(s, { headingLevel = 3 } = {}) {
  const cats = (s.categories || []).map(catName).filter(Boolean);
  const thumb = s.thumb?.key
    ? `<div class="wk-thumb"><img src="${mediaUrl(s.thumb.key)}"${s.thumb.w ? ` width="${s.thumb.w}" height="${s.thumb.h}"` : ""} alt="" loading="lazy" decoding="async"></div>`
    : `<div class="wk-thumb none" aria-hidden="true">WORKS</div>`;
  return `<a class="wk-card" href="/branding/works/${s.slug}/">${thumb}<div class="wk-card-body">
${cats.length ? `<ul class="wk-chips">${cats.map((c) => `<li class="wk-chip">${esc(c)}</li>`).join("")}</ul>` : ""}
<h${headingLevel} class="wk-card-title">${esc(s.title)}</h${headingLevel}>
${s.summary ? `<p class="wk-card-sum">${esc(s.summary)}</p>` : ""}
<time class="wk-card-date" datetime="${esc(s.publishAt)}">${fmtDate(s.publishAt)}</time>
</div></a>`;
}

export function publicList(idx, now = Date.now()) {
  return sortByPublishDesc(idx.posts.filter((s) => isPublic(s, now)));
}

// ---- /branding/ (existing page + latest works) ----
export function renderBranding(idx) {
  const latest = publicList(idx).slice(0, 3);
  const section = `<section id="works" style="padding: 88px 24px; background: #FFFFFF; border-top: 1px solid #E2E2DE">
<div style="max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px">
<p class="lbl">WORKS &amp; CASE STUDIES</p>
<h2 class="h2">参考実例</h2>
<p style="margin: 0; color: #6B6B6B; line-height: 1.9">企業の背景や想いを理解し、全体設計から実行まで伴走した事例を紹介しています。</p>
${latest.length ? `<div class="wk-grid three">${latest.map((s) => card(s)).join("\n")}</div>` : ""}
<a class="wk-btn" href="/branding/works/" style="align-self: flex-start">参考実例を見る <span aria-hidden="true">→</span></a>
</div>
</section>`;
  // Also a jump link right under the page title so the works are reachable without scrolling.
  const lead = '<a href="#works" style="min-height: 44px; display: inline-flex; align-items: center; gap: 8px; font-size: 15px; letter-spacing: 0.08em">参考実例を見る <span aria-hidden="true">↓</span></a>\n</div>\n</section>';
  let html = brandingTemplate().replace("<!--WORKS_LATEST-->", section);
  const i = html.indexOf("全体設計から実行まで伴走する。</p>");
  if (i > 0) { const j = html.indexOf("</div>\n</section>", i); if (j > 0) html = html.slice(0, j) + lead + html.slice(j + "</div>\n</section>".length); }
  return html.replace("</style>", WORKS_CSS + "</style>");
}

// ---- /branding/works/ ----
export function renderList(req, idx, { category, page: pageNo }) {
  const base = siteUrl(req);
  const all = publicList(idx);
  const usedCats = CATEGORIES.filter((c) => all.some((s) => s.categories?.includes(c.id)));
  const filtered = category ? all.filter((s) => s.categories?.includes(category)) : all;
  const PER = 12;
  const pages = Math.max(1, Math.ceil(filtered.length / PER));
  if (pageNo > pages) return null;
  const items = filtered.slice((pageNo - 1) * PER, pageNo * PER);
  const qs = (p, c = category) => { const q = new URLSearchParams(); if (c) q.set("category", c); if (p > 1) q.set("page", p); const s = q.toString(); return "/branding/works/" + (s ? "?" + s : ""); };
  const crumbs = [{ name: "ホーム", href: "/" }, { name: "BRANDING", href: "/branding/" }, { name: "参考実例", href: "/branding/works/" }];
  const body = `${breadcrumb(crumbs)}
<section style="padding: 48px 0 32px"><div class="wk-wrap" style="display:flex;flex-direction:column;gap:14px">
<p class="wk-lbl">WORKS &amp; CASE STUDIES</p>
<h1 class="wk-h1" style="font-size:clamp(28px,7vw,44px)">参考実例</h1>
<p style="margin:0;color:#6B6B6B;line-height:1.9">企業や経営者の課題を聞き、誰に何を伝えるかを整理し、ホームページやSNSの全体設計から実行まで伴走した事例です。</p>
${usedCats.length > 1 ? `<nav aria-label="分類で絞り込む"><ul class="wk-filter"><li><a href="/branding/works/"${!category ? ' aria-current="page"' : ""}>すべて</a></li>${usedCats.map((c) => `<li><a href="${qs(1, c.id)}"${category === c.id ? ' aria-current="page"' : ""}>${esc(c.name)}</a></li>`).join("")}</ul></nav>` : ""}
</div></section>
<section style="padding: 0 0 96px"><div class="wk-wrap">
${items.length ? `<div class="wk-grid three">${items.map((s) => card(s, { headingLevel: 2 })).join("\n")}</div>` : `<p style="padding:48px 0;color:#6B6B6B;text-align:center">参考実例は準備中です。</p>`}
${pages > 1 ? `<nav class="wk-pager" aria-label="ページ送り">${pageNo > 1 ? `<a class="wk-btn" href="${qs(pageNo - 1)}">← 新しい実例</a>` : "<span></span>"}${pageNo < pages ? `<a class="wk-btn" href="${qs(pageNo + 1)}">以前の実例 →</a>` : ""}</nav>` : ""}
<div style="margin-top:56px;display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center">
<p style="margin:0;font-family:'Shippori Mincho',serif;font-size:19px;line-height:1.8;letter-spacing:.08em">ホームページやSNSの活用について、<br>まずは会社のことを聞かせてください。</p>
<a class="wk-cta" href="/?area=branding#contact">ホームページ・SNSの活用を相談する</a>
</div></div></section>`;
  const catLabel = category ? catName(category) : "";
  return page({
    req, body,
    title: `参考実例${catLabel ? `（${catLabel}）` : ""}${pageNo > 1 ? `（${pageNo}ページ目）` : ""} | BRANDING | FUMIYA STYLE`,
    desc: "FUMIYA STYLEの参考実例。企業の背景や想いを理解し、ホームページ・SNSの役割と導線の設計から制作・運用まで伴走した事例を紹介します。",
    canonicalPath: category ? "/branding/works/" : qs(pageNo, null),
    robots: category ? "noindex, follow" : "",
    jsonld: [breadcrumbLd(base, crumbs)],
  });
}

// ---- article ----
export function renderArticle(req, p, idx, { preview = false, placeholders = false } = {}) {
  const base = siteUrl(req);
  const path_ = `/branding/works/${p.slug}/`;
  const cats = (p.categories || []).map(catName).filter(Boolean);
  const crumbs = [{ name: "ホーム", href: "/" }, { name: "BRANDING", href: "/branding/" }, { name: "参考実例", href: "/branding/works/" }, { name: p.title || "（無題）", href: path_ }];
  const updated = p.contentUpdatedAt && Date.parse(p.contentUpdatedAt) - Date.parse(p.publishAt) > 864e5 ? p.contentUpdatedAt : null;
  const sec = (h, inner) => (inner ? `<section class="wk-sec"><h2 class="wk-h2">${h}</h2>${inner}</section>` : "");
  const textSec = (h, t) => (String(t || "").trim() ? sec(h, `<div class="wk-body">${fmtText(t)}</div>`) : "");

  const hero = p.hero?.key ? `<figure class="wk-fig" style="margin:32px 0 0">${zoomable(p.hero, "メイン画像", { eager: true })}</figure>` : placeholders ? `<div style="margin-top:32px">${placeholder("メイン画像")}</div>` : "";

  let diagram = "";
  const dText = String(p.diagram?.text || "").trim();
  if (p.diagram?.key || dText || placeholders) {
    const fig = p.diagram?.key
      ? `<figure class="wk-fig">${zoomable(p.diagram, "構造図")}<figcaption>図をタップすると拡大できます</figcaption></figure>
<div class="wk-diagram-tools"><a class="wk-btn" href="${mediaUrl(p.diagram.key)}" target="_blank" rel="noopener">構造図を画像で開く</a></div>`
      : placeholders ? placeholder("構造図") : "";
    diagram = sec("全体設計・構造図", `${fig}${dText ? `<div class="wk-body" style="margin-top:20px">${fmtText(dText)}</div>` : ""}`);
  }

  let ba = "";
  const baItem = (img, label, cls) => img?.key
    ? `<figure class="wk-ba-item"><span class="wk-ba-lbl ${cls}">${label}</span><div class="wk-ba-box">${zoomable(img, label, { sizes: "(min-width: 768px) 500px, 100vw" })}</div></figure>`
    : placeholders ? `<figure class="wk-ba-item"><span class="wk-ba-lbl ${cls}">${label}</span>${placeholder(label + "画像")}</figure>` : "";
  const b1 = baItem(p.before, "BEFORE", "before"), b2 = baItem(p.after, "AFTER", "after");
  if (b1 || b2) ba = sec("Before / After", `<div class="wk-ba${b1 && b2 ? " two" : ""}">${b1}${b2}</div>`);

  const gallery = (p.gallery || []).length ? sec("写真", (p.gallery || []).map((g) => `<figure class="wk-fig" style="margin-bottom:24px">${zoomable(g, g.caption || "写真")}${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ""}</figure>`).join("")) : "";

  const roles = [...(p.roles || []), ...String(p.rolesOther || "").split(/[、,／/]/).map((s) => s.trim()).filter(Boolean)];
  const team = String(p.team || "").trim();
  const rolesSec = roles.length || team ? sec("担当範囲・制作体制", `<dl class="wk-roles">${roles.length ? `<dt>FUMIYA STYLEの担当</dt><dd><ul class="wk-chips">${roles.map((r) => `<li class="wk-chip">${esc(r)}</li>`).join("")}</ul></dd>` : ""}${team ? `<dt>制作体制</dt><dd class="wk-body">${fmtText(team)}</dd>` : ""}</dl>`) : "";

  const related = sortByPublishDesc(idx.posts.filter((s) => isPublic(s) && s.id !== p.id))
    .map((s) => ({ s, score: (s.categories || []).filter((c) => (p.categories || []).includes(c)).length }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.s);
  const relatedSec = related.length ? `<section class="wk-sec"><h2 class="wk-h2">関連する参考実例</h2><div class="wk-grid three">${related.map((s) => card(s)).join("")}</div></section>` : "";

  const body = `${breadcrumb(crumbs)}
<article style="padding: 32px 0 96px"><div class="wk-wrap">
<header style="display:flex;flex-direction:column;gap:14px">
<p class="wk-lbl">WORKS &amp; CASE STUDIES</p>
<h1 class="wk-h1">${esc(p.title || "（タイトル未入力）")}</h1>
${cats.length || p.progress ? `<ul class="wk-chips">${p.progress ? `<li class="wk-badge">${esc(p.progress)}</li>` : ""}${cats.map((c) => `<li class="wk-chip">${esc(c)}</li>`).join("")}</ul>` : ""}
<p class="wk-meta"><span>公開日 <time datetime="${esc(p.publishAt)}">${fmtDate(p.publishAt)}</time></span>${updated ? `<span>更新日 <time datetime="${esc(updated)}">${fmtDate(updated)}</time></span>` : ""}${p.period ? `<span>実施時期 ${fmtPeriod(p.period)}</span>` : ""}</p>
</header>
${String(p.intro || "").trim() ? `<div class="wk-body" style="margin-top:24px">${fmtText(p.intro)}</div>` : ""}
${hero}
${textSec("相談の背景・目的", p.background)}
${diagram}
${textSec("取り組んだ内容", p.work)}
${ba}
${gallery}
${textSec("工夫した点", p.ideas)}
${textSec("現在の状況", p.current)}
${rolesSec}
<div style="margin:64px 0 0;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center">
<p style="margin:0;font-family:'Shippori Mincho',serif;font-size:18px;line-height:1.8;letter-spacing:.06em">同じようなお悩みがあれば、<br>お気軽にご相談ください。</p>
<a class="wk-cta" href="/?area=branding&amp;from=${encodeURIComponent(p.slug)}#contact">ホームページ・SNSの活用を相談する</a>
</div>
${relatedSec}
<p style="margin-top:48px"><a href="/branding/works/" style="min-height:44px;display:inline-flex;align-items:center">← 参考実例の一覧へ</a></p>
</div></article>`;

  const desc = p.seoDesc || clip(p.summary || p.intro || p.background || p.work || "", 120) || autoSummary(p);
  const ogImg = p.hero?.key ? mediaUrl(p.hero.key) : "";
  const ld = {
    "@context": "https://schema.org", "@type": "BlogPosting",
    headline: clip(p.title, 110), description: desc,
    datePublished: p.publishAt, dateModified: p.contentUpdatedAt || p.publishAt,
    mainEntityOfPage: base + path_, url: base + path_,
    author: { "@type": "Person", name: AUTHOR, url: base + "/" },
    publisher: { "@type": "Organization", name: SITE_NAME, url: base + "/" },
    inLanguage: "ja",
  };
  if (ogImg) ld.image = [base + ogImg];
  if (cats.length) ld.keywords = cats.join(", ");
  return page({
    req, body, preview,
    title: p.seoTitle || `${p.title} | 参考実例 | FUMIYA STYLE`,
    desc, canonicalPath: path_, ogImage: ogImg, ogType: "article",
    robots: preview ? "noindex, nofollow" : "",
    jsonld: [ld, breadcrumbLd(base, crumbs)],
  });
}

export function renderNotFound(req) {
  return page({ req, title: "ページが見つかりません | FUMIYA STYLE", desc: "お探しのページは見つかりませんでした。", robots: "noindex",
    body: `<section style="padding:120px 20px;text-align:center"><p class="wk-lbl">404 NOT FOUND</p><h1 class="wk-h1" style="margin-top:16px">お探しのページは見つかりませんでした。</h1><p style="margin-top:32px"><a class="wk-btn" href="/branding/works/">参考実例の一覧へ</a></p></section>` });
}

export function renderSitemap(req, idx) {
  const base = siteUrl(req);
  const urls = [...chrome().static_pages.map((p) => ({ loc: base + p })), { loc: base + "/branding/works/" },
    ...publicList(idx).map((s) => ({ loc: `${base}/branding/works/${s.slug}/`, lastmod: s.contentUpdatedAt || s.publishAt }))];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;
}
