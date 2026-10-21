"""Собирает значения слов из Викисловаря: data/defs/<код первой буквы>.json.

Берёт все слова словесных игр (data/words.js, data/soty.js), качает статьи ru.wiktionary.org
пачками по 50 (кэш в tools/raw/wikt.json — повторный запуск докачивает только новые слова)
и вытаскивает одно-два первых значения. Редкие слова помечены «*» в начале: у них значение
показывается сразу, у остальных — по наведению или нажатию.

Тексты Викисловаря — CC BY-SA, поэтому в подсказке на сайте есть ссылка на источник.

Запуск: python tools/build_defs.py
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "tools" / "raw"
CACHE = RAW / "wikt.json"
OUT = ROOT / "data" / "defs"
API = "https://ru.wiktionary.org/w/api.php"
UA = "RazminkaDefs/1.0 (https://ykyki4.github.io/razminka/)"
RARE_RANK = 40_000  # дальше этого места в частотнике слово считаем редким
MAX_LEN = 170


def load_js(path, name):
    s = path.read_text(encoding="utf-8")
    return json.loads(re.search(r"window\.%s = (.*?);\n" % name, s).group(1))


def words_needed():
    d = load_js(ROOT / "data" / "words.js", "DICT")
    ws = set()
    for k in ("v4", "v5", "a4", "a5"):
        ws.update(d[k].split())
    for k in ("SOTY", "SOTY_EXTRA"):
        ws.update(load_js(ROOT / "data" / "soty.js", k).split())
    return ws


def fetch(titles):
    q = urllib.parse.urlencode(dict(action="query", prop="revisions", rvprop="content", rvslots="main",
                                    format="json", formatversion=2, redirects=1, titles="|".join(titles)))
    req = urllib.request.Request(API + "?" + q, headers={"User-Agent": UA})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # сеть или 429 — подождать и повторить
            print("  повтор:", e)
            time.sleep(5 * (attempt + 1))
    raise SystemExit("Викисловарь не отвечает")


def ru_section(text):
    m = re.search(r"^= *\{\{-ru-\}\} *=\s*$", text, re.M)
    if not m:
        return ""
    rest = text[m.end():]
    end = re.search(r"^= *\{\{-[a-z-]+-\}\} *=\s*$", rest, re.M)
    return rest[: end.start()] if end else rest


def download(words, cache):
    # Страницы Викисловаря пишутся через «ё», у нас всё через «е»: берём исходное написание.
    yo = {}
    for w in (RAW / "nouns.txt").read_text(encoding="utf-8").split():
        w = w.strip().lower()
        if "ё" in w:
            yo[w.replace("ё", "е")] = w
    # Если статьи в пачке слишком длинные, API отдаёт часть страниц без текста — такие слова
    # остаются некэшированными и докачиваются следующими проходами всё более мелкими пачками.
    for size in (50, 10, 1):
        todo = sorted(w for w in words if w not in cache)
        print(f"слов {len(words)}, в кэше {len(words) - len(todo)}, качаем {len(todo)} по {size}")
        fetch_batches(todo, size, cache, yo)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")


def fetch_batches(todo, size, cache, yo):
    for i in range(0, len(todo), size):
        batch = todo[i:i + size]
        title = {w: yo.get(w, w) for w in batch}
        data = fetch(list(title.values()))["query"]
        alias = {}  # итоговый заголовок → запрошенный (нормализация и редиректы)
        for x in data.get("normalized", []) + data.get("redirects", []):
            alias[x["to"]] = alias.get(x["from"], x["from"])
        text = {}
        for p in data.get("pages", []):
            src = alias.get(p["title"], p["title"])
            if "revisions" in p:
                text[src] = ru_section(p["revisions"][0]["slots"]["main"]["content"])
            elif p.get("missing") or p.get("invalid"):
                text[src] = ""  # статьи нет — больше не спрашиваем
        for w in batch:
            if title[w] in text:
                cache[w] = text[title[w]]
        if i // size % 20 == 0:
            print(f"  {i + len(batch)}/{len(todo)}")
            CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
        time.sleep(0.3)


# ---------- разбор вики-разметки ----------
REF = {"=": "то же, что {0}", "действие": "действие по значению гл. {0}",
       "свойство": "свойство по значению прил. {0}", "состояние": "состояние по значению {0}",
       "женск.": "женск. к {0}", "умласк.": "уменьш.-ласк. к {0}", "уменьш.": "уменьш. к {0}",
       "увелич.": "увелич. к {0}", "уничиж.": "уничиж. к {0}", "собир.": "собир. к {0}"}
DROP = {"пример", "выдел", "списки семантических связей", "?", "семантика", "длина слова"}


def template(body):
    parts = body.split("|")
    name = parts[0].strip()
    args = [a.strip() for a in parts[1:] if "=" not in a]
    named = dict(a.split("=", 1) for a in parts[1:] if "=" in a)
    if name in DROP or name.startswith("пример"):
        return ""
    if name == "значение":
        return named.get("определение", "").strip()
    if name == "t:=":  # {{t:=|просфора}} или {{t:=|репчатый лук|пояснение}}
        return args[1] if len(args) > 1 else "то же, что " + args[0] if args else ""
    if name == "п.":
        return "перен."
    if name == "lang":
        return args[1] if len(args) > 1 else ""
    if name in REF:
        return REF[name].format(args[0] if args else "")
    if name == "помета":
        return (args[0] + ".") if args else ""
    if name.endswith(".") and len(name) < 20:  # пометы: {{истор.|ru}}, {{церк.|ru}}
        return name
    return ""


def clean(line):
    s = re.sub(r"<!--.*?-->|<ref[^>]*?/>|<ref.*?</ref>", "", line, flags=re.S)
    for _ in range(10):  # шаблоны бывают вложенными — раскрываем изнутри
        s2 = re.sub(r"\{\{([^{}]*)\}\}", lambda m: template(m.group(1)), s)
        if s2 == s:
            break
        s = s2
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"<[^>]+>|'{2,}", "", s)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s+([;,.:])", r"\1", s).replace(".;", ".").strip(" ;,:—-")
    return s


def senses(section):
    out = []
    for m in re.finditer(r"^=+ *Значение *=+\s*$(.*?)(?=^=)", section + "\n=", re.M | re.S):
        for line in m.group(1).splitlines():
            if line.startswith("#") and not line.startswith("#:"):
                d = clean(line.lstrip("#"))
                # без значения, но с одной пометой («истор.») — пустышка
                if len(re.sub(r"\b\w+\.\s*", "", d)) >= 3:
                    out.append(d)
    return out


def definition(section):
    ss = senses(section)
    if not ss:
        return None
    text = ss[0] if len(ss) == 1 or len(ss[0]) > MAX_LEN // 2 else f"1) {ss[0]}; 2) {ss[1]}"
    if len(text) > MAX_LEN:
        text = text[:MAX_LEN].rsplit(" ", 1)[0].rstrip(",;:(") + "…"
    return text


def main():
    words = words_needed()
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    download(words, cache)
    rank = {}
    with open(RAW / "freq_full.txt", encoding="utf-8") as f:
        for i, line in enumerate(f):
            rank.setdefault(line.split()[0].lower().replace("ё", "е"), i)
    by_letter = {}
    for w in sorted(words):
        d = definition(cache.get(w, ""))
        if d:
            by_letter.setdefault(w[0], {})[w] = ("*" if rank.get(w, 10**9) > RARE_RANK else "") + d
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    for letter, defs in by_letter.items():
        (OUT / f"{ord(letter)}.json").write_text(json.dumps(defs, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n = sum(len(v) for v in by_letter.values())
    size = sum(p.stat().st_size for p in OUT.glob("*.json")) // 1024
    print(f"значений {n} из {len(words)}, файлов {len(by_letter)}, {size} КБ")


if __name__ == "__main__":
    main()
