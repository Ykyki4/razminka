(function () {
  "use strict";
  const C = window.Core;
  const GAME = "vertikal";
  const N = 5, TRIES = 6; // 5 вертикальных попыток + последняя горизонтальная
  const { valid, answers } = C.dict(N);

  const pseed = C.practiceSeed();
  const practice = pseed != null;
  const day = C.dayNumber();
  const solution = practice
    ? answers[Math.floor(C.mulberry32(pseed ^ 0x5bd1e995)() * answers.length)]
    : answers[(day - 1 + 389) % answers.length];
  C.answer(solution);

  const saved = practice ? null : C.store.get(GAME + ":day", null);
  const st = saved && saved.day === day ? saved : { day, guesses: [], done: false, won: false };
  let cur = "";
  let busy = false;

  // Оценка попытки. Вертикальная попытка в столбце col сравнивается только с буквой ответа
  // в этом столбце: зелёная — это она и есть, жёлтая — буква есть в ответе, но не здесь.
  function vscore(g, col) {
    if (g === solution) return Array(N).fill("correct");
    if (col >= N) return C.score(g, solution);
    const res = Array(N).fill("absent");
    const left = {};
    for (const ch of solution) left[ch] = (left[ch] || 0) + 1;
    for (let i = 0; i < N; i++) {
      if (g[i] === solution[col]) {
        res[i] = "correct";
        left[g[i]]--;
        break;
      }
    }
    for (let i = 0; i < N; i++) {
      if (res[i] === "correct") continue;
      if (left[g[i]] > 0) {
        res[i] = "present";
        left[g[i]]--;
      }
    }
    return res;
  }

  // Клетки попытки k: столбец k сверху вниз, а шестая — нижняя строка слева направо.
  const cellsOf = (k) =>
    Array.from({ length: N }, (_, i) => (k < N ? [i, k] : [N, i]));

  C.header({ id: GAME, title: "Вертикаль", day, practice, onHelp: help, onStats: stats });
  const main = document.querySelector("main");
  const board = C.el("div", "board vboard");
  board.style.gridTemplateColumns = `repeat(${N}, auto)`;
  const grid = [];
  for (let r = 0; r <= N; r++) {
    grid.push([]);
    for (let c = 0; c < N; c++) {
      const t = C.el("div", "tile" + (r === N ? " last-row" : ""));
      board.appendChild(t);
      grid[r].push(t);
    }
  }
  main.appendChild(board);
  const kb = C.keyboard(main, onKey);

  st.guesses.forEach((g, k) => paint(k, g, false));
  highlight();
  if (!practice && !C.store.get("seen:" + GAME)) {
    C.store.set("seen:" + GAME, 1);
    help();
  } else if (st.done) setTimeout(stats, 400);

  function save() {
    if (!practice) C.store.set(GAME + ":day", st);
  }

  function highlight() {
    grid.flat().forEach((t) => t.classList.remove("active"));
    if (st.done) return;
    cellsOf(st.guesses.length).forEach(([r, c]) => {
      if (!grid[r][c].dataset.state) grid[r][c].classList.add("active");
    });
  }

  function paint(k, g, animate) {
    const res = vscore(g, k);
    cellsOf(k).forEach(([r, c], i) => {
      const t = grid[r][c];
      t.textContent = g[i];
      t.classList.remove("filled", "active");
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
    const k = st.guesses.length;
    if (k >= TRIES) return;
    cellsOf(k).forEach(([r, c], i) => {
      const t = grid[r][c];
      t.textContent = cur[i] || "";
      t.classList.toggle("filled", !!cur[i]);
    });
  }

  function onKey(key) {
    if (st.done || busy) return;
    if (key === "back") cur = cur.slice(0, -1);
    else if (key === "enter") return submit();
    else if (cur.length < N) cur += key;
    drawCurrent();
  }

  function submit() {
    const k = st.guesses.length;
    if (cur.length < N) {
      C.shake(board);
      return C.toast("Мало букв");
    }
    if (!valid.has(cur)) {
      C.shake(board);
      return C.toast("Нет такого слова в словаре");
    }
    const g = cur;
    st.guesses.push(g);
    cur = "";
    busy = true;
    const won = g === solution;
    if (won || st.guesses.length === TRIES) {
      st.done = true;
      st.won = won;
    }
    save();
    const wait = paint(k, g, true);
    setTimeout(() => {
      busy = false;
      highlight();
      if (!st.done) {
        if (st.guesses.length === N) C.toast("Последняя попытка — по горизонтали", 2200);
        return;
      }
      if (!practice) C.recordResult(GAME, day, won ? st.guesses.length : null);
      if (won) C.toast(["Ясновидец!", "Блестяще!", "Отлично!", "Хорошо!", "Неплохо!", "Фух!"][k]);
      else C.toast(solution.toUpperCase(), 3000);
      setTimeout(stats, 1300);
    }, wait);
  }

  function shareText() {
    const n = st.guesses.length;
    const lines = [];
    for (let r = 0; r < N; r++) {
      let line = "";
      for (let c = 0; c < Math.min(n, N); c++) line += C.EMOJI[vscore(st.guesses[c], c)[r]];
      lines.push(line);
    }
    if (n > N) lines.push(vscore(st.guesses[N], N).map((s) => C.EMOJI[s]).join(""));
    return `Вертикаль №${day} ${st.won ? n : "✕"}/${TRIES}\n${lines.join("\n")}\n${C.siteUrl()}`;
  }

  function stats() {
    let summary = null;
    if (st.done) {
      summary = C.el("div", "summary");
      summary.appendChild(C.el("div", null, st.won ? "Угадано слово" : "Загадано было"));
      summary.append(...C.defSummary([solution]));
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
    const col = (word, states) =>
      `<div class="mini col">${[...word]
        .map((ch, i) => `<div class="tile"${states[i] ? ` data-state="${states[i]}"` : ""}>${ch}</div>`)
        .join("")}</div>`;
    C.showHelp(
      "Как играть",
      `<p>Угадай существительное из ${N} букв. Но слова пишутся <b>сверху вниз</b>: первая попытка — в первый столбец, вторая — во второй, и так далее.</p>
       <p>Представь, что ответ лежит в нижней строке. Цвета в столбце говорят про <b>букву ответа под этим столбцом</b>:</p>
       <div style="display:flex;gap:18px;align-items:flex-start">
         ${col("книга", ["absent", "present", "absent", "absent", "correct"])}
         <div>
           <p style="margin-top:0">Слово КНИГА в первом столбце.</p>
           <p><b>А</b> зелёная — ответ <b>начинается</b> на А (не важно, на какой высоте она стоит).</p>
           <p><b>Н</b> жёлтая — она есть в ответе, но не первая.</p>
           <p>Серых букв в ответе нет вообще.</p>
         </div>
       </div>
       <p>Если пять столбцов не помогли, шестая попытка пишется по горизонтали в нижнюю строку и красится как в обычном «Слове дня».</p>
       <p>Угадал слово целиком в любой попытке — победа.</p>`
    );
  }
})();
