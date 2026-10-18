(function () {
  "use strict";
  const C = window.Core, G = window.Geo;
  const GAME = "globus";

  const pseed = C.practiceSeed();
  const practice = pseed != null;
  const day = C.dayNumber();
  const pool = G.LIST.filter((c) => c.geo && c.pop >= 1000000);
  const answer = G.pick(GAME, pool, day, pseed, 0x610b5);
  C.answer(answer.n);

  const saved = practice ? null : C.store.get(GAME + ":day", null);
  const st = saved && saved.day === day ? saved : { day, guesses: [], done: false, won: false };
  const dist = {}; // id -> км от границы до границы
  const distTo = (c) => (dist[c.id] ??= G.borderDistance(c, answer));

  C.header({ id: GAME, title: "Глобус", day, practice, onHelp: help, onStats: stats });
  const main = document.querySelector("main");

  // ----- глобус -----
  const SIZE = 480;
  const wrap = C.el("div", "globe-wrap");
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
  wrap.appendChild(svg);
  const zoom = C.el("div", "zoom");
  const zin = C.el("button", "icon-btn", "+");
  const zout = C.el("button", "icon-btn", "−");
  zoom.append(zin, zout);
  wrap.appendChild(zoom);
  main.appendChild(wrap);

  const info = C.el("div", "globe-info");
  main.appendChild(info);
  const pickBox = C.el("div", "pick-box");
  main.appendChild(pickBox);
  const pk = G.picker(pickBox, onGuess, new Set(st.guesses), { placeholder: "Назови страну…" });
  const list = C.el("div", "near-list");
  main.appendChild(list);

  const proj = d3.geoOrthographic().translate([SIZE / 2, SIZE / 2]).clipAngle(90).precision(0.5);
  let scale = 1;
  const baseScale = SIZE / 2 - 8;
  proj.scale(baseScale);
  const path = d3.geoPath(proj);
  const shapes = G.features();
  const ids = Object.keys(shapes);

  const sphere = document.createElementNS(svgNS, "path");
  sphere.setAttribute("class", "ocean");
  const grat = document.createElementNS(svgNS, "path");
  grat.setAttribute("class", "grat");
  svg.append(sphere, grat);
  const nodes = {};
  ids.forEach((id) => {
    const p = document.createElementNS(svgNS, "path");
    p.setAttribute("class", "land");
    svg.appendChild(p);
    nodes[id] = p;
  });
  const graticule = d3.geoGraticule10();

  function draw() {
    sphere.setAttribute("d", path({ type: "Sphere" }));
    grat.setAttribute("d", path(graticule));
    ids.forEach((id) => {
      const f = G.feature(id);
      nodes[id].setAttribute("d", path(f) || "");
    });
  }

  // Цвет по расстоянию: соседи — тёмно-красные, далеко — бледно-жёлтые.
  const HEAT = ["#7f0d12", "#d9361e", "#f08a2c", "#f7c45a", "#fbecbd"].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  function heat(km) {
    const t = Math.min(1, Math.sqrt(km / 9000)) * (HEAT.length - 1);
    const i = Math.min(HEAT.length - 2, Math.floor(t)), f = t - i;
    const c = HEAT[i].map((v, k) => Math.round(v + (HEAT[i + 1][k] - v) * f));
    return `rgb(${c})`;
  }

  function paint() {
    ids.forEach((id) => {
      const n = nodes[id];
      const c = G.byId[id];
      n.style.fill = "";
      n.classList.remove("hit");
      if (!c) return;
      if (st.guesses.includes(id)) {
        n.style.fill = id === answer.id ? "var(--correct)" : heat(distTo(c));
        n.classList.add("hit");
      } else if (st.done && id === answer.id) {
        n.style.fill = "var(--correct)";
        n.classList.add("hit");
      }
    });
  }

  // Плавный поворот к стране.
  let anim = null;
  function rotateTo(c) {
    const [lng, lat] = d3.geoCentroid(G.feature(c.id));
    const from = proj.rotate();
    const to = [-lng, -lat * 0.85, 0];
    const interp = d3.geoInterpolate([-from[0], -from[1]], [-to[0], -to[1]]);
    const t0 = performance.now();
    cancelAnimationFrame(anim);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 700);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const [x, y] = interp(e);
      proj.rotate([-x, -y, 0]);
      draw();
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  // Перетаскивание.
  let drag = null;
  svg.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, r: proj.rotate() };
    svg.setPointerCapture(e.pointerId);
    cancelAnimationFrame(anim);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const k = 75 / (proj.scale() / 2.2);
    const rect = svg.getBoundingClientRect();
    const f = SIZE / rect.width;
    proj.rotate([drag.r[0] + (e.clientX - drag.x) * f * k * 0.25, Math.max(-85, Math.min(85, drag.r[1] - (e.clientY - drag.y) * f * k * 0.25)), 0]);
    draw();
  });
  const endDrag = () => (drag = null);
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  const setZoom = (z) => {
    scale = Math.max(1, Math.min(6, z));
    proj.scale(baseScale * scale);
    draw();
  };
  zin.onclick = () => setZoom(scale * 1.5);
  zout.onclick = () => setZoom(scale / 1.5);
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    setZoom(scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2));
  }, { passive: false });

  proj.rotate([-40, -30, 0]);
  draw();
  render();
  const last = st.guesses.length ? G.byId[st.guesses[st.guesses.length - 1]] : null;
  if (st.done) rotateTo(answer);
  else if (last) rotateTo(last);

  if (!practice && !C.store.get("seen:" + GAME)) {
    C.store.set("seen:" + GAME, 1);
    help();
  } else if (st.done) setTimeout(stats, 600);

  function save() {
    if (!practice) C.store.set(GAME + ":day", st);
  }

  function render() {
    paint();
    const gs = st.guesses.map((id) => G.byId[id]);
    const closest = gs.filter((c) => c.id !== answer.id).sort((a, b) => distTo(a) - distTo(b));
    info.innerHTML = "";
    if (st.done) {
      info.appendChild(C.el("b", null, st.won ? `${answer.n}! Попыток: ${st.guesses.length}` : `Ответ: ${answer.n}`));
      pk.disable();
    } else if (closest.length) {
      info.append(C.el("span", null, "Ближе всех: "), C.el("b", null, `${closest[0].n} — ${distTo(closest[0]) === 0 ? "граничит!" : G.fmtKm(distTo(closest[0]))}`));
    } else {
      info.appendChild(C.el("span", null, "Назови любую страну, чтобы начать"));
    }
    list.innerHTML = "";
    closest.slice(0, 40).forEach((c) => {
      const d = distTo(c);
      const row = C.el("div", "near");
      const sw = C.el("i");
      sw.style.background = heat(d);
      row.append(sw, C.el("span", null, c.n), C.el("span", "km", d === 0 ? "соседи" : G.fmtKm(d)));
      row.onclick = () => rotateTo(c);
      list.appendChild(row);
    });
  }

  function onGuess(c) {
    if (st.done) return;
    st.guesses.push(c.id);
    if (c.id === answer.id) {
      st.done = true;
      st.won = true;
      if (!practice) C.recordResult(GAME, day, bucket(st.guesses.length));
      C.toast("Нашёл! " + answer.n, 2200);
      setTimeout(stats, 1500);
    }
    save();
    render();
    if (c.geo) rotateTo(c);
    pk.input.focus();
  }

  function bucket(n) {
    return n <= 3 ? "1–3" : n <= 6 ? "4–6" : n <= 10 ? "7–10" : n <= 15 ? "11–15" : "16+";
  }

  function giveUp() {
    if (st.done || !confirm("Сдаться и показать страну?")) return;
    st.done = true;
    st.won = false;
    if (!practice) C.recordResult(GAME, day, null);
    save();
    render();
    rotateTo(answer);
    setTimeout(stats, 900);
  }
  const give = C.el("button", "btn small", "Сдаться");
  give.onclick = giveUp;
  if (!st.done) pickBox.appendChild(give);

  function shareText() {
    const gs = st.guesses.map((id) => G.byId[id]);
    const em = (c) => {
      if (c.id === answer.id) return "🟩";
      const d = distTo(c);
      return d === 0 ? "🟥" : d < 1500 ? "🟧" : d < 4000 ? "🟨" : "⬜";
    };
    return `Глобус №${day} — ${st.won ? st.guesses.length + " попыт." : "сдался"}\n${gs.map(em).join("")}\n${C.siteUrl()}`;
  }

  function stats() {
    let summary = null;
    if (st.done) {
      summary = C.el("div", "summary");
      summary.appendChild(C.el("div", null, st.won ? "Найдена страна" : "Это была страна"));
      summary.appendChild(C.el("div", "word", answer.n));
    }
    C.showStats(GAME, {
      summary,
      labels: ["1–3", "4–6", "7–10", "11–15", "16+", "x"],
      distTitle: "Сколько попыток",
      highlight: st.won && !practice ? bucket(st.guesses.length) : null,
      shareText: st.done && !practice ? shareText : null,
    });
  }

  function help() {
    C.showHelp(
      "Как играть",
      `<p>Загадана страна. Называй любые страны — они закрашиваются на глобусе.</p>
       <p>Цвет показывает, <b>насколько близко</b> граница твоей страны к загаданной: бледно-жёлтый — далеко, оранжевый — теплее, тёмно-красный — совсем рядом или граничит.</p>
       <div style="display:flex;height:14px;border-radius:7px;overflow:hidden;margin:8px 0">
         <i style="flex:1;background:#fbecbd"></i><i style="flex:1;background:#f7c45a"></i><i style="flex:1;background:#f08a2c"></i><i style="flex:1;background:#d9361e"></i><i style="flex:1;background:#7f0d12"></i>
       </div>
       <p>Попыток сколько угодно — цель найти страну за минимум. Глобус крутится пальцем или мышью, колесо и кнопки ± приближают.</p>`
    );
  }
})();
