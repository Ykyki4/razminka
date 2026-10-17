(function () {
  "use strict";
  const C = window.Core;
  const GAME = "chisla";
  const N = 8, TRIES = 6;
  const OPS = "+-×÷";

  const pseed = C.practiceSeed();
  const practice = pseed != null;
  const day = C.dayNumber();

  // Разбор и проверка равенства. Возвращает null, если всё верно, иначе текст ошибки.
  function check(s) {
    if (s.length !== N) return "Нужно " + N + " символов";
    const parts = s.split("=");
    if (parts.length !== 2) return "Нужен ровно один знак «=»";
    const [lhs, rhs] = parts;
    if (!/^\d+$/.test(rhs)) return "Справа от «=» должно быть только число";
    const toks = lhs.match(/\d+|[+\-×÷]/g) || [];
    if (toks.join("") !== lhs || !toks.length) return "Непонятное выражение";
    if (toks.length < 3) return "Слева нужно хотя бы одно действие";
    for (let i = 0; i < toks.length; i++) {
      const isNum = /^\d+$/.test(toks[i]);
      if (isNum !== (i % 2 === 0)) return "Знаки должны стоять между числами";
      if (isNum && toks[i].length > 1 && toks[i][0] === "0") return "Числа не начинаются с нуля";
    }
    if (rhs.length > 1 && rhs[0] === "0") return "Числа не начинаются с нуля";
    const v = evaluate(toks);
    if (v == null) return "Делится не нацело";
    if (v !== +rhs) return "Равенство неверное";
    return null;
  }

  // Сначала × и ÷, потом + и −. Деление только нацело.
  function evaluate(toks) {
    const t = toks.map((x) => (/^\d+$/.test(x) ? +x : x));
    const mul = [t[0]];
    for (let i = 1; i < t.length; i += 2) {
      const op = t[i], n = t[i + 1];
      if (op === "×") mul[mul.length - 1] *= n;
      else if (op === "÷") {
        if (n === 0 || mul[mul.length - 1] % n) return null;
        mul[mul.length - 1] /= n;
      } else mul.push(op, n);
    }
    let v = mul[0];
    for (let i = 1; i < mul.length; i += 2) v = mul[i] === "+" ? v + mul[i + 1] : v - mul[i + 1];
    return v;
  }

  // Загаданное равенство дня: случайное, но без скучных ×1, ÷1 и нулей слева.
  function generate(seed) {
    const rnd = C.mulberry32(seed);
    const num = (max) => 1 + Math.floor(rnd() * max);
    for (let k = 0; k < 20000; k++) {
      const ops = rnd() < 0.55 ? 2 : 1;
      let lhs = String(num(ops === 1 ? 99 : 20));
      const used = [];
      for (let i = 0; i < ops; i++) {
        const op = OPS[Math.floor(rnd() * 4)];
        const n = num(ops === 1 ? 99 : 20);
        if ((op === "×" || op === "÷") && n === 1) continue;
        lhs += op + n;
        used.push(op);
      }
      if (used.length !== ops) continue;
      const v = evaluate(lhs.match(/\d+|[+\-×÷]/g));
      if (v == null || v < 0) continue;
      const s = lhs + "=" + v;
      if (s.length === N && !check(s)) return s;
    }
    return "12+35=47";
  }

  const solution = generate(practice ? pseed : Math.imul(day, 0x2c1b3c6d) ^ 0x51ed27);

  const saved = practice ? null : C.store.get(GAME + ":day", null);
  const st = saved && saved.day === day ? saved : { day, guesses: [], done: false, won: false };
  let cur = "";
  let busy = false;

  C.header({ id: GAME, title: "Числа", day, practice, onHelp: help, onStats: stats });
  const main = document.querySelector("main");
  const board = C.el("div", "board");
  const rows = [];
  for (let r = 0; r < TRIES; r++) {
    const row = C.el("div", "board nrow");
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
  const MAP = { "*": "×", x: "×", "/": "÷", ":": "÷" };
  const kb = C.keyboard(main, onKey, {
    rows: ["1234567890", "+-×÷=", "⏎⌫"],
    map: (k) => MAP[k] || k,
  });

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
          setTimeout(apply, 200);
        }, i * 200);
      } else apply();
    });
    return animate ? N * 200 + 250 : 0;
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
    const err = check(cur);
    if (err) {
      C.shake(rows[r].row);
      return C.toast(err);
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
    const wait = paintRow(r, g, true);
    setTimeout(() => {
      busy = false;
      if (!st.done) return;
      if (!practice) C.recordResult(GAME, day, won ? st.guesses.length : null);
      C.toast(won ? "Сошлось!" : solution, 3000);
      setTimeout(stats, 1300);
    }, wait);
  }

  function shareText() {
    const grid = st.guesses.map((g) => C.score(g, solution).map((s) => C.EMOJI[s]).join("")).join("\n");
    return `Числа №${day} ${st.won ? st.guesses.length : "✕"}/${TRIES}\n${grid}\n${C.siteUrl()}`;
  }

  function stats() {
    let summary = null;
    if (st.done) {
      summary = C.el("div", "summary");
      summary.appendChild(C.el("div", null, st.won ? "Угадано равенство" : "Загадано было"));
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
    const mini = (s, st) => `<div class="mini">${[...s].map((ch, i) => `<div class="tile"${st[i] ? ` data-state="${st[i]}"` : ""}>${ch}</div>`).join("")}</div>`;
    C.showHelp(
      "Как играть",
      `<p>Загадано верное равенство из ${N} символов — цифры и знаки <b>+ − × ÷ =</b>. Угадай его за ${TRIES} попыток.</p>
       <p>Каждая попытка тоже должна быть верным равенством. Справа от «=» — только число.</p>
       ${mini("12+35=47", ["correct", "", "present", "", "", "", "", "absent"])}
       <p><b>1</b> на своём месте, <b>+</b> есть, но в другом месте, <b>7</b> нет совсем.</p>
       <p>Сначала считаются × и ÷, потом + и −. Делить можно только нацело. Числа не начинаются с нуля.</p>`
    );
  }
})();
