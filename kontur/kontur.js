(function () {
  "use strict";
  const C = window.Core, G = window.Geo;
  const GAME = "kontur";
  const TRIES = 6;

  const pseed = C.practiceSeed();
  const practice = pseed != null;
  const day = C.dayNumber();
  const pool = G.LIST.filter((c) => c.geo && c.area >= 30000);
  const answer = G.pick(GAME, pool, day, pseed, 0xc0a7);

  const saved = practice ? null : C.store.get(GAME + ":day", null);
  const st = saved && saved.day === day ? saved : { day, guesses: [], done: false, won: false };
  const guessed = () => st.guesses.map((id) => G.byId[id]);

  C.header({ id: GAME, title: "Контур", day, practice, onHelp: help, onStats: stats });
  const main = document.querySelector("main");

  const shape = C.el("div", "shape");
  shape.innerHTML = silhouette(answer.id);
  main.appendChild(shape);
  const list = C.el("div", "guess-list");
  main.appendChild(list);
  const pickBox = C.el("div", "pick-box");
  main.appendChild(pickBox);
  const pk = G.picker(pickBox, onGuess, new Set(st.guesses));

  render();
  if (!practice && !C.store.get("seen:" + GAME)) {
    C.store.set("seen:" + GAME, 1);
    help();
  } else if (st.done) setTimeout(stats, 400);

  // Силуэт без дальних заморских кусков (Аляска, Французская Гвиана и т. п.),
  // в равновеликой проекции с центром на самой стране.
  function mainland(id) {
    const f = G.feature(id);
    const polys = [];
    const walk = (g) => {
      if (g.type === "GeometryCollection") g.geometries.forEach(walk);
      else if (g.type === "Polygon") polys.push(g.coordinates);
      else if (g.type === "MultiPolygon") g.coordinates.forEach((p) => polys.push(p));
    };
    walk(f.geometry);
    const parts = polys.map((p) => {
      const geo = { type: "Polygon", coordinates: p };
      return { p, area: d3.geoArea(geo), c: d3.geoCentroid(geo) };
    });
    const big = parts.reduce((a, b) => (b.area > a.area ? b : a));
    const keep = parts.filter(
      (x) => x === big || (d3.geoDistance(x.c, big.c) * 6371 < 2200 && x.area > big.area * 0.002)
    );
    return { type: "Feature", geometry: { type: "MultiPolygon", coordinates: keep.map((x) => x.p) } };
  }

  function silhouette(id) {
    const f = mainland(id);
    const [lng, lat] = d3.geoCentroid(f);
    const proj = d3.geoAzimuthalEqualArea().rotate([-lng, -lat]).fitExtent([[12, 12], [308, 248]], f);
    const d = d3.geoPath(proj)(f);
    return `<svg viewBox="0 0 320 260" role="img" aria-label="Силуэт страны"><path d="${d}"/></svg>`;
  }

  function save() {
    if (!practice) C.store.set(GAME + ":day", st);
  }

  function render() {
    list.innerHTML = "";
    guessed().forEach((c) => list.appendChild(G.guessRow(c, answer)));
    for (let i = st.guesses.length; i < TRIES; i++) list.appendChild(C.el("div", "guess-row empty", "·"));
    shape.classList.toggle("won", st.won);
    if (st.done) {
      pk.disable();
      shape.dataset.name = answer.n;
    }
  }

  function onGuess(c) {
    if (st.done) return;
    st.guesses.push(c.id);
    const won = c.id === answer.id;
    if (won || st.guesses.length === TRIES) {
      st.done = true;
      st.won = won;
      if (!practice) C.recordResult(GAME, day, won ? st.guesses.length : null);
      C.toast(won ? "Верно!" : answer.n, 2200);
      setTimeout(stats, 1300);
    }
    save();
    render();
    pk.input.focus();
  }

  function shareText() {
    const rows = guessed().map((c) => G.squares(c, answer)).join("\n");
    return `Контур №${day} ${st.won ? st.guesses.length : "✕"}/${TRIES}\n${rows}\n${C.siteUrl()}`;
  }

  function stats() {
    let summary = null;
    if (st.done) {
      summary = C.el("div", "summary");
      summary.appendChild(C.el("div", null, st.won ? "Угадано" : "Это была страна"));
      summary.appendChild(C.el("div", "word", answer.n));
    }
    C.showStats(GAME, {
      summary,
      labels: ["1", "2", "3", "4", "5", "6", "x"],
      distTitle: "Сколько попыток",
      highlight: st.won && !practice ? st.guesses.length : null,
      shareText: st.done && !practice ? shareText : null,
    });
  }

  function help() {
    C.showHelp(
      "Как играть",
      `<p>Перед тобой силуэт страны (без далёких заморских владений). Угадай её за ${TRIES} попыток.</p>
       <p>После каждой догадки видно:</p>
       <ul><li>расстояние от твоей страны до загаданной (между центрами);</li>
       <li>стрелку — в какую сторону от твоей догадки искать;</li>
       <li>близость в процентах: 100% — попал.</li></ul>
       <p>Масштаб у силуэтов разный: маленькая страна нарисована такой же крупной, как большая.</p>`
    );
  }
})();
