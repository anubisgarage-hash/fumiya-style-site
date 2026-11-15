// End-to-end check of the admin at iPhone size against tools/dev-server.mjs.
// node tests/e2e-mobile.mjs <base> <imgdir> <shotdir>
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import assert from "node:assert/strict";

const [BASE = "http://localhost:8787", IMG, SHOT] = process.argv.slice(2);
const PW = "test-pass-1234";
const log = (...a) => console.log("✓", ...a);
const b = await chromium.launch();
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

async function login(page) {
  await page.goto(BASE + "/admin/");
  await page.fill("#pw", PW);
  await page.click("#lb");
  await page.waitForSelector("text=参考実例の管理");
}
const ctx = await b.newContext(mobile);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
await login(page);
log("login");

await page.click("#fromSample");
await page.waitForSelector("#f-title");
const editUrl = page.url();
const postId = editUrl.split("/").pop();
assert.ok(!(await page.inputValue("#f-title")).startsWith("【サンプル】"));
log("duplicated sample → draft editor", postId);

await page.fill("#f-title", "春日井市の製造業様｜ホームページ制作・SNS活用支援");
await page.fill("[data-k=background]", "採用と取引先への発信を強化したいというご相談でした。");
await page.fill("[data-k=intro]", "春日井市の製造業様に、ホームページとSNSの役割整理から支援しています。");
await page.fill("[data-k=summary]", "");
// without an on-screen keyboard the save buttons must stay visible while a field has focus
await page.focus("[data-k=work]");
await page.waitForTimeout(400);
assert.ok(await page.isVisible("#aSave"));
await page.fill("[data-k=work]", "・取材と現状整理\n・構造図の作成");
log("text edited; buttons stay reachable while a field is focused");

async function upload(slot, file) {
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click(`[data-pick=${slot}]`)]);
  await fc.setFiles(file);
  await page.waitForSelector(`#slot-${slot} img.pv`);
  await page.waitForFunction((s) => !document.querySelector(`#slot-${s} .bar`), slot, { timeout: 20000 });
}
await upload("hero", IMG + "/photo_rot.jpg");
await upload("diagram", IMG + "/diagram.png");
await upload("before", IMG + "/before_tall.jpg");
const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("#gAdd")]);
await fc.setFiles([IMG + "/before_tall.jpg", IMG + "/photo_rot.jpg"]);
await page.waitForFunction(() => document.querySelectorAll("#gallery .g-item img[src^='/media/']").length === 2, null, { timeout: 20000 });
await page.click("[data-gdown='0']"); // reorder
await page.fill("[data-alt=hero]", "工場の外観");
log("images uploaded (hero, diagram, before, 2 gallery) and reordered");

const model = await page.evaluate(async (id) => (await (await fetch("/api/admin/posts/" + id)).json()).post, postId);
// date: past date via datetime-local
await page.fill("#f-date", "2025-09-10T14:30");
await page.dispatchEvent("#f-date", "change");
await page.click("#aSave");
await page.waitForFunction(() => document.querySelector("#st").textContent === "保存済み", null, { timeout: 15000 });
const saved = await page.evaluate(async (id) => (await (await fetch("/api/admin/posts/" + id)).json()).post, postId);
assert.equal(saved.publishAt, "2025-09-10T05:30:00.000Z", "JST 14:30 → UTC 05:30");
assert.equal(saved.gallery.length, 2);
assert.equal(saved.hero.alt, "工場の外観");
assert.equal(saved.slug, model.slug, "date change keeps URL");
log("draft saved with JST date", saved.publishAt);

// stored hero: rotated upright, no EXIF/GPS
const heroInfo = await page.evaluate(async (k) => { const r = await fetch("/media/" + k); const buf = new Uint8Array(await r.arrayBuffer()); let exif = false; for (let i = 0; i < buf.length - 4; i++) if (buf[i] === 0x45 && buf[i + 1] === 0x78 && buf[i + 2] === 0x69 && buf[i + 3] === 0x66) { exif = true; break; } return { exif, type: r.headers.get("content-type") }; }, saved.hero.key);
assert.equal(heroInfo.exif, false, "EXIF/GPS stripped");
assert.ok(saved.hero.h > saved.hero.w, `orientation applied (${saved.hero.w}x${saved.hero.h})`);
assert.ok(saved.diagram.w >= 2400, "diagram kept at high resolution");
log("hero rotated upright", `${saved.hero.w}x${saved.hero.h}`, "no EXIF; diagram", `${saved.diagram.w}x${saved.diagram.h}`);

// preview
await page.click("#aPrev");
await page.waitForSelector(".overlay iframe");
const frame = page.frameLocator(".overlay iframe");
await frame.locator("text=BEFORE").first().waitFor();
assert.equal(await frame.locator(".wk-ba-lbl.after").count(), 0, "After hidden when missing");
await page.waitForTimeout(800);
await page.screenshot({ path: SHOT + "/admin-preview.png" });
await page.click("#pvClose");
log("preview renders draft (Before only)");

// another device sees the saved draft
const ctx2 = await b.newContext(mobile);
const page2 = await ctx2.newPage();
await login(page2);
await page2.waitForSelector(`text=春日井市の製造業様`);
log("other device sees saved draft");

// save failure keeps input
await page.route("**/api/admin/posts/" + postId, (r) => r.abort());
await page.fill("[data-k=ideas]", "失敗時も消えないテキスト");
await page.click("#aSave");
await page.waitForSelector("#formErr #retry");
assert.equal(await page.inputValue("[data-k=ideas]"), "失敗時も消えないテキスト");
await page.unroute("**/api/admin/posts/" + postId);
await page.click("#retry");
await page.waitForFunction(() => document.querySelector("#st").textContent === "保存済み", null, { timeout: 15000 });
log("save failure shows retry and keeps input; retry succeeds");

// publish blocked by leftover guidance, then clear and publish
await page.click("#aPub");
await page.waitForSelector("#formErr:has-text('案内文')");
for (const k of ["current", "team"]) await page.click(`[data-clear=${k}]`);
await page.fill("[data-k='diagram.text']", "ホームページを拠点に、SNSから問い合わせへつなぐ流れを整理。");
await page.click("#aPub");
await page.waitForSelector("text=変更を公開", { timeout: 15000 });
log("guidance blocked publish; after clearing, published");

const slug = (await page.evaluate(async (id) => (await (await fetch("/api/admin/posts/" + id)).json()).post, postId)).slug;
const pub = await b.newContext(mobile);
const pp = await pub.newPage();
let r = await pp.goto(`${BASE}/branding/works/${slug}/`);
assert.equal(r.status(), 200);
await pp.waitForTimeout(400);
assert.equal(await pp.evaluate(() => document.documentElement.scrollWidth), 390, "no horizontal overflow");
await pp.screenshot({ path: SHOT + "/article-390.png", fullPage: true });
// lightbox open/close
await pp.click(".wk-sec .wk-zoom >> nth=0");
await pp.waitForSelector("#wk-lb:not([hidden])");
await pp.click("#wk-lb-in");
await pp.screenshot({ path: SHOT + "/lightbox.png" });
await pp.click("#wk-lb-close");
assert.ok(await pp.locator("#wk-lb[hidden]").count());
log("public article OK, lightbox zoom/close OK");

r = await pp.goto(`${BASE}/branding/works/`);
await pp.screenshot({ path: SHOT + "/list-390.png", fullPage: true });
assert.equal(await pp.evaluate(() => document.documentElement.scrollWidth), 390);
await pp.click(`a.wk-card[href="/branding/works/${slug}/"]`);
await pp.waitForURL(`**/branding/works/${slug}/`);
log("list card → detail");

// contact handoff
await pp.click("a.wk-cta");
await pp.waitForURL(/area=branding/);
assert.equal(await pp.isChecked('input[name="area_branding"]'), true);
assert.equal(await pp.inputValue("#fs-source"), `/branding/works/${slug}/`);
log("CTA preselects BRANDING and carries article URL");

const desk = await b.newContext({ viewport: { width: 1440, height: 900 } });
const dp = await desk.newPage();
await dp.goto(`${BASE}/branding/works/${slug}/`);
await dp.waitForTimeout(300);
await dp.screenshot({ path: SHOT + "/article-1440.png", fullPage: true });
await dp.goto(`${BASE}/branding/`);
await dp.screenshot({ path: SHOT + "/branding-1440.png", fullPage: true });
await dp.goto(`${BASE}/`);
await dp.evaluate(() => document.querySelector("#business").scrollIntoView());
await dp.waitForTimeout(300);
await dp.screenshot({ path: SHOT + "/top-business-1440.png" });
await pp.goto(`${BASE}/`);
await pp.evaluate(() => document.querySelector("#business").scrollIntoView());
await pp.waitForTimeout(300);
await pp.screenshot({ path: SHOT + "/top-business-390.png" });
assert.equal(await pp.evaluate(() => document.documentElement.scrollWidth), 390);

// unpublish from the ⋯ menu
await page.click("#more");
await page.click("text=非公開にする（下書きに戻す）");
await page.waitForSelector("#aSave", { timeout: 15000 });
r = await pp.goto(`${BASE}/branding/works/${slug}/`);
assert.equal(r.status(), 404);
log("unpublished → 404");

// long title + no images in list
await page.screenshot({ path: SHOT + "/admin-editor.png", fullPage: false });
assert.deepEqual(errors, []);
log("no page errors");
await b.close();
