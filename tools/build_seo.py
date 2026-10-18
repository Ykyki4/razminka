"""SEO: заголовки, описания, превью ссылок (Open Graph) и sitemap.xml.

Тексты лежат в tools/seo.json. Скрипт вписывает в <head> каждой страницы блок
между <!-- seo --> и <!-- /seo --> (прежний блок, <title> и description заменяет),
подключает Яндекс Метрику (номер счётчика — тоже в seo.json) и пересобирает sitemap.xml. Картинки превью рисует tools/build_og.js.

Запуск: python tools/build_seo.py
"""
import html
import json
import re
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
cfg = json.loads((ROOT / "tools" / "seo.json").read_text(encoding="utf-8"))
SITE = cfg["site"]
OLD = re.compile(r'<!-- seo -->.*?<!-- /seo -->\n|<title>.*?</title>\n|<meta name="description"[^>]*>\n', re.S)


def block(slug, p):
    url = SITE + (slug + "/" if slug else "")
    img = SITE + f"assets/og/{slug or 'index'}.png"
    a = lambda s: html.escape(s, quote=True)
    ld = {"@context": "https://schema.org", "url": url, "name": p["og"], "description": p["desc"], "inLanguage": "ru"}
    ld["@type"] = "Game" if slug else "WebSite"
    lines = [
        "<!-- seo -->",
        f"<title>{html.escape(p['title'])}</title>",
        f'<meta name="description" content="{a(p["desc"])}">',
        f'<link rel="canonical" href="{url}">',
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="Разминка">',
        '<meta property="og:locale" content="ru_RU">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:title" content="{a(p["og"])}">',
        f'<meta property="og:description" content="{a(p["desc"])}">',
        f'<meta property="og:image" content="{img}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="theme-color" content="#f4efe6">',
        '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + "</script>",
    ]
    if cfg.get("yandex_verification"):
        lines.append(f'<meta name="yandex-verification" content="{a(cfg["yandex_verification"])}">')
    if cfg.get("metrika"):
        lines.append(METRIKA.replace("@COUNTER@", str(cfg["metrika"])))
    lines.append("<!-- /seo -->")
    return "\n".join(lines) + "\n"


# Яндекс Метрика — только на боевом сайте, чтобы локальные тесты не портили статистику.
METRIKA = """<script>
if (location.hostname.endsWith("github.io")) {
  (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();
  for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
  k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
  })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js?id=@COUNTER@", "ym");
  ym(@COUNTER@, "init", {ssr:true, webvisor:true, clickmap:true, referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
}
window.METRIKA_ID = @COUNTER@;
</script>"""

urls = []
for slug, p in cfg["pages"].items():
    page = ROOT / slug / "index.html" if slug else ROOT / "index.html"
    text = OLD.sub("", page.read_text(encoding="utf-8"))
    anchor = re.search(r'<meta name="viewport"[^>]*>\n', text)
    text = text[: anchor.end()] + block(slug, p) + text[anchor.end():]
    page.write_text(text, encoding="utf-8")
    urls.append(SITE + (slug + "/" if slug else ""))
    print("ok", page.relative_to(ROOT))

today = time.strftime("%Y-%m-%d")
sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for u in urls:
    sitemap.append(f"  <url><loc>{u}</loc><lastmod>{today}</lastmod><changefreq>daily</changefreq></url>")
sitemap.append("</urlset>")
(ROOT / "sitemap.xml").write_text("\n".join(sitemap) + "\n", encoding="utf-8")
print("sitemap.xml:", len(urls), "страниц")
