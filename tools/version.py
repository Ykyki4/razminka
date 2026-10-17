"""Проставляет ?v=<метка> всем локальным .js и .css в HTML-страницах сайта,
чтобы после выкладки браузеры игроков взяли новые файлы, а не старые из кэша.

Запускать перед каждой выкладкой: python tools/version.py
"""
import re
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
stamp = time.strftime("%Y%m%d%H%M")
pattern = re.compile(r'((?:src|href)="(?!https?:|data:)[^"?]+\.(?:js|css))(?:\?v=\w+)?"')

pages = [ROOT / "index.html", *sorted(ROOT.glob("*/index.html"))]
for page in pages:
    if page.parent.name in ("tools",):
        continue
    text = page.read_text(encoding="utf-8")
    new, n = pattern.subn(lambda m: f'{m.group(1)}?v={stamp}"', text)
    page.write_text(new, encoding="utf-8")
    print(f"{page.relative_to(ROOT)}: {n} ссылок")
print("версия", stamp)
