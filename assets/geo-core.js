// Общее для географических игр: список стран, поиск по названию, расстояния, стрелки, поле ввода.
// Нужны data/geo.js, а для карт — vendor/d3-array, d3-geo, topojson-client.
(function () {
  "use strict";
  const C = window.Core;
  const LIST = window.GEO.countries;
  const byId = Object.fromEntries(LIST.map((c) => [c.id, c]));

  const key = (s) => s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, "");
  const index = [];
  LIST.forEach((c) => [c.n, ...c.al].forEach((name) => index.push({ k: key(name), name, c })));

  // Точное совпадение по любому из названий.
  function find(text) {
    const k = key(text);
    if (!k) return null;
    const hit = index.find((e) => e.k === k);
    return hit ? hit.c : null;
  }

  // Подсказки: сначала названия, начинающиеся с введённого, потом содержащие его.
  function suggest(text, exclude, limit) {
    const k = key(text);
    if (!k) return [];
    const seen = new Set();
    const out = [];
    const push = (e) => {
      if (seen.has(e.c.id) || exclude.has(e.c.id)) return;
      seen.add(e.c.id);
      out.push(e);
    };
    index.filter((e) => e.k.startsWith(k)).forEach(push);
    index.filter((e) => e.k.includes(k)).forEach(push);
    return out.slice(0, limit || 6);
  }

  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  function distance(a, b) {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function bearing(a, b) {
    const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  const ARROWS = ["⬆️", "↗️", "➡️", "↘️", "⬇️", "↙️", "⬅️", "↖️"];
  const arrow = (a, b) => ARROWS[Math.round(bearing(a, b) / 45) % 8];
  // Для экрана — текстовые стрелки (эмодзи на Windows выглядят синими квадратами).
  const ARROWS_TXT = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  const arrowTxt = (a, b) => ARROWS_TXT[Math.round(bearing(a, b) / 45) % 8];
  // Насколько близко (0–100%): 0 км — 100%, противоположная точка Земли — 0%.
  const closeness = (km) => Math.round(Math.max(0, 100 - (km / 20000) * 100));
  const fmtKm = (km) => Math.round(km).toLocaleString("ru-RU") + " км";

  function fmtNum(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(".", ",") + " млрд";
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(".", ",") + " млн";
    if (n >= 1e3) return Math.round(n / 1e3) + " тыс";
    return String(n);
  }

  // Загаданная страна дня для игры: свой перемешанный пул на каждую игру.
  function pick(game, pool, day, practiceSeed, salt) {
    if (practiceSeed != null) return pool[Math.floor(C.mulberry32(practiceSeed ^ salt)() * pool.length)];
    const order = C.seededShuffle(pool, salt);
    return order[(day - 1) % order.length];
  }

  // Поле ввода страны с выпадающими подсказками.
  // onPick(country) — выбрана страна; exclude — Set id, которые уже были.
  function picker(container, onPick, exclude, opts) {
    opts = opts || {};
    const wrap = C.el("div", "picker");
    const input = C.el("input");
    input.type = "text";
    input.placeholder = opts.placeholder || "Начни вводить страну…";
    input.autocomplete = "off";
    input.spellcheck = false;
    const box = C.el("div", "sugg" + (opts.down ? " down" : ""));
    box.hidden = true;
    wrap.append(input, box);
    container.appendChild(wrap);
    let items = [];
    let on = 0;

    function draw() {
      items = suggest(input.value, exclude, 7);
      box.innerHTML = "";
      box.hidden = !items.length;
      on = Math.min(on, Math.max(0, items.length - 1));
      items.forEach((e, i) => {
        const d = C.el("div", i === on ? "on" : "", e.c.n);
        if (e.name !== e.c.n) d.appendChild(C.el("small", null, e.name));
        d.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          choose(e.c);
        });
        box.appendChild(d);
      });
    }
    function choose(c) {
      input.value = "";
      box.hidden = true;
      on = 0;
      onPick(c);
    }
    input.addEventListener("input", () => {
      on = 0;
      draw();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { on = Math.min(on + 1, items.length - 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { on = Math.max(on - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === "Escape") box.hidden = true;
      else if (e.key === "Enter") {
        e.preventDefault();
        const exact = find(input.value);
        if (exact && !exclude.has(exact.id)) return choose(exact);
        if (exact) return C.toast("Эта страна уже была"), C.shake(wrap);
        if (items[on]) return choose(items[on].c);
        C.toast("Нет такой страны в списке");
        C.shake(wrap);
      }
    });
    input.addEventListener("blur", () => setTimeout(() => (box.hidden = true), 100));
    input.addEventListener("focus", draw);
    return {
      input,
      disable() {
        input.disabled = true;
        input.placeholder = "Задание решено";
        box.hidden = true;
      },
    };
  }

  // ----- геометрия (лениво: нужна только картам) -----
  let shapes = null;
  function features() {
    if (!shapes) {
      const fc = topojson.feature(GEO.topo, GEO.topo.objects.countries);
      shapes = {};
      fc.features.forEach((f) => (shapes[f.id] = shapes[f.id] || []).push(f));
    }
    return shapes;
  }
  // Одна фича на страну (части вроде Северного Кипра склеены).
  function feature(id) {
    const fs = features()[id];
    if (!fs) return null;
    if (fs.length === 1) return fs[0];
    return { type: "Feature", id, geometry: { type: "GeometryCollection", geometries: fs.map((f) => f.geometry) } };
  }

  // Точки границы страны (прорежены) — для расстояния «от границы до границы».
  const ptCache = {};
  function borderPoints(id) {
    if (ptCache[id]) return ptCache[id];
    const pts = [];
    const walk = (g) => {
      if (!g) return;
      if (g.type === "GeometryCollection") return g.geometries.forEach(walk);
      const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      polys.forEach((p) => p.forEach((ring) => ring.forEach((xy) => pts.push(xy))));
    };
    const f = feature(id);
    if (f) walk(f.geometry);
    const step = Math.max(1, Math.floor(pts.length / 400));
    const out = [];
    for (let i = 0; i < pts.length; i += step) out.push({ lng: pts[i][0], lat: pts[i][1] });
    if (!out.length) out.push({ lat: byId[id].lat, lng: byId[id].lng });
    return (ptCache[id] = out);
  }
  // Кратчайшее расстояние между границами (0 — соседи).
  function borderDistance(a, b) {
    if (a.id === b.id) return 0;
    const A = borderPoints(a.id), B = borderPoints(b.id);
    let best = Infinity;
    for (const p of A) for (const q of B) {
      const d = distance(p, q);
      if (d < best) best = d;
    }
    return best < 30 ? 0 : best; // упрощённые границы соседей не всегда совпадают точно
  }

  // Строка догадки в стиле Worldle: страна · км · стрелка · близость.
  function guessRow(c, answer) {
    const win = c.id === answer.id;
    const km = distance(c, answer);
    const row = C.el("div", "guess-row" + (win ? " win" : ""));
    row.appendChild(C.el("span", null, c.n));
    row.appendChild(C.el("span", "km", win ? "" : fmtKm(km)));
    row.appendChild(C.el("span", "arrow", win ? "🎉" : arrowTxt(c, answer)));
    row.appendChild(C.el("span", "pct", (win ? 100 : closeness(km)) + "%"));
    return row;
  }
  // 5 квадратиков близости для шеринга.
  function squares(c, answer) {
    if (c.id === answer.id) return "🟩🟩🟩🟩🟩 🎉";
    const p = closeness(distance(c, answer));
    const full = Math.floor(p / 20), half = p % 20 >= 10 ? 1 : 0;
    return "🟩".repeat(full) + "🟨".repeat(half) + "⬜".repeat(5 - full - half) + " " + arrow(c, answer);
  }

  window.Geo = {
    LIST, byId, find, suggest, distance, bearing, arrow, arrowTxt, closeness, fmtKm, fmtNum, pick, picker,
    feature, features, borderDistance, guessRow, squares,
  };
})();
