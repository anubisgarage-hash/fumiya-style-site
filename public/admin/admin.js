/* 参考実例の管理画面 — iPhone-first, no build step.
   Data lives on the server (Netlify Blobs) via /api/admin/*. localStorage is
   used only as a safety copy of unsaved edits on this device. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $("#app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));

  let META = null, CUR = null, MODEL = null, DIRTY = false, BUSY = false, EDITS = 0, uploads = 0, autosaveT = null;
  let listFilter = "all";
  const pending = {}; // transient upload state per image slot

  // ---------- helpers ----------
  function toast(msg, ms = 2600) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
  }
  async function api(path, { method = "GET", body } = {}) {
    let res;
    try {
      res = await fetch("/api/admin/" + path, {
        method, credentials: "same-origin",
        headers: body !== undefined ? { "Content-Type": "application/json" } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw Object.assign(new Error("通信に失敗しました。電波の状態を確認して、もう一度お試しください。"), { network: true });
    }
    const isJson = (res.headers.get("content-type") || "").includes("json");
    const data = isJson ? await res.json().catch(() => ({})) : await res.text();
    if (res.status === 401 && path !== "login") { showLogin(true); throw Object.assign(new Error("ログインが必要です。"), { status: 401 }); }
    if (!res.ok) throw Object.assign(new Error((data && data.error) || "エラーが発生しました（" + res.status + "）"), { status: res.status, data });
    return data;
  }
  const JST = 9 * 3600e3;
  const isoToLocal = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t + JST).toISOString().slice(0, 16) : ""; };
  const localToIso = (v) => { const t = Date.parse(v + ":00+09:00"); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
  const fmt = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return ""; const d = new Date(t + JST); return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
  function badge(p, now = Date.now()) {
    if (p.isSample) return '<span class="badge sample">サンプル</span>';
    if (p.status !== "published") return '<span class="badge draft">下書き</span>';
    if (Date.parse(p.publishAt) > now) return '<span class="badge sched">予約</span>';
    return '<span class="badge pub">公開中</span>';
  }
  function newId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // ---------- leaving with unsaved changes ----------
  window.addEventListener("beforeunload", (e) => { if (DIRTY || uploads) { e.preventDefault(); e.returnValue = ""; } });
  let skipHash = false;
  window.addEventListener("hashchange", () => {
    if (skipHash) { skipHash = false; return; }
    if (CUR && (DIRTY || uploads) && !confirm("保存していない変更があります。このまま移動しますか？\n（この端末には一時的に控えが残ります）")) {
      skipHash = true; history.back(); return;
    }
    route();
  });
  // Hide the bottom buttons only while the on-screen keyboard is actually open,
  // so they never cover the text being typed (iPhone shrinks the visual viewport).
  const FIELD = "input:not([type=checkbox]):not([type=file]),textarea";
  function keyboardCheck() {
    const vv = window.visualViewport;
    const kbOpen = !!vv && window.innerHeight - vv.height > 150;
    const a = document.activeElement;
    document.body.classList.toggle("typing", kbOpen && !!a && a.matches(FIELD));
  }
  window.visualViewport && window.visualViewport.addEventListener("resize", keyboardCheck);
  document.addEventListener("focusin", () => setTimeout(keyboardCheck, 300));
  document.addEventListener("focusout", () => setTimeout(keyboardCheck, 150));

  // ---------- boot / login ----------
  async function boot() {
    let s;
    try { s = await api("session"); } catch (e) { app.innerHTML = `<div class="wrap"><p class="notice warn">${esc(e.message)}</p><button class="btn" onclick="location.reload()">再読み込み</button></div>`; return; }
    if (!s.configured) { app.innerHTML = `<div class="wrap" style="padding-top:48px"><h1>参考実例の管理</h1><p class="notice warn">管理画面のパスワードがまだ設定されていません。Netlifyの「Environment variables」に <b>ADMIN_PASSWORD</b>（8文字以上）を設定し、サイトを再デプロイしてください。</p></div>`; return; }
    if (!s.loggedIn) { showLogin(false); return; }
    META = await api("meta");
    route();
  }
  function showLogin(expired) {
    app.innerHTML = `<div class="wrap" style="padding-top:56px;max-width:420px">
<p class="muted small" style="letter-spacing:.3em">FUMIYA STYLE</p><h1 style="margin:4px 0 20px;font-size:22px">参考実例の管理</h1>
${expired ? '<p class="notice">ログインの有効期限が切れました。もう一度ログインしてください。編集中の内容はこの端末に控えてあります。</p>' : ""}
<form id="lf"><label class="f" for="pw">パスワード</label><input class="in" id="pw" type="password" autocomplete="current-password" required>
<p class="err" id="lerr" role="alert"></p><button class="btn primary block" id="lb" style="margin-top:12px">ログイン</button></form></div>`;
    $("#lf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = $("#lb"); b.disabled = true; $("#lerr").textContent = "";
      try { await api("login", { method: "POST", body: { password: $("#pw").value } }); META = await api("meta"); route(); }
      catch (err) { $("#lerr").textContent = err.message; b.disabled = false; }
    });
  }

  function route() {
    clearTimeout(autosaveT);
    const h = location.hash;
    const m = /^#\/edit\/([0-9a-f-]{36})$/.exec(h);
    if (m) return viewEdit(m[1]);
    CUR = MODEL = null; DIRTY = false;
    if (h === "#/backup") return viewBackup();
    return viewList();
  }

  // ---------- list ----------
  async function viewList() {
    app.innerHTML = '<p class="center muted" style="padding:64px 16px">読み込み中…</p>';
    let d;
    try { d = await api("posts"); } catch (e) { app.innerHTML = `<div class="wrap"><p class="notice warn">${esc(e.message)}</p><button class="btn" id="rt">再試行</button></div>`; $("#rt") && ($("#rt").onclick = viewList); return; }
    const now = Date.parse(d.now);
    const f = { all: () => true, draft: (p) => p.status !== "published", pub: (p) => p.status === "published" && Date.parse(p.publishAt) <= now, sched: (p) => p.status === "published" && Date.parse(p.publishAt) > now };
    const items = d.posts.filter(f[listFilter]);
    app.innerHTML = `<header class="top"><div class="wrap"><h1>参考実例の管理</h1><button class="iconbtn" id="menu" aria-label="メニュー">⋯</button></div></header>
<div class="wrap">
<div style="display:flex;gap:8px;margin-top:16px"><button class="btn primary" style="flex:1" id="fromSample">サンプルから作成</button><button class="btn" style="flex:1" id="blank">白紙から作成</button></div>
${d.sample ? `<button class="list-item" data-id="${d.sample.id}" style="margin-top:16px"><span class="noimg"></span><span style="flex:1;min-width:0">${badge(d.sample)}<span class="small muted">ひな形・一般公開されません</span><span class="t">${esc(d.sample.title)}</span></span></button>` : ""}
<div class="tabs" role="group" aria-label="絞り込み" style="margin-top:20px">${[["all", "すべて"], ["draft", "下書き"], ["pub", "公開中"], ["sched", "予約"]].map(([k, l]) => `<button class="btn sm" data-f="${k}" aria-pressed="${listFilter === k}">${l}</button>`).join("")}</div>
${items.length ? items.map((p) => `<button class="list-item" data-id="${p.id}">${p.thumb ? `<img src="/media/${esc(p.thumb.key)}" alt="">` : '<span class="noimg"></span>'}<span style="flex:1;min-width:0">${badge(p, now)}<span class="small muted">${fmt(p.publishAt)}</span><span class="t">${esc(p.title || "（タイトル未入力）")}</span></span></button>`).join("")
        : `<p class="muted center" style="padding:32px 0">${listFilter === "all" ? "まだ記事がありません。「サンプルから作成」で始めましょう。" : "該当する記事はありません。"}</p>`}
<p class="small muted center" style="margin:32px 0"><a href="/branding/works/" target="_blank" rel="noopener">公開ページを見る</a></p>
</div>`;
    $$(".list-item").forEach((b) => b.onclick = () => (location.hash = "#/edit/" + b.dataset.id));
    $$("[data-f]").forEach((b) => b.onclick = () => { listFilter = b.dataset.f; viewList(); });
    $("#fromSample").onclick = (e) => d.sample && createPost(d.sample.id, e.currentTarget);
    $("#blank").onclick = (e) => createPost(null, e.currentTarget);
    $("#menu").onclick = () => sheet([["バックアップ・復元", () => (location.hash = "#/backup")], ["ログアウト", logout]]);
  }
  async function createPost(fromId, btn) {
    if (BUSY) return; BUSY = true; if (btn) btn.disabled = true;
    try { const id = newId(); await api("posts", { method: "POST", body: { id, fromId } }); location.hash = "#/edit/" + id; toast(fromId ? "サンプルを複製しました（下書き）" : "新しい下書きを作りました"); }
    catch (e) { toast(e.message, 4000); }
    finally { BUSY = false; if (btn) btn.disabled = false; }
  }
  async function logout() { try { await api("logout", { method: "POST" }); } catch {} location.hash = ""; showLogin(false); }

  function sheet(items) {
    const el = document.createElement("div");
    el.className = "sheet";
    el.innerHTML = `<div class="in-sheet" role="dialog" aria-label="メニュー">${items.map(([l, , cls], i) => `<button class="btn ${cls || ""}" data-i="${i}">${esc(l)}</button>`).join("")}<button class="btn ghost" data-close>閉じる</button></div>`;
    document.body.appendChild(el);
    el.onclick = (e) => {
      const b = e.target.closest("button");
      if (e.target === el || (b && b.hasAttribute("data-close"))) return el.remove();
      if (b && b.dataset.i) { el.remove(); items[+b.dataset.i][1](); }
    };
  }

  // ---------- backup ----------
  function viewBackup() {
    app.innerHTML = `<header class="top"><div class="wrap"><button class="iconbtn" onclick="location.hash=''" aria-label="戻る">‹</button><h1>バックアップ・復元</h1></div></header>
<div class="wrap"><div class="card"><h2>バックアップを保存</h2><p class="hint">全記事の文章・設定と、画像の一覧（URL）を1つのファイルに保存します。画像そのものはサーバーに残り続けます。</p>
<a class="btn primary block" href="/api/admin/export" download>バックアップをダウンロード</a></div>
<div class="card"><h2>バックアップから復元</h2><p class="hint">保存したファイルを選ぶと、同じ記事は上書き、無い記事は追加されます。</p>
<input type="file" id="imp" accept="application/json,.json" class="in"><p class="err" id="ierr"></p></div></div>`;
    $("#imp").onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      if (!confirm("このバックアップから記事を復元しますか？")) return;
      try { const r = await api("import", { method: "POST", body: JSON.parse(await file.text()) }); toast(`${r.count}件の記事を復元しました`); }
      catch (err) { $("#ierr").textContent = err.message || "読み込めませんでした"; }
    };
  }

  // ---------- editor ----------
  const BK = (id) => "fs-bk-" + id;
  function backupLocal() { try { localStorage.setItem(BK(CUR.id), JSON.stringify({ v: CUR.version, at: Date.now(), model: MODEL })); } catch {} }
  function clearLocal() { try { localStorage.removeItem(BK(CUR.id)); } catch {} }

  async function viewEdit(id) {
    app.innerHTML = '<p class="center muted" style="padding:64px 16px">読み込み中…</p>';
    try { CUR = (await api("posts/" + id)).post; } catch (e) { app.innerHTML = `<div class="wrap"><p class="notice warn">${esc(e.message)}</p><a class="btn" href="#/">一覧へ</a></div>`; return; }
    MODEL = clone(CUR); DIRTY = false; EDITS = 0;
    let restore = null;
    try { const b = JSON.parse(localStorage.getItem(BK(id)) || "null"); if (b && b.v === CUR.version && JSON.stringify(b.model) !== JSON.stringify(CUR)) restore = b; } catch {}
    renderEditor(restore);
  }

  const TEXTS = {
    intro: ["導入文", "記事の最初に表示する2〜3行。どんな会社に何を支援したかを短く。"],
    background: ["相談の背景・目的", "お客様が困っていたこと、目指したいこと。"],
    work: ["取り組んだ内容", "行頭に「・」を付けると箇条書きになります。"],
    ideas: ["工夫した点", "判断の理由や、こだわったところ。"],
    current: ["現在の状況", "構想中・デザイン確認段階・公開済みなど、確認できた事実だけを書きます。"],
  };
  function textArea(k, label, hint, rows = 6) {
    return `<label class="f" for="f-${k}">${label}</label>${hint ? `<p class="hint" style="margin:0 0 6px">${hint}</p>` : ""}<textarea class="in" id="f-${k}" data-k="${k}" rows="${rows}">${esc(k.includes(".") ? (MODEL.diagram || {}).text : MODEL[k])}</textarea><button type="button" class="linkbtn" data-clear="${k}">この項目を空にする（公開ページに表示しない）</button>`;
  }
  function chips(name, list, selected) {
    return `<div class="chips">${list.map((x) => { const id = typeof x === "string" ? x : x.id, l = typeof x === "string" ? x : x.name; return `<label class="chip"><input type="checkbox" data-arr="${name}" value="${esc(id)}"${selected.includes(id) ? " checked" : ""}><span>${esc(l)}</span></label>`; }).join("")}</div>`;
  }

  function renderEditor(restore) {
    const sample = !!CUR.isSample;
    app.innerHTML = `<header class="top"><div class="wrap"><button class="iconbtn" id="back" aria-label="一覧へ戻る">‹</button><h1>${sample ? "サンプル（ひな形）" : "記事を編集"}</h1><span class="status saved" id="st">保存済み</span><button class="iconbtn" id="more" aria-label="その他の操作">⋯</button></div></header>
<div class="wrap">
${restore ? `<div class="notice" id="rs">この端末に、まだ保存されていない編集内容が残っています（${fmt(new Date(restore.at).toISOString())}）。<div style="display:flex;gap:8px;margin-top:8px"><button class="btn sm primary" id="rsy">復元する</button><button class="btn sm" id="rsn">破棄する</button></div></div>` : ""}
${sample ? '<p class="notice">これは記事のひな形です。一般には公開されません。右上の「⋯」→「複製して新しい記事を作る」から使ってください。</p>' : ""}
<div id="stateNote"></div>
<p class="err" id="formErr" role="alert"></p>
<section class="card"><h2>基本情報</h2>
<label class="f" for="f-title">記事タイトル<span class="req">公開に必須</span></label><p class="hint" style="margin:0 0 6px">地域・業種・支援内容が分かる名前にすると、検索でも伝わりやすくなります。</p>
<textarea class="in" id="f-title" data-k="title" rows="2" style="min-height:72px" placeholder="例：豊田市の製造業様｜ホームページ・SNS活用の全体設計">${esc(MODEL.title)}</textarea>
<label class="f">分類（複数選べます）</label>${chips("categories", META.categories, MODEL.categories || [])}
<label class="f" for="f-summary">一覧用の紹介文（任意）</label><p class="hint" style="margin:0 0 6px">空欄なら、導入文や本文の最初から自動で作ります。</p>
<textarea class="in" id="f-summary" data-k="summary" rows="3" style="min-height:90px">${esc(MODEL.summary)}</textarea>
<label class="f" for="f-progress">進行状況（任意）</label><select class="in" id="f-progress" data-k="progress"><option value="">設定しない</option>${META.progress.map((x) => `<option${MODEL.progress === x ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>
<label class="f" for="f-period">事例の実施年月（任意）</label><input class="in" type="month" id="f-period" data-k="period" value="${esc(MODEL.period)}">
<label class="f" for="f-date">公開日時（日本時間）</label><input class="in" type="datetime-local" id="f-date" value="${isoToLocal(MODEL.publishAt)}">
<p class="hint" id="dateHint" style="margin:6px 0 0"></p>
<button type="button" class="linkbtn" id="dateNow">現在の日時にする</button>
</section>
<section class="card"><h2>メイン画像</h2><div id="slot-hero"></div></section>
<section class="card"><h2>本文</h2>
${textArea("intro", ...TEXTS.intro, 4)}
${textArea("background", ...TEXTS.background)}
</section>
<section class="card"><h2>全体設計・構造図</h2><p class="hint">図は一覧では縮小、記事ではタップで拡大できます。画像の文字に頼らず、要点を説明文にも書いてください。</p><div id="slot-diagram"></div>
${textArea("diagram.text", "構造図の説明", "", 5)}
</section>
<section class="card"><h2>取り組んだ内容</h2>${textArea("work", "取り組んだ内容", TEXTS.work[1])}</section>
<section class="card"><h2>Before／After</h2><p class="hint">片方だけでも掲載できます。縦横比が違っても切り取らずに表示します。</p><div id="slot-before"></div><div id="slot-after"></div></section>
<section class="card"><h2>追加の写真</h2><div id="gallery"></div><button type="button" class="btn block" id="gAdd" style="margin-top:12px">＋ 写真を追加</button></section>
<section class="card"><h2>工夫した点・現在の状況</h2>${textArea("ideas", ...TEXTS.ideas)}${textArea("current", ...TEXTS.current, 4)}</section>
<section class="card"><h2>担当範囲・制作体制</h2><p class="hint">実際に担当した項目だけを選んでください。</p>${chips("roles", META.roles, MODEL.roles || [])}
<label class="f" for="f-rolesOther">その他の担当（任意）</label><input class="in" id="f-rolesOther" data-k="rolesOther" value="${esc(MODEL.rolesOther)}" placeholder="例：取材、原稿作成">
<label class="f" for="f-team">制作体制・協力会社（任意）</label><textarea class="in" id="f-team" data-k="team" rows="3" style="min-height:90px" placeholder="例：デザイン・実装：協力会社">${esc(MODEL.team)}</textarea><button type="button" class="linkbtn" data-clear="team">この項目を空にする</button>
</section>
<details class="card"><summary>URL・検索向けの設定（任意）</summary>
<label class="f" for="f-slug">記事のURL</label><p class="hint" style="margin:0 0 6px">fumiya-style.com/branding/works/<b id="slugShow">${esc(MODEL.slug)}</b>/　半角英小文字・数字・ハイフン。公開後に変えると、古いURLは新しいURLへ自動で転送されます。</p>
<input class="in" id="f-slug" data-k="slug" value="${esc(MODEL.slug)}" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="url"${sample ? " disabled" : ""}>
<label class="f" for="f-seoTitle">検索結果に出すタイトル</label><input class="in" id="f-seoTitle" data-k="seoTitle" value="${esc(MODEL.seoTitle)}" placeholder="空欄なら「記事タイトル | 参考実例 | FUMIYA STYLE」">
<label class="f" for="f-seoDesc">検索結果に出す説明文</label><textarea class="in" id="f-seoDesc" data-k="seoDesc" rows="3" style="min-height:90px" placeholder="空欄なら紹介文・導入文から自動で作ります">${esc(MODEL.seoDesc)}</textarea>
</details>
<details class="card"><summary>記録（編集できません）</summary><p class="small muted">作成：${fmt(CUR.createdAt)}<br>最終保存：${fmt(CUR.updatedAt)}${CUR.firstPublishedAt ? `<br>初回公開操作：${fmt(CUR.firstPublishedAt)}` : ""}${CUR.contentUpdatedAt ? `<br>内容の更新日：${fmt(CUR.contentUpdatedAt)}` : ""}</p>
<ul class="hist">${(CUR.history || []).slice().reverse().slice(0, 20).map((h) => `<li>${fmt(h.at)}　${esc(h.action)}</li>`).join("")}</ul></details>
<div class="spacer"></div></div>
<nav class="actions" aria-label="保存と公開"><div class="wrap" id="actions"></div></nav>`;

    // text fields
    $$("[data-k]").forEach((el) => el.addEventListener("input", () => {
      const k = el.dataset.k;
      if (k === "diagram.text") MODEL.diagram = { ...(MODEL.diagram || {}), text: el.value };
      else MODEL[k] = el.value;
      if (k === "slug") $("#slugShow").textContent = el.value;
      changed();
    }));
    $$("[data-arr]").forEach((el) => el.addEventListener("change", () => {
      const k = el.dataset.arr;
      MODEL[k] = $$(`[data-arr="${k}"]`).filter((x) => x.checked).map((x) => x.value);
      changed();
    }));
    $$("[data-clear]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.clear, ta = $(`[data-k="${k}"]`);
      if (!ta.value || !confirm("この項目を空にしますか？")) return;
      ta.value = ""; ta.dispatchEvent(new Event("input"));
    }));
    const dateEl = $("#f-date");
    dateEl.addEventListener("change", () => { const iso = localToIso(dateEl.value); if (iso) { MODEL.publishAt = iso; changed(); } dateHint(); });
    $("#dateNow").onclick = () => { MODEL.publishAt = new Date().toISOString(); dateEl.value = isoToLocal(MODEL.publishAt); changed(); dateHint(); };
    $("#back").onclick = () => (location.hash = "#/");
    $("#more").onclick = moreMenu;
    $("#gAdd").onclick = () => pickFiles(true, (files) => files.forEach((f) => addGallery(f)));
    if (restore) {
      $("#rsy").onclick = () => { MODEL = restore.model; renderEditor(null); changed(); toast("編集内容を復元しました"); };
      $("#rsn").onclick = () => { clearLocal(); $("#rs").remove(); };
    }
    renderImages(); renderActions(); dateHint(); stateNote();
  }

  function dateHint() {
    const t = Date.parse(MODEL.publishAt), el = $("#dateHint");
    if (!el) return;
    el.textContent = t > Date.now() + 60e3
      ? "未来の日時です。公開操作をすると、この時刻まで一般には表示されない「予約投稿」になります（表示まで最大5分ほどかかります）。"
      : "過去の日付も指定できます。一覧はこの公開日時の新しい順に並びます。日付を変えてもURLは変わりません。";
  }
  function stateNote() {
    const el = $("#stateNote"); if (!el || CUR.isSample) return;
    const now = Date.now();
    el.innerHTML = CUR.status === "published"
      ? `<p class="notice">${Date.parse(CUR.publishAt) > now ? `予約投稿です。${fmt(CUR.publishAt)} に公開されます。` : "公開中の記事です。"}変更は「変更を公開」を押すまで公開ページに反映されません。</p>`
      : "";
  }

  function changed() {
    DIRTY = true; EDITS++;
    setStatus("dirty");
    backupLocal();
    clearTimeout(autosaveT);
    // Drafts save themselves; published posts change only when you press 変更を公開.
    if (CUR.status !== "published") autosaveT = setTimeout(() => save("save", { auto: true }), 4000);
  }
  function setStatus(s, msg) {
    const el = $("#st"); if (!el) return;
    el.className = "status " + s;
    el.textContent = msg || { saved: "保存済み", saving: "保存中…", error: "保存に失敗", dirty: CUR.status === "published" ? "未公開の変更あり" : "未保存" }[s];
  }

  function renderActions() {
    const a = $("#actions"); if (!a) return;
    const b = (id, label, cls = "") => `<button class="btn ${cls}" id="${id}">${label}</button>`;
    a.innerHTML = CUR.isSample ? b("aSave", "保存") + b("aPrev", "プレビュー") + b("aDup", "複製して作成", "primary")
      : CUR.status === "published" ? b("aPrev", "プレビュー") + b("aPub", "変更を公開", "primary")
      : b("aSave", "下書き保存") + b("aPrev", "プレビュー") + b("aPub", "公開する", "primary");
    $("#aSave") && ($("#aSave").onclick = () => save("save"));
    $("#aPrev").onclick = preview;
    $("#aPub") && ($("#aPub").onclick = publish);
    $("#aDup") && ($("#aDup").onclick = duplicate);
  }
  function lock(on) { BUSY = on; $$("#actions button, #more").forEach((x) => (x.disabled = on)); }

  async function save(action, { auto = false } = {}) {
    if (BUSY) { if (auto) { clearTimeout(autosaveT); autosaveT = setTimeout(() => save(action, { auto }), 2000); } return false; }
    if (uploads > 0) { if (!auto) toast("画像の送信が終わってから保存してください"); else autosaveT = setTimeout(() => save(action, { auto }), 2000); return false; }
    clearTimeout(autosaveT);
    lock(true); setStatus("saving"); $("#formErr").textContent = ""; $$(".in.bad").forEach((x) => x.classList.remove("bad"));
    const editsAtStart = EDITS;
    try {
      const d = await api("posts/" + CUR.id, { method: "PUT", body: { post: MODEL, version: CUR.version, action } });
      CUR = d.post;
      if (EDITS === editsAtStart) { MODEL = clone(CUR); DIRTY = false; clearLocal(); setStatus("saved"); }
      else { MODEL.version = CUR.version; setStatus("dirty"); }
      $("#f-slug") && !DIRTY && ($("#f-slug").value = CUR.slug);
      renderActions(); stateNote();
      if (!auto) toast({ save: "保存しました", publish: Date.parse(CUR.publishAt) > Date.now() ? "予約投稿にしました" : "公開しました", unpublish: "非公開にしました" }[action]);
      return true;
    } catch (e) {
      if (e.status === 401) return false;
      setStatus("error");
      const extra = e.data && e.data.conflict ? ' <button class="btn sm" id="reload">最新を読み込む</button>' : ' <button class="btn sm" id="retry">もう一度保存</button>';
      $("#formErr").innerHTML = esc(e.message) + extra + '<br><span class="muted small">入力内容はこの画面とこの端末に残っています。</span>';
      $("#retry") && ($("#retry").onclick = () => save(action));
      $("#reload") && ($("#reload").onclick = () => { if (confirm("この画面の変更を破棄して、最新の内容を読み込みますか？")) { clearLocal(); DIRTY = false; viewEdit(CUR.id); } });
      if (e.data && e.data.field) { const f = $("#f-" + e.data.field); if (f) { f.classList.add("bad"); f.closest("details") && (f.closest("details").open = true); f.scrollIntoView({ block: "center" }); } }
      else window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    } finally { lock(false); }
  }

  async function publish() {
    const future = Date.parse(MODEL.publishAt) > Date.now() + 60e3;
    const msg = CUR.status === "published" ? "変更を公開ページに反映しますか？"
      : future ? `予約投稿にします。\n${fmt(MODEL.publishAt)} に一般公開されます（表示まで最大5分ほど）。よろしいですか？` : "この記事を公開しますか？";
    if (confirm(msg)) await save("publish");
  }
  async function preview() {
    if (BUSY) return;
    lock(true);
    try {
      const html = await api("preview", { method: "POST", body: { id: CUR.id, post: MODEL } });
      const ov = document.createElement("div");
      ov.className = "overlay";
      ov.innerHTML = '<div class="head"><strong>プレビュー（未公開）</strong><button class="btn sm" id="pvClose">閉じる</button></div><iframe title="プレビュー"></iframe>';
      document.body.appendChild(ov);
      ov.querySelector("iframe").srcdoc = html;
      $("#pvClose").onclick = () => ov.remove();
    } catch (e) { if (e.status !== 401) toast(e.message, 4000); }
    finally { lock(false); }
  }
  async function duplicate() {
    if (DIRTY && !(await save("save"))) return;
    clearTimeout(autosaveT);
    await createPost(CUR.id);
  }
  function moreMenu() {
    const items = [];
    if (!CUR.isSample) items.push(["複製して新しい記事を作る", duplicate]);
    else items.push(["複製して新しい記事を作る", duplicate]);
    if (CUR.status === "published") items.push(["非公開にする（下書きに戻す）", async () => { if (confirm("公開ページから記事を取り下げますか？")) await save("unpublish"); }]);
    if (CUR.status === "published" && Date.parse(CUR.publishAt) <= Date.now()) items.push(["公開ページを開く", () => window.open(`/branding/works/${CUR.slug}/`, "_blank")]);
    if (!CUR.isSample && CUR.status !== "published") items.push(["この下書きを削除", delPost, "danger"]);
    items.push(["一覧へ戻る", () => (location.hash = "#/")]);
    sheet(items);
  }
  async function delPost() {
    if (!confirm("この下書きを削除しますか？（元に戻せません）")) return;
    try { await api("posts/" + CUR.id, { method: "DELETE" }); clearLocal(); DIRTY = false; toast("削除しました"); location.hash = "#/"; }
    catch (e) { toast(e.message, 4000); }
  }

  // ---------- images ----------
  const SLOTS = { hero: "メイン画像", diagram: "構造図", before: "BEFORE画像", after: "AFTER画像" };
  const HEIC_MSG = "この画像は読み込めませんでした。対応形式はJPEG・PNG・WebPです。iPhoneの写真アプリから選べば通常は自動で変換されます。読み込めない場合は「設定」→「カメラ」→「フォーマット」を「互換性優先」にするか、スクリーンショットを使ってください。";

  function pickFiles(multiple, cb) {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*"; inp.multiple = multiple;
    inp.onchange = () => cb([...inp.files]);
    inp.click();
  }
  async function decode(file) {
    if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {} }
    return new Promise((res, rej) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("decode")); i.src = u; });
  }
  const toBlob = (c, q) => new Promise((r) => c.toBlob((b) => r(b), "image/jpeg", q));
  async function draw(src, maxLong, q) {
    const W = src.naturalWidth || src.width, H = src.naturalHeight || src.height;
    const k = Math.min(1, maxLong / Math.max(W, H));
    const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, w, h);
    let b = await toBlob(c, q);
    if (b && b.size > 4.5e6) b = await toBlob(c, 0.72);
    return { blob: b, w, h };
  }
  // Re-encoding through a canvas applies the photo's rotation and drops EXIF/GPS data.
  async function processImage(file, hq) {
    if (file.size > 50e6) throw new Error("画像ファイルが大きすぎます（50MBまで）。");
    let src;
    try { src = await decode(file); } catch { throw new Error(HEIC_MSG); }
    const large = await draw(src, hq ? 3200 : 2000, hq ? 0.92 : 0.85);
    const small = await draw(src, 900, 0.8);
    if (src.close) src.close();
    if (!large.blob || !small.blob) throw new Error(HEIC_MSG);
    return { large, small };
  }
  function uploadPart(part, uid, variant, onProgress) {
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open("POST", `/api/admin/media?post=${CUR.id}&uid=${uid}&variant=${variant}&w=${part.w}&h=${part.h}`);
      x.setRequestHeader("Content-Type", part.blob.type || "image/jpeg");
      x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch {} if (x.status === 201) res(d); else { if (x.status === 401) showLogin(true); rej(new Error(d.error || "画像の送信に失敗しました。")); } };
      x.onerror = () => rej(new Error("通信に失敗しました。電波の良い場所で再試行してください。"));
      x.send(part.blob);
    });
  }
  // target: "hero" | "diagram" | "before" | "after" | "g:<tmpid>"
  async function uploadTo(target, file, proc) {
    const st = (pending[target] ||= {});
    st.error = ""; st.progress = 0;
    try {
      if (!proc) { st.busy = "画像を準備中…"; renderImages(); proc = await processImage(file, target === "diagram" && st.hq !== false); }
    } catch (e) { st.busy = ""; st.error = e.message; renderImages(); return; }
    st.proc = proc; st.preview ||= URL.createObjectURL(proc.large.blob); st.busy = "送信中…";
    uploads++; renderImages();
    try {
      const uid = newId();
      const L = await uploadPart(proc.large, uid, "l", (p) => { st.progress = p * 0.85; paintBar(target); });
      const S = await uploadPart(proc.small, uid, "s", (p) => { st.progress = 0.85 + p * 0.15; paintBar(target); });
      const img = { key: L.key, w: L.w, h: L.h, s: { key: S.key, w: S.w, h: S.h } };
      if (target.startsWith("g:")) MODEL.gallery = [...(MODEL.gallery || []), { ...img, alt: "", caption: "" }];
      else if (target === "diagram") MODEL.diagram = { ...(MODEL.diagram || {}), ...img, alt: (MODEL.diagram || {}).alt || "" };
      else MODEL[target] = { ...img, alt: (MODEL[target] || {}).alt || "" };
      delete pending[target];
      uploads--; renderImages(); changed();
    } catch (e) {
      uploads--; st.busy = ""; st.error = e.message; renderImages();
    }
  }
  function paintBar(t) { const el = document.querySelector(`[data-bar="${t}"]`); if (el) el.style.width = Math.round((pending[t]?.progress || 0) * 100) + "%"; }
  function addGallery(file) { const t = "g:" + newId(); pending[t] = { gallery: true }; uploadTo(t, file); }

  function slotHtml(name) {
    const img = name === "diagram" ? (MODEL.diagram && MODEL.diagram.key ? MODEL.diagram : null) : MODEL[name];
    const p = pending[name];
    const src = p && p.preview ? p.preview : img ? "/media/" + img.key : "";
    return `<div class="slot"><p class="small" style="margin:0 0 6px;font-weight:600">${SLOTS[name]}</p>
${src ? `<img class="pv" src="${esc(src)}" alt="">` : `<div class="empty">${SLOTS[name]}を選んでください<br>（差し替え欄）</div>`}
${p && p.busy ? `<p class="small muted" style="margin:8px 0 0">${p.busy}</p><div class="bar"><i data-bar="${name}" style="width:${Math.round((p.progress || 0) * 100)}%"></i></div>` : ""}
${p && p.error ? `<p class="err">${esc(p.error)}</p>${p.proc ? `<button type="button" class="btn sm" data-retry="${name}">再試行</button>` : ""}` : ""}
<div class="row"><button type="button" class="btn sm" data-pick="${name}"${p && p.busy ? " disabled" : ""}>${img ? "差し替える" : "画像を選ぶ"}</button>${img ? `<button type="button" class="btn sm danger" data-del="${name}">削除</button>` : ""}</div>
${name === "diagram" ? `<label class="chip" style="display:inline-flex;margin-top:8px"><input type="checkbox" id="hq"${p && p.hq === false ? "" : " checked"}><span>小さい文字がある図（高画質で保存）</span></label>` : ""}
${img ? `<label class="f" for="alt-${name}">画像の説明（読み上げ・検索用）</label><input class="in" id="alt-${name}" data-alt="${name}" value="${esc(img.alt)}" placeholder="例：工場の外観写真">` : ""}</div>`;
  }
  function galleryHtml() {
    const g = MODEL.gallery || [];
    const items = g.map((x, i) => `<div class="g-item"><img src="/media/${esc((x.s || x).key)}" alt=""><div>
<input class="in" data-gcap="${i}" value="${esc(x.caption)}" placeholder="キャプション（任意）" style="min-height:44px">
<input class="in" data-galt="${i}" value="${esc(x.alt)}" placeholder="画像の説明（読み上げ・検索用）" style="min-height:44px;margin-top:6px">
<div class="ops"><button type="button" class="btn sm" data-gup="${i}"${i === 0 ? " disabled" : ""} aria-label="上へ">↑</button><button type="button" class="btn sm" data-gdown="${i}"${i === g.length - 1 ? " disabled" : ""} aria-label="下へ">↓</button><button type="button" class="btn sm danger" data-gdel="${i}">削除</button></div></div></div>`).join("");
    const pend = Object.entries(pending).filter(([k]) => k.startsWith("g:")).map(([k, p]) => `<div class="g-item">${p.preview ? `<img src="${esc(p.preview)}" alt="">` : '<span class="empty" style="min-height:72px">…</span>'}<div>${p.busy ? `<p class="small muted" style="margin:0">${p.busy}</p><div class="bar"><i data-bar="${k}"></i></div>` : ""}${p.error ? `<p class="err">${esc(p.error)}</p>${p.proc ? `<button type="button" class="btn sm" data-retry="${k}">再試行</button> ` : ""}<button type="button" class="btn sm" data-gcancel="${k}">取り消す</button>` : ""}</div></div>`).join("");
    return items + pend || '<p class="small muted" style="margin:0">工程写真など、必要な場合だけ追加します。</p>';
  }
  function renderImages() {
    if (!$("#slot-hero")) return;
    for (const n of Object.keys(SLOTS)) $("#slot-" + n).innerHTML = slotHtml(n);
    $("#gallery").innerHTML = galleryHtml();
    $$("[data-pick]").forEach((b) => b.onclick = () => pickFiles(false, (f) => f[0] && (delete pending[b.dataset.pick]?.preview, uploadTo(b.dataset.pick, f[0]))));
    $$("[data-retry]").forEach((b) => b.onclick = () => uploadTo(b.dataset.retry, null, pending[b.dataset.retry].proc));
    $$("[data-del]").forEach((b) => b.onclick = () => {
      if (!confirm("この画像を外しますか？（保存すると削除されます）")) return;
      const n = b.dataset.del;
      if (n === "diagram") MODEL.diagram = (MODEL.diagram && MODEL.diagram.text) ? { text: MODEL.diagram.text } : null; else MODEL[n] = null;
      renderImages(); changed();
    });
    $$("[data-alt]").forEach((el) => el.oninput = () => { const n = el.dataset.alt; (n === "diagram" ? MODEL.diagram : MODEL[n]).alt = el.value; changed(); });
    $("#hq") && ($("#hq").onchange = (e) => { (pending.diagram ||= {}).hq = e.target.checked; });
    $$("[data-gcap]").forEach((el) => el.oninput = () => { MODEL.gallery[+el.dataset.gcap].caption = el.value; changed(); });
    $$("[data-galt]").forEach((el) => el.oninput = () => { MODEL.gallery[+el.dataset.galt].alt = el.value; changed(); });
    const move = (i, d) => { const g = MODEL.gallery; [g[i], g[i + d]] = [g[i + d], g[i]]; renderImages(); changed(); };
    $$("[data-gup]").forEach((b) => b.onclick = () => move(+b.dataset.gup, -1));
    $$("[data-gdown]").forEach((b) => b.onclick = () => move(+b.dataset.gdown, 1));
    $$("[data-gdel]").forEach((b) => b.onclick = () => { if (confirm("この写真を外しますか？")) { MODEL.gallery.splice(+b.dataset.gdel, 1); renderImages(); changed(); } });
    $$("[data-gcancel]").forEach((b) => b.onclick = () => { delete pending[b.dataset.gcancel]; renderImages(); });
  }

  boot();
})();
