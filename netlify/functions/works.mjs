// Public pages: /branding/, /branding/works/, /branding/works/<slug>/, /sitemap.xml
// Only published, non-sample posts whose publish time has passed are visible.
import { CATEGORIES, getPost, isPublic, loadIndex, stores } from "./_lib/core.mjs";
import { renderArticle, renderBranding, renderList, renderNotFound, renderSitemap } from "./_lib/render.mjs";

const PUBLIC_CACHE = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  // Short CDN TTL so scheduled posts appear within minutes; edits purge the "works" tag.
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=300, stale-while-revalidate=60",
};
const html = (body, status = 200, extra = {}) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...PUBLIC_CACHE, "Netlify-Cache-Tag": "works", ...extra } });
const redirect = (to, status = 301) => new Response(null, { status, headers: { Location: to, ...PUBLIC_CACHE, "Netlify-Cache-Tag": "works" } });

export default async (req, context) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method Not Allowed", { status: 405 });
  const url = new URL(req.url);
  const p = url.pathname;
  const st = stores(context);
  const idx = await loadIndex(st);

  if (p === "/sitemap.xml") {
    return new Response(renderSitemap(req, idx), { headers: { "Content-Type": "application/xml; charset=utf-8", ...PUBLIC_CACHE, "Netlify-Cache-Tag": "works" } });
  }
  if (p === "/branding") return redirect("/branding/");
  if (p === "/branding/") return html(renderBranding(idx));
  if (p === "/branding/works") return redirect("/branding/works/");
  if (p === "/branding/works/") {
    const cat = url.searchParams.get("category");
    const category = CATEGORIES.some((c) => c.id === cat) ? cat : "";
    const pageNo = Math.max(1, Math.min(999, parseInt(url.searchParams.get("page") || "1", 10) || 1));
    const out = renderList(req, idx, { category, page: pageNo });
    return out ? html(out) : html(renderNotFound(req), 404);
  }
  const m = /^\/branding\/works\/([a-z0-9-]+)(\/?)$/.exec(p);
  if (m) {
    const slug = m[1];
    const s = idx.posts.find((x) => x.slug === slug && isPublic(x));
    if (s) {
      if (!m[2]) return redirect(`/branding/works/${slug}/`);
      const post = await getPost(st, s.id);
      if (post && isPublic(post)) return html(renderArticle(req, post, idx), 200, { "Netlify-Cache-Tag": `works,post-${post.id}` });
    }
    // Old URL after a slug change → permanent redirect to the current URL.
    const movedId = idx.redirects[slug];
    const moved = movedId && idx.posts.find((x) => x.id === movedId && isPublic(x));
    if (moved) return redirect(`/branding/works/${moved.slug}/`);
  }
  return html(renderNotFound(req), 404, { "Netlify-CDN-Cache-Control": "public, s-maxage=60" });
};

export const config = {
  path: ["/branding", "/branding/", "/branding/works", "/branding/works/", "/branding/works/*", "/sitemap.xml"],
};
