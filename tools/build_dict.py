"""Собирает словари для игр: data/words.js.

Источники (лежат в tools/raw):
  nouns.txt     — существительные в начальной форме (Harrix/Russian-Nouns)
  freq_full.txt — частотность словоформ по субтитрам (hermitdave/FrequencyWords)

Запуск: python tools/build_dict.py
"""
import json
import random
import sys
from pathlib import Path

import pymorphy3

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "tools" / "raw"
OUT = ROOT / "data" / "words.js"

# Сколько самых частотных словоформ считать «общеизвестными».
FREQ_LIMIT = 120_000
# Ответы, которые морфология пропускает, но загадывать их странно.
BLACKLIST = set((ROOT / "tools" / "blacklist.txt").read_text(encoding="utf-8").split())
BAD_TAGS = {"Name", "Surn", "Patr", "Geox", "Orgn", "Trad", "Abbr", "Init",
            "Obsc", "Infr", "Slng", "Arch", "Erro", "Dist", "Fixd", "plur"}


def norm(w):
    return w.strip().lower().replace("ё", "е")


def is_ru(w):
    return w.isalpha() and all("а" <= c <= "я" for c in w)


def main():
    nouns = {norm(w) for w in (RAW / "nouns.txt").read_text(encoding="utf-8").split()}
    nouns = {w for w in nouns if is_ru(w)}

    rank = {}
    attested = set()  # встречались в субтитрах хоть раз — для бонусных слов «Сот»
    with open(RAW / "freq_full.txt", encoding="utf-8") as f:
        for i, line in enumerate(f):
            w = norm(line.split()[0])
            attested.add(w)
            if i < FREQ_LIMIT:
                rank.setdefault(w, i)

    morph = pymorphy3.MorphAnalyzer()

    def good_answer(w, frequent=True):
        if w in BLACKLIST or (frequent and w not in rank):
            return False
        p = morph.parse(w)[0]
        t = p.tag
        if t.POS != "NOUN" or t.case != "nomn" or t.number != "sing":
            return False
        if BAD_TAGS & set(t.grammemes):
            return False
        return p.normal_form.replace("ё", "е") == w

    # Ответы уже опубликованных дней менять нельзя: берём прежний порядок из data/words.js,
    # выбывшие (например, из чёрного списка) слова заменяем на месте новыми, новые — в конец.
    old = load_js(OUT, "window.DICT = ") or {}
    data = {}
    rng = random.Random(20261017)
    for n in (4, 5):
        valid = sorted(w for w in nouns if len(w) == n)
        fresh = sorted((w for w in valid if good_answer(w)), key=rank.get)
        rng.shuffle(fresh)  # порядок новых слов фиксирован этим сидом
        prev = old.get(f"a{n}", "").split()
        answers = stable_merge(prev, fresh)
        data[f"v{n}"] = " ".join(valid)
        data[f"a{n}"] = " ".join(answers)
        print(f"{n} букв: допустимых {len(valid)}, ответов {len(answers)} (было {len(prev)})")

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(
        "// Сгенерировано tools/build_dict.py — не править руками.\n"
        "window.DICT = " + json.dumps(data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print("записано", OUT, OUT.stat().st_size // 1024, "КБ")

    # «Соты»: все частые существительные от 4 букв + заранее выбранные задания по дням.
    soty = sorted(w for w in nouns if len(w) >= 4 and good_answer(w))
    # Редкие слова «Соты» тоже принимают — бонусом, в цель дня и ранги они не входят: любое
    # годное существительное, которое хоть раз встретилось в частотнике и влезает в 7 букв.
    soty_set = set(soty)
    extra = sorted(w for w in nouns if len(w) >= 4 and len(set(w)) <= 7 and w not in soty_set
                   and w in attested and good_answer(w, frequent=False))
    soty_path = ROOT / "data" / "soty.js"
    prev_puzzles = load_js(soty_path, "window.SOTY_PUZZLES = ") or []
    puzzles = soty_puzzles(soty, prev_puzzles)
    soty_path.write_text(
        "// Сгенерировано tools/build_dict.py — не править руками.\n"
        "window.SOTY = " + json.dumps(" ".join(soty), ensure_ascii=False) + ";\n"
        "// [центральная буква, остальные шесть] на каждый день по порядку.\n"
        "window.SOTY_PUZZLES = " + json.dumps(puzzles, ensure_ascii=False) + ";\n"
        "// Редкие слова: принимаются бонусом, в цель дня и ранги не входят.\n"
        "window.SOTY_EXTRA = " + json.dumps(" ".join(extra), ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"соты: слов {len(soty)}, редких {len(extra)}, заданий {len(puzzles)} (было {len(prev_puzzles)})")


def load_js(path, prefix):
    """Достаёт JSON из строки вида `prefix<json>;` в сгенерированном .js."""
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith(prefix):
            return json.loads(line[len(prefix):].rstrip(";"))
    return None


def stable_merge(prev, fresh):
    fresh_set = set(fresh)
    extra = [w for w in fresh if w not in set(prev)]
    out = []
    for w in prev:
        out.append(w if w in fresh_set else extra.pop(0) if extra else w)
    return out + extra


def soty_puzzles(words, prev, want=1200):
    """Задания: 7 разных букв (из слова-панграммы) + центральная, чтобы слов было 15–70."""
    rng = random.Random(20261018)
    pangrams = sorted({"".join(sorted(set(w))) for w in words if len(set(w)) == 7 and not set(w) & set("ъы")})
    rng.shuffle(pangrams)
    seen = {"".join(sorted(p[0] + p[1])) for p in prev}
    out = [p for p in prev]
    for letters in pangrams:
        if len(out) >= want:
            break
        if letters in seen:
            continue
        ls = set(letters)
        fit = [w for w in words if set(w) <= ls]
        centers = [c for c in letters if c not in "ьй"]
        rng.shuffle(centers)
        for c in centers:
            n = sum(1 for w in fit if c in w)
            if 15 <= n <= 70:
                outer = [x for x in letters if x != c]
                rng.shuffle(outer)
                out.append([c, "".join(outer)])
                seen.add(letters)
                break
    return out


if __name__ == "__main__":
    main()
