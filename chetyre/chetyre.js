(function () {
  "use strict";
  const C = window.Core;
  const GAME = "chetyre";
  const N = 5, B = 4, TRIES = 9;
  const { valid, answers } = C.dict(N);

  const pseed = C.practiceSeed();
  const practice = pseed != null;
  const day = C.dayNumber();
  let sols;
  if (practice) {
    const rnd = C.mulberry32(pseed ^ 0x2545f491);
    sols = [];
    while (sols.length < B) {
      const w = answers[Math.floor(rnd() * answers.length)];
      if (!sols.includes(w)) sols.push(w);
    }
  } else {
    sols = Array.from({ length: B }, (_, i) => answers[((day - 1) * B + i + 701) % answers.length]);
  }
  C.answer(sols.join(", "));

  const saved = practice ? null : C.store.get(GAME + ":day", null);
  const st = saved && saved.day === day ? saved : { day, guesses: [], done: false, won: false };
  let cur = "";
  let busy = false;

  // На какой попытке разгадана доска (индекс) или -1.
  const solvedAt = (b, upto) => st.guesses.slice(0, upto).indexOf(sols[b]);

  C.header({ id: GAME, title: "Четыре слова", day, practice, onHelp: help, onStats: stats });
  const main = document.querySelector("main");
  const wrap = C.el("div", "quad");
  const boards = [];
  for (let b = 0; b < B; b++) {
    const bd = C.el("div", "board qboard");
    bd.style.gridTemplateColumns = `repeat(${N}, auto)`;
    const rows = [];
    for (let r = 0; r < TRIES; r++) {
      const tiles = [];
      for (let i = 0; i < N; i++) {
        const t = C.el("div", "tile");
        bd.appendChild(t);
        tiles.push(t);
      }
      rows.push(tiles);
    }
    wrap.appendChild(bd);
    boards.push({ el: bd, rows });
  }
  main.appendChild(wrap);
  const kb = C.keyboard(main, onKey);

  st.guesses.forEach((g, r) => paintRow(r, false));
  paintKeys();
  if (!practice && !C.store.get("seen:" + GAME)) {
    C.store.set("seen:" + GAME, 1);
    help();
  } else if (st.done) setTimeout(stats, 400);

  function save() {
    if (!practice) C.store.set(GAME + ":day", st);
  }

  function paintRow(r, animate) {
    const g = st.guesses[r];
    let wait = 0;
    boards.forEach((bd, b) => {
      const at = solvedAt(b, r);
      if (at >= 0) return; // доска уже разгадана раньше — дальше не пишем
      const res = C.score(g, sols[b]);
      bd.rows[r].forEach((t, i) => {
        t.textContent = g[i];
        t.classList.remove("filled");
        const apply = () => (t.dataset.state = res[i]);
        if (animate) {
          setTimeout(() => {
            t.classList.add("flip");
            setTimeout(apply, 180);
          }, i * 160);
        } else apply();
      });
      if (g === sols[b]) bd.el.classList.add("solved");
      wait = animate ? N * 160 + 200 : 0;
    });
    return wait;
  }

  // Клавиша делится на 4 четверти — по одной на каждую доску (как доски на экране).
  function paintKeys() {
    const rank = { absent: 1, present: 2, correct: 3 };
    const color = { correct: "var(--correct)", present: "var(--present)", absent: "var(--absent)" };
    Object.entries(kb.keys).forEach(([ch, key]) => {
      const q = sols.map((sol, b) => {
        const at = solvedAt(b, st.guesses.length);
        const upto = at >= 0 ? at + 1 : st.guesses.length;
        if (at >= 0) return "var(--key)";
        let best = null;
        for (let r = 0; r < upto; r++) {
          const g = st.guesses[r];
          const res = C.score(g, sol);
          for (let i = 0; i < N; i++) {
            if (g[i] === ch && (!best || rank[res[i]] > rank[best])) best = res[i];
          }
        }
        return best ? color[best] : "var(--key)";
      });
      const any = q.some((c) => c !== "var(--key)");
      key.style.background = any
        ? `linear-gradient(to right, ${q[0]} 50%, ${q[1]} 50%) top / 100% 50% no-repeat,
           linear-gradient(to right, ${q[2]} 50%, ${q[3]} 50%) bottom / 100% 50% no-repeat`
        : "";
      key.style.color = any ? "var(--on-color)" : "";
    });
  }

  function drawCurrent() {
    const r = st.guesses.length;
    if (r >= TRIES) return;
    boards.forEach((bd, b) => {
      if (solvedAt(b, r) >= 0) return;
      bd.rows[r].forEach((t, i) => {
        t.textContent = cur[i] || "";
        t.classList.toggle("filled", !!cur[i]);
      });
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
    if (cur.length < N) {
      C.shake(wrap);
      return C.toast("Мало букв");
    }
    if (!valid.has(cur)) {
      C.shake(wrap);
      return C.toast("Нет такого слова в словаре");
    }
    st.guesses.push(cur);
    cur = "";
    const r = st.guesses.length - 1;
    const allSolved = sols.every((_, b) => solvedAt(b, st.guesses.length) >= 0);
    if (allSolved || st.guesses.length === TRIES) {
      st.done = true;
      st.won = allSolved;
    }
    save();
    busy = true;
    const wait = paintRow(r, true);
    setTimeout(() => {
      busy = false;
      paintKeys();
      if (!st.done) return;
      if (!practice) C.recordResult(GAME, day, st.won ? st.guesses.length : null);
      if (st.won) C.toast("Все четыре! " + st.guesses.length + "/" + TRIES);
      else C.toast("Ответы: " + sols.map((s) => s.toUpperCase()).join(", "), 4000);
      setTimeout(stats, 1500);
    }, wait);
  }

  const NUM = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
  function shareText() {
    const cell = (b) => {
      const at = solvedAt(b, st.guesses.length);
      return at >= 0 ? NUM[at + 1] : "🟥";
    };
    return `Четыре слова №${day} ${st.won ? st.guesses.length : "✕"}/${TRIES}\n${cell(0)}${cell(1)}\n${cell(2)}${cell(3)}\n${C.siteUrl()}`;
  }

  function stats() {
    let summary = null;
    if (st.done) {
      summary = C.el("div", "summary");
      summary.appendChild(C.el("div", null, "Загаданы были"));
      summary.appendChild(C.el("div", "word", sols.join(" · ")));
    }
    C.showStats(GAME, {
      summary,
      labels: ["4", "5", "6", "7", "8", "9", "x"],
      distTitle: "Сколько попыток",
      highlight: st.won && !practice ? st.guesses.length : null,
      shareText: st.done && !practice ? shareText : null,
    });
  }

  function help() {
    C.showHelp(
      "Как играть",
      `<p>Загадано <b>четыре</b> существительных по ${N} букв. На всё про всё — ${TRIES} попыток.</p>
       <p>Каждое введённое слово попадает сразу на все четыре доски, и на каждой красится по правилам «Слова дня»: зелёная буква — на своём месте, жёлтая — есть в слове, но не тут, серая — нет.</p>
       <p>Разгаданная доска замирает. Чтобы победить, нужно открыть все четыре.</p>
       <p>Клавиши поделены на четверти — каждая показывает цвет для своей доски (левая верхняя четверть — левая верхняя доска и т. д.).</p>`
    );
  }
})();
