import re, os, sys, shutil, json

SRC = sys.argv[1]
OUT = sys.argv[2]
SITE = sys.argv[3].rstrip("/") if len(sys.argv) > 3 else ""  # public URL, once decided

pages = {
    "Main.dc.html": ("index.html", "FUMIYA STYLE | 佐野史弥 公式サイト",
        "名古屋を拠点に、自動車・企業ブランディング・国際ビジネス・ビジネスマッチング・システム開発で、経営者の課題に向き合う。FUMIYA STYLE 佐野史弥の公式サイト。"),
    "Branding.dc.html": ("branding.html", "BRANDING | FUMIYA STYLE",
        "企業ブランディング、SNS運用、採用ブランディング、Webサイト制作、AI活用まで。企業の魅力を見つけ、届く形にして社会へ伝える。"),
    "Global.dc.html": ("global.html", "GLOBAL BUSINESS | FUMIYA STYLE",
        "韓国関連事業、中国企業の日本市場参入支援、海外企業と日本企業のマッチング。名古屋を拠点に、国境を越えた事業機会をつなぐ。"),
    "Matching.dc.html": ("matching.html", "BUSINESS MATCHING | FUMIYA STYLE",
        "学生と企業のマッチング、採用支援、企業間ネットワーク構築。人と企業の可能性を、確かな関係でつなぐ。"),
    "System.dc.html": ("system.html", "SYSTEM DEVELOPMENT | FUMIYA STYLE",
        "業務に合わせたシステム開発と業務効率化。補助金・助成金を活用した導入までご相談いただけます。"),
    "People.dc.html": ("people.html", "MY PEOPLE. | FUMIYA STYLE",
        "業界も、国籍も、肩書きも違う。FUMIYA STYLEが信頼する仲間たち。"),
    "Privacy.dc.html": ("privacy.html", "プライバシーポリシー | FUMIYA STYLE",
        "FUMIYA STYLE（RAF INDUSTRIES Inc.）の個人情報の取り扱いについて。"),
}
URLS = {"Main.dc.html": "/", "Branding.dc.html": "/branding/"}
linkmap = {k: URLS.get(k, "/" + v[0]) for k, v in pages.items()}
FN_LIB = os.path.join(os.path.dirname(OUT.rstrip("/")) or ".", "netlify", "functions", "_lib")

CONTACT_FORM = '''<form name="contact" method="POST" action="/thanks.html" data-netlify="true" netlify-honeypot="bot-field" style="display: flex; flex-direction: column; gap: 22px">
<input type="hidden" name="form-name" value="contact">
<input type="hidden" name="source_page" id="fs-source" value="">
<p hidden><label>この欄は空のままにしてください <input name="bot-field"></label></p>
<div style="display: flex; flex-direction: column; gap: 8px">
<label for="fs-name" style="font-size: 14px; letter-spacing: 0.1em">お名前 <span style="color: #C9A96E; font-size: 12px">必須</span></label>
<input id="fs-name" name="name" type="text" required autocomplete="name" class="fld">
</div>
<div style="display: flex; flex-direction: column; gap: 8px">
<label for="fs-company" style="font-size: 14px; letter-spacing: 0.1em">会社名 <span style="color: #C9A96E; font-size: 12px">必須</span></label>
<input id="fs-company" name="company" type="text" required autocomplete="organization" class="fld">
</div>
<div style="display: flex; flex-direction: column; gap: 8px">
<label for="fs-email" style="font-size: 14px; letter-spacing: 0.1em">メールアドレス <span style="color: #C9A96E; font-size: 12px">必須</span></label>
<input id="fs-email" name="email" type="email" required autocomplete="email" class="fld">
</div>
<fieldset style="margin: 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 10px">
<legend style="padding: 0; margin-bottom: 10px; font-size: 14px; letter-spacing: 0.1em">ご相談の領域 <span style="color: #8F8A82; font-size: 12px">任意・複数可</span></legend>
<div style="display: flex; flex-wrap: wrap; gap: 8px">
<label class="pill"><input type="checkbox" name="area_anubis" value="希望"><span>ANUBIS NAGOYA（車・モビリティ）</span></label>
<label class="pill"><input type="checkbox" name="area_branding" value="希望"><span>BRANDING</span></label>
<label class="pill"><input type="checkbox" name="area_global" value="希望"><span>GLOBAL BUSINESS</span></label>
<label class="pill"><input type="checkbox" name="area_matching" value="希望"><span>BUSINESS MATCHING</span></label>
<label class="pill"><input type="checkbox" name="area_system" value="希望"><span>SYSTEM DEVELOPMENT</span></label>
<label class="pill"><input type="checkbox" name="area_undecided" value="希望"><span>まだ決まっていない</span></label>
</div>
</fieldset>
<div style="display: flex; flex-direction: column; gap: 8px">
<label for="fs-message" style="font-size: 14px; letter-spacing: 0.1em">ご相談内容 <span style="color: #C9A96E; font-size: 12px">必須</span></label>
<textarea id="fs-message" name="message" rows="6" required placeholder="現在の課題や、ご相談したいことをご自由にお書きください。" class="fld" style="padding: 14px; line-height: 1.8; resize: vertical"></textarea>
</div>
<div style="display: flex; align-items: flex-start; gap: 10px">
<input id="fs-privacy" name="privacy" value="同意" type="checkbox" required style="width: 20px; height: 20px; margin: 4px 0 0; accent-color: #C9A96E; flex: none">
<label for="fs-privacy" style="font-size: 14px; color: #A39E95">ご入力いただいた個人情報は、お問い合わせへの回答にのみ使用します。<a href="/privacy.html">プライバシーポリシー</a>に同意のうえ送信してください。</label>
</div>
<button type="submit" style="min-height: 56px; background: #C9A96E; color: #0B0B0C; border: 0; font-size: 16px; font-weight: 500; letter-spacing: 0.2em; font-family: inherit; cursor: pointer">事業について相談する</button>
</form>'''

EXTRA_CSS = '''html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
*,*::before,*::after{box-sizing:border-box}
img{max-width:100%;height:auto}
.fld{min-height:52px;padding:0 14px;background:#0B0B0C;border:1px solid #3A3427;color:#EDE8DF;font-size:16px;font-family:inherit;border-radius:0;width:100%}
.fld:focus{border-color:#C9A96E;outline:none}
.pill{position:relative;display:inline-flex}
.pill input{position:absolute;opacity:0;width:1px;height:1px}
.pill span{min-height:44px;padding:0 14px;display:inline-flex;align-items:center;font-size:13px;border:1px solid #3A3427;color:#D6D1C8;cursor:pointer}
.pill input:checked+span{background:#C9A96E;border-color:#C9A96E;color:#0B0B0C}
.pill input:focus-visible+span{outline:2px solid #C9A96E;outline-offset:3px}
@media (prefers-reduced-motion: reduce){html{scroll-behavior:auto}*{animation:none!important;transition:none!important}}'''

def head(title, desc, fname, helmet):
    path = {"index.html": "/", "branding.html": "/branding/"}.get(fname, "/" + fname)
    url = SITE + path
    abs_tags = (f'<link rel="canonical" href="{url}">\n<meta property="og:url" content="{url}">\n'
                f'<meta property="og:image" content="{SITE}/ogp.png">\n') if SITE else ""
    return f'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
{abs_tags}<meta property="og:type" content="website">
<meta property="og:site_name" content="FUMIYA STYLE">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0B0B0C">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{helmet.strip()}
<style>
{EXTRA_CSS}
</style>
</head>
<body>
'''

os.makedirs(OUT, exist_ok=True)
for src, (fname, title, desc) in pages.items():
    s = open(os.path.join(SRC, src), encoding="utf-8").read()
    helmet = re.search(r"<helmet>(.*?)</helmet>", s, re.S).group(1)
    body = re.search(r"</helmet>(.*?)</x-dc>", s, re.S).group(1)
    if src == "Main.dc.html":
        body, n = re.subn(r'<sc-if value="\{\{ sent \}\}".*?</form>\s*</sc-if>', lambda m: CONTACT_FORM, body, flags=re.S)
        assert n == 1, "form"
        body, n = re.subn(r'<sc-if value="\{\{ showSticky \}\}"[^>]*>(.*?)</sc-if>', r'\1', body, flags=re.S)
        assert n == 1, "sticky"
        body = body.replace('/_blob/59af36edc787f40654fa1e72d2088e65', '/hero.jpg')
        body = body.replace('/_blob/8096d839902e1dbbe6f76e98ee2a71ad', '/img/anubis-nagoya-logo.webp')
    body = re.sub(r'<sc-if value="\{\{ menuOpen \}\}"[^>]*>(.*?)</sc-if>', r'\1', body, flags=re.S)
    body = body.replace('<div id="fs-menu"', '<div id="fs-menu" hidden')
    body = re.sub(r' onClick="\{\{ (openMenu|closeMenu) \}\}"', '', body)
    assert "{{" not in body and "<sc-" not in body and "<dc-" not in body, src
    for k, v in linkmap.items():
        body = body.replace(f'href="{k}', f'href="{v}')
    assert ".dc.html" not in body, src
    sticky_js = '''(function(){var s=document.getElementById('fs-sticky'),c=document.getElementById('contact');if(!s||!c)return;
s.style.transition='opacity .3s';function u(){var r=c.getBoundingClientRect();var show=window.scrollY>window.innerHeight*0.8&&r.top>window.innerHeight;
s.style.opacity=show?'1':'0';s.style.visibility=show?'visible':'hidden';}
window.addEventListener('scroll',u,{passive:true});window.addEventListener('resize',u);u();})();
'''
    menu_js = '''(function(){var m=document.getElementById('fs-menu'),o=document.getElementById('fs-menu-open'),c=document.getElementById('fs-menu-close');if(!m||!o)return;
function open(){m.hidden=false;document.body.style.overflow='hidden';c&&c.focus();}
function close(){m.hidden=true;document.body.style.overflow='';o.focus();}
o.addEventListener('click',open);c&&c.addEventListener('click',close);
m.querySelectorAll('a[href^="#"]').forEach(function(a){a.addEventListener('click',function(){m.hidden=true;document.body.style.overflow='';});});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!m.hidden)close();});})();
'''
    prefill_js = '''(function(){var q=new URLSearchParams(location.search);var a=q.get('area');if(a&&/^[a-z]+$/.test(a)){var b=document.querySelector('input[name="area_'+a+'"]');if(b)b.checked=true;}
var f=q.get('from');var h=document.getElementById('fs-source');if(h&&f&&/^[a-z0-9-]{1,80}$/.test(f))h.value='/branding/works/'+f+'/';})();
'''
    js = (sticky_js + prefill_js if src == "Main.dc.html" else "") + (menu_js if 'id="fs-menu"' in body else "")
    script = "<script>\n" + js + "</script>\n" if js else ""
    if src == "Main.dc.html":
        helmet = '<link rel="preload" as="image" href="/hero.jpg">\n' + helmet
    if src == "Branding.dc.html":
        body, n = re.subn(r'<section id="works-latest".*?</section>', '<!--WORKS_LATEST-->', body, flags=re.S)
        assert n == 1, "works-latest"
        os.makedirs(FN_LIB, exist_ok=True)
        hd = head(title, desc, fname, helmet)
        open(os.path.join(FN_LIB, "branding.html"), "w", encoding="utf-8").write(hd + body.strip() + "\n" + script + "</body>\n</html>\n")
        # shared chrome for server-rendered article pages
        hb = body.strip()
        header_html = hb[:hb.index("<section")]
        footer_html = hb[hb.index("<footer"):]
        style_block = re.search(r"<style>(.*?)</style>", helmet, re.S).group(1)
        fonts = re.search(r'<link rel="stylesheet"[^>]*>', helmet).group(0)
        json.dump({"site": SITE, "fonts": fonts, "css": style_block.strip() + "\n" + EXTRA_CSS,
                   "header": header_html, "footer": footer_html, "menu_js": menu_js,
                   "static_pages": [URLS.get(k, "/" + v[0]) for k, v in pages.items()]},
                  open(os.path.join(FN_LIB, "chrome.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("wrote branding template + chrome.json")
        continue
    out = head(title, desc, fname, helmet) + body.strip() + "\n" + script + "</body>\n</html>\n"
    open(os.path.join(OUT, fname), "w", encoding="utf-8").write(out)
    print("wrote", fname)

# thanks page, reusing the privacy page's head styles
thanks_helmet = re.search(r"<helmet>(.*?)</helmet>", open(os.path.join(SRC, "Privacy.dc.html"), encoding="utf-8").read(), re.S).group(1)
thanks = head("送信完了 | FUMIYA STYLE", "お問い合わせを受け付けました。", "thanks.html", thanks_helmet).replace('<meta name="theme-color"', '<meta name="robots" content="noindex">\n<meta name="theme-color"') + '''<main style="min-height: 100vh; background: #0B0B0C; color: #EDE8DF; font-family: 'Noto Sans JP', sans-serif; display: flex; align-items: center; justify-content: center; padding: 48px 24px; text-align: center">
<div style="max-width: 560px; display: flex; flex-direction: column; align-items: center; gap: 20px">
<p style="margin: 0; font-family: 'Cormorant Garamond', serif; font-size: 13px; letter-spacing: 0.5em; color: #C9A96E">THANK YOU</p>
<h1 style="margin: 0; font-family: 'Shippori Mincho', serif; font-weight: 500; font-size: 24px; line-height: 1.8; letter-spacing: 0.12em">ご相談ありがとうございます。</h1>
<p style="margin: 0; font-size: 16px; line-height: 1.9; color: #D6D1C8">内容を確認のうえ、佐野よりご連絡いたします。</p>
<a href="/" style="min-height: 48px; padding: 0 24px; display: flex; align-items: center; border: 1px solid #C9A96E; color: #C9A96E; text-decoration: none; letter-spacing: 0.2em; font-size: 14px">トップページへ戻る</a>
</div>
</main>
</body>
</html>
'''
open(os.path.join(OUT, "thanks.html"), "w", encoding="utf-8").write(thanks)
robots = "User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n"
if SITE:
    robots += f"\nSitemap: {SITE}/sitemap.xml\n"
open(os.path.join(OUT, "robots.txt"), "w").write(robots)
shutil.copy(os.path.join(os.path.dirname(os.path.abspath(__file__)), "hero.jpg"), os.path.join(OUT, "hero.jpg"))
notfound = head("ページが見つかりません | FUMIYA STYLE", "お探しのページは見つかりませんでした。", "404.html", thanks_helmet).replace('<meta name="theme-color"', '<meta name="robots" content="noindex">\n<meta name="theme-color"') + '''<main style="min-height: 100vh; background: #0B0B0C; color: #EDE8DF; font-family: 'Noto Sans JP', sans-serif; display: flex; align-items: center; justify-content: center; padding: 48px 24px; text-align: center">
<div style="max-width: 560px; display: flex; flex-direction: column; align-items: center; gap: 20px">
<p style="margin: 0; font-family: 'Cormorant Garamond', serif; font-size: 13px; letter-spacing: 0.5em; color: #C9A96E">404 NOT FOUND</p>
<h1 style="margin: 0; font-family: 'Shippori Mincho', serif; font-weight: 500; font-size: 22px; line-height: 1.8; letter-spacing: 0.1em">お探しのページは見つかりませんでした。</h1>
<a href="/" style="min-height: 48px; padding: 0 24px; display: flex; align-items: center; border: 1px solid #C9A96E; color: #C9A96E; text-decoration: none; letter-spacing: 0.2em; font-size: 14px">トップページへ戻る</a>
</div>
</main>
</body>
</html>
'''
open(os.path.join(OUT, "404.html"), "w", encoding="utf-8").write(notfound)
print("wrote thanks.html, 404.html, robots.txt")
