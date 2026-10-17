(function () {
  "use strict";
  const C = window.Core;
  const GAME = "slovo";
  const N = 5, TRIES = 6;
  const { valid, answers } = C.dict(N);

  const pseed = C.practiceSeed();
  const practice = pseed != null;
  const day = C.dayNumber();
  const solution = practice
    ? answers[Math.floor(C.mulberry32(pseed)() * answers.length)]
    : answers[(day - 1) % answers.length];

  const saved = practice ? null : C.store.get(GAME + ":day", null);
  const st = saved && saved.day === day ? saved : { day, guesses: [], done: false, won: false };
  let cur = "";
  let busy = false;

  C.header({ id: GAME, title: "Слово дня", day, practice, onHelp: help, onStats: stats });
  const main = document.querySelector("main");
  const board = C.el("div", "board");
  board.style.gridTemplateRows = `repeat(${TRIES}, auto)`;
  const rows = [];
  for (let r = 0; r < TRIES; r++) {
    const row = C.el("div", "board");
    row.style.gridTemplateColumns = `repeat(${N}, auto)`;
    const tiles = [];
    for (let i = 0; i < N; i++) {
      const t = C.el("div", "tile");
      row.appendChild(t);
      tiles.push(t);
    }
    board.appendChild(row);
    rows.push({ row, tiles });
  }
  main.appendChild(board);
  const kb = C.keyboard(main, onKey);

  st.guesses.forEach((g, r) => paintRow(r, g, false));
  if (!practice && !C.store.get("seen:" + GAME)) {
    C.store.set("seen:" + GAME, 1);
    help();
  } else if (st.done) setTimeout(stats, 400);

  function save() {
    if (!practice) C.store.set(GAME + ":day", st);
  }

  function paintRow(r, g, animate) {
    const res = C.score(g, solution);
    rows[r].tiles.forEach((t, i) => {
      t.textContent = g[i];
      const apply = () => {
        t.dataset.state = res[i];
        kb.mark(g[i], res[i]);
      };
      if (animate) {
        setTimeout(() => {
          t.classList.add("flip");
          setTimeout(apply, 220);
        }, i * 260);
      } else apply();
    });
    return animate ? N * 260 + 250 : 0;
  }

  function drawCurrent() {
    const r = st.guesses.length;
    if (r >= TRIES) return;
    rows[r].tiles.forEach((t, i) => {
      t.textContent = cur[i] || "";
      t.classList.toggle("filled", !!cur[i]);
    });
  }

  function onKey(k) {
    if (st.done || busy) return;
    if (k === "back") cur = cur.slice(0, -1);
    else if (k === "enter") return submit();
    else if (cur.length < N) cur += k;
    drawCurrent();
  }

  function submit() {
    const r = st.guesses.length;
    if (cur.length < N) {
      C.shake(rows[r].row);
      return C.toast("Мало букв");
    }
    if (!valid.has(cur)) {
      C.shake(rows[r].row);
      return C.toast("Нет такого слова в словаре");
    }
    st.guesses.push(cur);
    const g = cur;
    cur = "";
    busy = true;
    const won = g === solution;
    if (won || st.guesses.length === TRIES) {
      st.done = true;
      st.won = won;
    }
    save();
    const wait = paintRow(r, g, true);
    setTimeout(() => {
      busy = false;
      if (!st.done) return;
      if (!practice) C.recordResult(GAME, day, won ? st.guesses.length : null);
      if (won) {
        rows[r].tiles.forEach((t, i) => setTimeout(() => t.classList.add("bounce"), i * 90));
        C.toast(["Гениально!", "Блестяще!", "Отлично!", "Хорошо!", "Неплохо!", "Фух!"][r]);
      } else C.toast(solution.toUpperCase(), 3000);
      setTimeout(stats, 1300);
    }, wait);
  }

  function shareText() {
    const head = `Слово дня №${day} ${st.won ? st.guesses.length : "✕"}/${TRIES}`;
    const grid = st.guesses.map((g) => C.score(g, solution).map((s) => C.EMOJI[s]).join("")).join("\n");
    return head + "\n" + grid + "\n" + C.siteUrl();
  }

  function stats() {
    let summary = null;
    if (st.done) {
      summary = C.el("div", "summary");
      summary.appendChild(C.el("div", null, st.won ? "Угадано слово" : "Загадано было"));
      summary.appendChild(C.el("div", "word", solution));
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
      `<p>Угадай загаданное существительное из ${N} букв за ${TRIES} попыток. Каждый день — новое слово, одно на всех.</p>
       <p>После каждой попытки буквы подсвечиваются:</p>
       <div class="mini"><div class="tile" data-state="correct">к</div><div class="tile">о</div><div class="tile">ш</div><div class="tile">к</div><div class="tile">а</div></div>
       <p><b>К</b> есть в слове и стоит на своём месте.</p>
       <div class="mini"><div class="tile">с</div><div class="tile" data-state="present">л</div><div class="tile">о</div><div class="tile">в</div><div class="tile">о</div></div>
       <p><b>Л</b> есть в слове, но в другом месте.</p>
       <div class="mini"><div class="tile">п</div><div class="tile">а</div><div class="tile">р</div><div class="tile" data-state="absent">у</div><div class="tile">с</div></div>
       <p><b>У</b> в слове нет совсем.</p>
       <p>Подходят только существительные в начальной форме. Ё и Е считаются одной буквой.</p>
       <p>Кнопка ∞ — тренировка со случайным словом, на статистику не влияет.</p>`
    );
  }
})();
