"""Статистика сайта из API Яндекс Метрики.

Токен (только чтение статистики) лежит вне репозитория: ~/.metrika_token
или в переменной окружения METRIKA_TOKEN. Скрипт его никуда не печатает.

Запуск: python tools/metrika.py [отчёт ...] [--from 2026-10-17] [--to today]
Отчёты: days sources sites utm pages games goals params devices geo all (по умолчанию all)
Произвольный запрос: python tools/metrika.py raw "metrics=ym:s:visits&dimensions=ym:s:browser"
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

COUNTER = 113666309
API = "https://api-metrika.yandex.net"
START = "2026-10-17"  # день №1


def token():
    t = os.environ.get("METRIKA_TOKEN")
    if not t:
        p = Path.home() / ".metrika_token"
        if not p.exists():
            sys.exit(f"нет токена: положите его в {p} или в METRIKA_TOKEN")
        t = p.read_text(encoding="utf-8-sig")
    return t.strip()


def get(path, **params):
    url = f"{API}{path}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": "OAuth " + token()})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            body = json.loads(body).get("message", body)
        except ValueError:
            pass
        sys.exit(f"Метрика ответила {e.code}: {body}")


def data(metrics, dims="", sort=None, limit=50, filters=None, **extra):
    p = dict(ids=COUNTER, metrics=metrics, date1=ARGS.date1, date2=ARGS.date2,
             accuracy="full", limit=limit, lang="ru", **extra)
    if dims:
        p["dimensions"] = dims
    if sort:
        p["sort"] = sort
    if filters:
        p["filters"] = filters
    return get("/stat/v1/data", **p)


def show(title, res, heads):
    print(f"\n== {title} ==")
    rows = []
    for r in res["data"]:
        names = [d.get("name") or d.get("id") or "—" for d in r["dimensions"]]
        rows.append(names + [fmt(v) for v in r["metrics"]])
    if not rows:
        print("(пусто)")
        return
    rows.append(["итого"] + [""] * (len(res["data"][0]["dimensions"]) - 1) + [fmt(v) for v in res["totals"]])
    w = [max(len(str(x)) for x in col) for col in zip(heads, *rows)]
    for row in [heads] + rows:
        print("  ".join(str(x).ljust(w[i]) if i < len(row) - len(res["totals"]) else str(x).rjust(w[i])
                        for i, x in enumerate(row)))


def fmt(v):
    return str(int(v)) if float(v).is_integer() else f"{v:.2f}"


VIS = "ym:s:visits,ym:s:users,ym:s:pageviews,ym:s:bounceRate,ym:s:avgVisitDurationSeconds"
VIS_H = ["визиты", "люди", "просм.", "отказ%", "сек"]


def r_days():
    show("По дням", data(VIS, "ym:s:date", sort="ym:s:date", group="day"), ["дата"] + VIS_H)
    show("Новые и вернувшиеся", data("ym:s:visits,ym:s:users", "ym:s:isNewUser"), ["новый?", "визиты", "люди"])


def r_utm():
    show("Метки utm", data("ym:s:visits,ym:s:users", "ym:s:UTMSource,ym:s:UTMMedium", sort="-ym:s:visits"),
         ["source", "medium", "визиты", "люди"])


def r_sources():
    show("Источники", data(VIS, "ym:s:lastTrafficSource", sort="-ym:s:visits"), ["источник"] + VIS_H)


def r_sites():
    show("Сайты и мессенджеры", data("ym:s:visits,ym:s:users", "ym:s:lastTrafficSource,ym:s:lastReferalSource",
                                     sort="-ym:s:visits", filters="ym:s:lastTrafficSource=.('referral','messenger','social','internal')"),
         ["тип", "откуда", "визиты", "люди"])


def r_pages():
    show("Страницы входа", data(VIS, "ym:s:startURLPath", sort="-ym:s:visits"), ["вход"] + VIS_H)


def r_games():
    # Склеиваем /x/ и /x/index.html: считаем по первой папке пути.
    res = data("ym:pv:pageviews,ym:pv:users", "ym:pv:URLPath", sort="-ym:pv:pageviews", limit=200)
    agg = {}
    for r in res["data"]:
        path = r["dimensions"][0]["name"] or ""
        parts = [p for p in path.split("/") if p and p != "index.html"]
        key = parts[1] if len(parts) > 1 else "главная"
        a = agg.setdefault(key, [0, 0])
        a[0] += r["metrics"][0]
        a[1] = max(a[1], r["metrics"][1])
    print("\n== Игры (просмотры; люди — по самому частому адресу) ==")
    for k, (pv, us) in sorted(agg.items(), key=lambda x: -x[1][0]):
        print(f"{k:<10} {int(pv):>6} {int(us):>6}")


def r_goals():
    goals = get(f"/management/v1/counter/{COUNTER}/goals").get("goals", [])
    print("\n== Цели ==")
    if not goals:
        print("целей не заведено")
        return
    for g in goals:
        res = data(f"ym:s:goal{g['id']}reaches,ym:s:goal{g['id']}users")
        reach, users = (fmt(v) for v in res["totals"])
        print(f"{g['name']:<20} достижений {reach:>5}, людей {users:>5}")


def r_params():
    show("Параметры целей: finish → игра → win/lose, share → игра", data("ym:s:visits,ym:s:users",
                                               "ym:s:paramsLevel1,ym:s:paramsLevel2,ym:s:paramsLevel3",
                                               sort="-ym:s:visits", limit=200),
         ["ур.1", "ур.2", "ур.3", "визиты", "люди"])


def r_devices():
    show("Устройства", data(VIS, "ym:s:deviceCategory", sort="-ym:s:visits"), ["устройство"] + VIS_H)


def r_geo():
    show("Города", data("ym:s:visits,ym:s:users", "ym:s:regionCity", sort="-ym:s:visits", limit=15),
         ["город", "визиты", "люди"])


REPORTS = dict(days=r_days, sources=r_sources, sites=r_sites, utm=r_utm, pages=r_pages, games=r_games,
               goals=r_goals, params=r_params, devices=r_devices, geo=r_geo)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("reports", nargs="*", default=["all"])
    ap.add_argument("--from", dest="date1", default=START)
    ap.add_argument("--to", dest="date2", default="today")
    ARGS = ap.parse_args()
    if ARGS.reports[:1] == ["raw"]:
        q = dict(urllib.parse.parse_qsl(ARGS.reports[1]))
        q.setdefault("ids", COUNTER)
        q.setdefault("date1", ARGS.date1)
        q.setdefault("date2", ARGS.date2)
        print(json.dumps(get("/stat/v1/data", **q), ensure_ascii=False, indent=1))
        sys.exit()
    print(f"Счётчик {COUNTER}, {ARGS.date1} — {ARGS.date2 if ARGS.date2 != 'today' else date.today()}")
    for name in (REPORTS if "all" in ARGS.reports else ARGS.reports):
        REPORTS[name]()
