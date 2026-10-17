(function () {
  "use strict";
  const C = window.Core, G = window.Geo;
  const GAME = "flag";
  const TRIES = 6, CELLS = 6;

  const pseed = C.practiceSeed();
  const practice = pseed != null;
  const day = C.dayNumber();
  const pool = G.LIST.filter((c) => c.flag && c.pop >= 500000);
  const answer = G.pick(GAME, pool, day, pseed, 0x0f1a6);

  // Порядок, в котором открываются кусочки флага, — тоже от дня.
  const order = C.seededShuffle([0, 1, 2, 3, 4, 5], (practice ? pseed : day) * 31 + 7);

  const saved = practice ? null : C.store.get(GAME + ":day", null);
  const st = saved && saved.day === day ? saved : { day, guesses: [], done: false, won: false };
  const guessed = () => st.guesses.map((id) => G.byId[id]);

  C.header({ id: GAME, title: "Флаг", day, practice, onHelp: help, onStats: stats });
  const main = document.querySelector("main");

  const frame = C.el("div", "flag-frame");
  const img = C.el("img");
  img.src = "../assets/flags/" + answer.id.toLowerCase() + ".svg";
  img.alt = "Флаг";
  img.draggable = false;
  frame.appendChild(img);
  const cover = C.el("div", "flag-cover");
  const cells = [];
  for (let i = 0; i < CELLS; i++) {
    const d = C.el("div", "cell", "?");
    cover.appendChild(d);
    cells.push(d);
  }
  frame.appendChild(cover);
  main.appendChild(frame);

  const counter = C.el("div", "flag-counter");
  main.appendChild(counter);
  const list = C.el("div", "guess-list");
  main.appendChild(list);
  const pickBox = C.el("div", "pick-box");
  main.appendChild(pickBox);
  const pk = G.picker(pickBox, onGuess, new Set(st.guesses));

  render(false);
  if (!practice && !C.store.get("seen:" + GAME)) {
    C.store.set("seen:" + GAME, 1);
    help();
  } else if (st.done) setTimeout(stats, 400);

  function save() {
    if (!practice) C.store.set(GAME + ":day", st);
  }

  function render() {
    const open = st.done ? CELLS : Math.min(CELLS, 1 + st.guesses.length);
    cells.forEach((c, i) => c.classList.toggle("open", order.indexOf(i) < open));
    list.innerHTML = "";
    guessed().forEach((c) => list.appendChild(G.guessRow(c, answer)));
    for (let i = st.guesses.length; i < TRIES; i++) list.appendChild(C.el("div", "guess-row empty", "·"));
    counter.textContent = st.done
      ? st.won
        ? `Это ${answer.n}!`
        : `Это был флаг: ${answer.n}`
      : `Попытка ${st.guesses.length + 1} из ${TRIES}`;
    if (st.done) pk.disable();
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
    return `Флаг №${day} ${st.won ? st.guesses.length : "✕"}/${TRIES}\n${rows}\n${C.siteUrl()}`;
  }

  function stats() {
    let summary = null;
    if (st.done) {
      summary = C.el("div", "summary");
      summary.appendChild(C.el("div", null, st.won ? "Угадано" : "Это был флаг"));
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
      `<p>Флаг закрыт шестью кусочками. Сначала открыт один — угадай, чей это флаг.</p>
       <p>После каждой неверной догадки открывается ещё кусочек, а под флагом видно, <b>насколько далеко</b> твоя страна от загаданной и <b>в какую сторону</b> идти.</p>
       <p>Всего ${TRIES} попыток. Страны вводятся в поле внизу — подойдут и привычные названия вроде «США» или «Англия».</p>`
    );
  }
})();
