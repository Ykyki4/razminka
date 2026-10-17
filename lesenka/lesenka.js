(function () {
  "use strict";
  const C = window.Core;
  const GAME = "lesenka";
  const N = 4;
  const ABC = "абвгдежзийклмнопрстуфхцчшщъыьэюя";
  const { valid, answers } = C.dict(N);

  const pseed = C.practiceSeed();
  const practice = pseed != null;
  const day = C.dayNumber();

  function neighbors(w) {
    const out = [];
    for (let i = 0; i < N; i++) {
      for (const c of ABC) {
        if (c === w[i]) continue;
        const x = w.slice(0, i) + c + w.slice(i + 1);
        if (valid.has(x)) out.push(x);
      }
    }
    return out;
  }

  // Расстояния от слова до всех достижимых.
  function bfs(from) {
    const d = new Map([[from, 0]]);
    const q = [from];
    for (let h = 0; h < q.length; h++) {
      const w = q[h];
      for (const x of neighbors(w)) {
        if (!d.has(x)) {
          d.set(x, d.get(w) + 1);
          q.push(x);
        }
      }
    }
    return d;
  }

  // Пара слов на день: оба из списка частых слов, кратчайший путь 4–5 шагов.
  function makePuzzle(seed) {
    const rnd = C.mulberry32(seed);
    for (let tries = 0; tries < 200; tries++) {
      const start = answers[Math.floor(rnd() * answers.length)];
      const d = bfs(start);
      const cand = answers.filter((w) => {
        const k = d.get(w);
        return k >= 4 && k <= 5;
      });
      if (cand.length) return { start, target: cand[Math.floor(rnd() * cand.length)] };
    }
    return { start: "коза", target: "роза" };
  }

  const { start, target } = makePuzzle(practice ? pseed : Math.imul(day, 2654435761) ^ 0x9e3779b9);
  const distToTarget = bfs(target); // от любого слова до цели — для подсказок и минимума
  const best = distToTarget.get(start);

  const saved = practice ? null : C.store.get(GAME + ":day", null);
  const st =
    saved && saved.day === day
      ? saved
      : { day, chain: [start], hints: 0, done: false, won: false };
  let cur = "";
  const steps = () => st.chain.length - 1;

  C.header({ id: GAME, title: "Лесенка", day, practice, onHelp: help, onStats: stats });
  const main = document.querySelector("main");

  const info = C.el("div", "ladder-info");
  main.appendChild(info);
  const scroller = C.el("div", "ladder");
  main.appendChild(scroller);

  const controls = C.el("div", "ladder-controls");
  const undoBtn = C.el("button", "btn", "↶ Шаг назад");
  const hintBtn = C.el("button", "btn", "💡 Подсказка");
  const giveBtn = C.el("button", "btn", "Сдаться");
  undoBtn.onclick = undo;
  hintBtn.onclick = hint;
  giveBtn.onclick = giveUp;
  controls.append(undoBtn, hintBtn, giveBtn);
  main.appendChild(controls);

  const kb = C.keyboard(main, onKey);
  let inputRow = null;

  render();
  if (!practice && !C.store.get("seen:" + GAME)) {
    C.store.set("seen:" + GAME, 1);
    help();
  } else if (st.done) setTimeout(stats, 400);

  function save() {
    if (!practice) C.store.set(GAME + ":day", st);
  }

  // Подсветка: зелёная буква уже совпадает с целью на этом месте,
  // рамка цвета игры — буква, которую поменяли на этом шаге.
  function paintTile(t, ch, i, prev) {
    t.textContent = ch || "";
    t.classList.toggle("filled", !!ch);
    if (ch && ch === target[i]) t.dataset.state = "correct";
    else delete t.dataset.state;
    t.classList.toggle("changed", !!(ch && prev && ch !== prev[i]));
  }

  function rowOf(word, prev, kind) {
    const row = C.el("div", "lrow " + kind);
    for (let i = 0; i < N; i++) {
      const t = C.el("div", "tile");
      if (kind === "target") t.textContent = word[i];
      else paintTile(t, word[i], i, prev);
      row.appendChild(t);
    }
    return row;
  }

  function render() {
    info.innerHTML = "";
    info.append(
      C.el("span", null, `Шагов: ${steps()}`),
      C.el("span", null, `Минимум: ${best}`),
      C.el("span", null, `Подсказок: ${st.hints}`)
    );

    scroller.innerHTML = "";
    st.chain.forEach((w, i) => {
      scroller.appendChild(rowOf(w, i ? st.chain[i - 1] : null, i === 0 ? "start" : "step"));
    });
    inputRow = null;
    if (!st.done) {
      inputRow = C.el("div", "lrow input");
      for (let i = 0; i < N; i++) inputRow.appendChild(C.el("div", "tile"));
      scroller.appendChild(inputRow);
      drawCurrent();
      scroller.appendChild(C.el("div", "lgap", "⋮"));
      scroller.appendChild(rowOf(target, null, "target"));
    } else if (!st.won) {
      scroller.appendChild(C.el("div", "lgap", "⋮"));
      scroller.appendChild(rowOf(target, null, "target"));
    }
    scroller.scrollTop = scroller.scrollHeight;
    [undoBtn, hintBtn, giveBtn].forEach((b) => (b.disabled = st.done));
    undoBtn.disabled = st.done || st.chain.length < 2;
  }

  function drawCurrent() {
    if (!inputRow) return;
    const last = st.chain[st.chain.length - 1];
    // Ещё не набранные буквы показываем бледно из предыдущего слова — видно, что меняется.
    [...inputRow.children].forEach((t, i) => {
      if (cur[i]) {
        paintTile(t, cur[i], i, last);
        t.classList.remove("ghost");
      } else {
        paintTile(t, null, i, null);
        t.textContent = last[i];
        t.classList.add("ghost");
      }
      t.classList.toggle("active", i === cur.length);
    });
  }

  function onKey(k) {
    if (st.done) return;
    if (k === "back") cur = cur.slice(0, -1);
    else if (k === "enter") return submit();
    else if (cur.length < N) cur += k;
    drawCurrent();
  }

  function fail(msg) {
    if (inputRow) C.shake(inputRow);
    C.toast(msg);
  }

  function submit() {
    const last = st.chain[st.chain.length - 1];
    if (cur.length < N) return fail("Нужно слово из " + N + " букв");
    let diff = 0;
    for (let i = 0; i < N; i++) if (cur[i] !== last[i]) diff++;
    if (diff === 0) return fail("Это то же самое слово");
    if (diff > 1) return fail("Меняй ровно одну букву");
    if (!valid.has(cur)) return fail("Нет такого слова в словаре");
    if (st.chain.includes(cur)) return fail("Это слово уже было");
    pushWord(cur);
  }

  function pushWord(w) {
    st.chain.push(w);
    cur = "";
    if (w === target) {
      st.done = true;
      st.won = true;
      if (!practice) C.recordResult(GAME, day, String(Math.min(3, steps() - best)));
      const extra = steps() - best;
      C.toast(st.hints ? `Дошёл! Подсказок: ${st.hints}` : extra === 0 ? "Идеально — минимальный путь!" : `Готово! Лишних шагов: ${extra}`, 2200);
      setTimeout(stats, 1400);
    }
    save();
    render();
  }

  function undo() {
    if (st.done || st.chain.length < 2) return;
    st.chain.pop();
    cur = "";
    save();
    render();
  }

  function hint() {
    if (st.done) return;
    const last = st.chain[st.chain.length - 1];
    const d = distToTarget.get(last);
    if (d == null) {
      // Зашли в тупик, откуда до цели не добраться — откатываемся к ближайшему пригодному слову.
      return C.toast("Отсюда до цели не дойти — вернись назад");
    }
    const next = neighbors(last).find((x) => distToTarget.get(x) === d - 1 && !st.chain.includes(x));
    if (!next) return C.toast("Подсказка не нашлась — попробуй шаг назад");
    st.hints++;
    pushWord(next);
  }

  function giveUp() {
    if (st.done) return;
    if (!confirm("Сдаться и посмотреть кратчайший путь?")) return;
    st.done = true;
    st.won = false;
    if (!practice) C.recordResult(GAME, day, null);
    save();
    render();
    stats();
  }

  function shortestPath() {
    const path = [start];
    let w = start;
    while (w !== target) {
      const d = distToTarget.get(w);
      w = neighbors(w).find((x) => distToTarget.get(x) === d - 1);
      path.push(w);
    }
    return path;
  }

  function shareText() {
    const lines = [];
    for (let i = 1; i < st.chain.length; i++) {
      const a = st.chain[i - 1], b = st.chain[i];
      lines.push([...b].map((ch, j) => (ch === target[j] ? "🟩" : ch !== a[j] ? "🟨" : "⬜")).join(""));
    }
    const head = st.won
      ? `Лесенка №${day}: ${start.toUpperCase()} → ${target.toUpperCase()} за ${steps()} (минимум ${best})${st.hints ? " 💡" + st.hints : ""}`
      : `Лесенка №${day}: ${start.toUpperCase()} → ${target.toUpperCase()} — не дошёл`;
    return head + "\n" + lines.join("\n") + "\n" + C.siteUrl();
  }

  function stats() {
    let summary = null;
    if (st.done) {
      summary = C.el("div", "summary");
      summary.appendChild(C.el("div", null, "Кратчайший путь"));
      summary.appendChild(C.el("div", "word path", shortestPath().join(" → ")));
    }
    C.showStats(GAME, {
      summary,
      labels: ["0", "1", "2", "3", "x"],
      distTitle: "Лишних шагов (3 = три и больше)",
      highlight: st.won && !practice ? String(Math.min(3, steps() - best)) : null,
      shareText: st.done && !practice ? shareText : null,
    });
  }

  function help() {
    C.showHelp(
      "Как играть",
      `<p>Доберись от верхнего слова до нижнего, меняя <b>по одной букве</b> за шаг. Каждое промежуточное слово должно быть существительным из ${N} букв.</p>
       ${["коза", "коса", "роса", "роза"]
         .map((w, i, a) => `<div class="mini">${[...w]
           .map((ch, j) => `<div class="tile filled${i && ch !== a[i - 1][j] ? " changed" : ""}"${ch === "роза"[j] ? ' data-state="correct"' : ""}>${ch}</div>`)
           .join("")}</div>`)
         .join("")}
       <p><b>Зелёная</b> буква уже стоит так же, как в цели. <b>Рамкой</b> отмечена буква, которую поменяли на этом шаге.</p>
       <p>Чем меньше шагов, тем лучше; сверху видно, сколько шагов в самом коротком пути.</p>
       <p>Ошибся — жми «Шаг назад». Застрял — «Подсказка» сделает за тебя один правильный шаг (это попадёт в результат).</p>`
    );
  }
})();
