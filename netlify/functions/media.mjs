// Images for 参考実例. An image is public only while the post that owns it is
// publicly visible; otherwise only a logged-in administrator can load it.
import { isAdmin } from "./_lib/auth.mjs";
import { MEDIA_KEY_RE, isPublic, loadIndex, stores } from "./_lib/core.mjs";

export default async (req, context) => {
  const key = decodeURIComponent(new URL(req.url).pathname.replace(/^\/media\//, ""));
  const notFound = () => new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!MEDIA_KEY_RE.test(key)) return notFound();
  const st = stores(context);
  const res = await st.media.getWithMetadata(key, { type: "arrayBuffer" });
  if (!res) return notFound();
  const meta = res.metadata || {};
  const idx = await loadIndex(st);
  const owner = idx.posts.find((s) => s.id === meta.postId);
  const visible = owner && isPublic(owner) && (owner.media || []).includes(key);
  if (!visible && !isAdmin(req)) return notFound();
  const headers = { "Content-Type": meta.contentType || "image/jpeg", "X-Content-Type-Options": "nosniff" };
  if (visible) {
    Object.assign(headers, {
      "Cache-Control": "public, max-age=86400",
      "Netlify-CDN-Cache-Control": "public, durable, s-maxage=2592000",
      "Netlify-Cache-Tag": `media,post-${owner.id}`,
    });
  } else {
    headers["Cache-Control"] = "private, no-store";
  }
  return new Response(res.data, { headers });
};

export const config = { path: "/media/*" };
