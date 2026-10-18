(function () {
  "use strict";
  const C = window.Core, G = window.Geo;
  const GAME = "strana";
  const TRIES = 8;

  const pseed = C.practiceSeed();
  const practice = pseed != null;
  const day = C.dayNumber();
  const pool = G.LIST.filter((c) => c.pop >= 1000000);
  const answer = G.pick(GAME, pool, day, pseed, 0x57a4a);
  C.answer(answer.n);

  const saved = practice ? null : C.store.get(GAME + ":day", null);
  const st = saved && saved.day === day ? saved : { day, guesses: [], done: false, won: false };
  const guessed = () => st.guesses.map((id) => G.byId[id]);

  C.header({ id: GAME, title: "Страна", day, practice, onHelp: help, onStats: stats });
  const main = document.querySelector("main");
  const head = C.el("div", "cmp-head");
  ["Материк", "Полушарие", "Население", "Площадь", "Куда"].forEach((h) => head.appendChild(C.el("span", null, h)));
  main.appendChild(head);
  const list = C.el("div", "cmp-list");
  main.appendChild(list);
  const pickBox = C.el("div", "pick-box");
  main.appendChild(pickBox);
  const pk = G.picker(pickBox, onGuess, new Set(st.guesses));

  render();
  if (!practice && !C.store.get("seen:" + GAME)) {
    C.store.set("seen:" + GAME, 1);
    help();
  } else if (st.done) setTimeout(stats, 400);

  const hemi = (c) => (c.lat >= 0 ? "Северное" : "Южное");

  // Сравнение числа: зелёный — почти равно (±15%), жёлтый — в пределах ×2; стрелка — у ответа больше/меньше.
  function numCell(val, target) {
    const r = val / target;
    const state = r > 0.87 && r < 1.15 ? "correct" : r > 0.5 && r < 2 ? "present" : "absent";
    const dir = state === "correct" ? "" : target > val ? " ↑" : " ↓";
    return [G.fmtNum(val) + dir, state];
  }

  // Ячейки сравнения догадки с ответом: [текст, статус].
  function compare(c) {
    if (c.id === answer.id) {
      return [[c.cont, "correct"], [hemi(c), "correct"], [G.fmtNum(c.pop), "correct"], [G.fmtNum(c.area) + " км²", "correct"], ["🎉", "correct"]];
    }
    const km = G.distance(c, answer);
    return [
      [c.cont, c.cont === answer.cont ? "correct" : "absent"],
      [hemi(c), hemi(c) === hemi(answer) ? "correct" : "absent"],
      numCell(c.pop, answer.pop),
      (() => {
        const [t, s] = numCell(c.area, answer.area);
        return [t.replace(/( ↑| ↓)?$/, " км²$1"), s];
      })(),
      [G.arrowTxt(c, answer) + " " + G.fmtKm(km), km < 1000 ? "correct" : km < 3000 ? "present" : "absent"],
    ];
  }

  function save() {
    if (!practice) C.store.set(GAME + ":day", st);
  }

  function render() {
    list.innerHTML = "";
    guessed()
      .slice()
      .reverse()
      .forEach((c) => {
        const card = C.el("div", "cmp" + (c.id === answer.id ? " win" : ""));
        card.appendChild(C.el("div", "cmp-name", c.n));
        const cells = C.el("div", "cmp-cells");
        compare(c).forEach(([t, s]) => {
          const d = C.el("span", "cell", t);
          d.dataset.state = s;
          cells.appendChild(d);
        });
        card.appendChild(cells);
        list.appendChild(card);
      });
    if (!st.guesses.length) list.appendChild(C.el("div", "cmp-empty", `Назови любую страну — получишь подсказки. Попыток: ${TRIES}.`));
    if (st.done) pk.disable();
    else pk.input.placeholder = `Попытка ${st.guesses.length + 1} из ${TRIES}…`;
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
    const rows = guessed().map((c) => compare(c).map(([, s]) => C.EMOJI[s]).join("")).join("\n");
    return `Страна №${day} ${st.won ? st.guesses.length : "✕"}/${TRIES}\n${rows}\n${C.siteUrl()}`;
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
      labels: ["1", "2", "3", "4", "5", "6", "7", "8", "x"],
      distTitle: "Сколько попыток",
      highlight: st.won && !practice ? st.guesses.length : null,
      shareText: st.done && !practice ? shareText : null,
    });
  }

  function help() {
    C.showHelp(
      "Как играть",
      `<p>Загадана страна с населением больше миллиона. Называй любые страны — каждая догадка сравнивается с ответом:</p>
       <ul>
        <li><b>Материк</b> и <b>полушарие</b> — зелёный, если совпало.</li>
        <li><b>Население</b> и <b>площадь</b> — зелёный, если почти равно; жёлтый — отличается меньше чем вдвое. Стрелка ↑ — у загаданной больше, ↓ — меньше.</li>
        <li><b>Куда</b> — направление и расстояние до загаданной. Зелёный — ближе 1000 км, жёлтый — ближе 3000 км.</li>
       </ul>
       <p>На всё ${TRIES} попыток. Свежая догадка — сверху.</p>`
    );
  }
})();
