(function () {
  "use strict";
  const C = window.Core;
  const GAME = "soty";
  const WORDS = window.SOTY.split(" ");
  // Редкие слова принимаются бонусом: дают очки, но в «из N слов» и цель дня не входят.
  const EXTRA = new Set((window.SOTY_EXTRA || "").split(" "));
  const RANKS = [
    ["Новичок", 0], ["Неплохо", 2], ["В пути", 5], ["Хорошо", 8], ["Уверенно", 15],
    ["Отлично", 25], ["Здорово", 40], ["Блестяще", 50], ["Гений", 70],
  ];

  const pseed = C.practiceSeed();
  const practice = pseed != null;
  const day = C.dayNumber();

  const points = (w, set) => (w.length === 4 ? 1 : w.length) + (new Set(w).size === set.size ? 7 : 0);

  // Задания заранее подобраны в tools/build_dict.py (7 букв, 15–70 слов) — по одному на день.
  function makePuzzle(index) {
    const P = window.SOTY_PUZZLES;
    const [center, outerLetters] = P[((index % P.length) + P.length) % P.length];
    const outer = [...outerLetters];
    const set = new Set([center, ...outer]);
    const words = WORDS.filter((w) => w.includes(center) && [...w].every((ch) => set.has(ch)));
    return { center, outer, words, set };
  }

  const pz = makePuzzle(practice ? Math.floor(C.mulberry32(pseed)() * 1e9) : day - 1);
  const answers = new Set(pz.words);
  C.answer(() => {
    const pangrams = pz.words.filter((w) => new Set(w).size === pz.set.size);
    return `всего слов: ${pz.words.length}, все буквы сразу: ${pangrams.join(", ")}`;
  });
  const maxScore = pz.words.reduce((s, w) => s + points(w, pz.set), 0);

  const saved = practice ? null : C.store.get(GAME + ":day", null);
  const st = saved && saved.day === day ? saved : { day, found: [], revealed: false };
  let outer = pz.outer.slice();
  let cur = "";

  const score = () => st.found.reduce((s, w) => s + points(w, pz.set), 0);
  function rankOf(sc) {
    const pct = (sc / maxScore) * 100;
    let r = 0;
    RANKS.forEach(([, p], i) => pct >= p && (r = i));
    return r;
  }

  C.header({ id: GAME, title: "Соты", day, practice, onHelp: help, onStats: stats });
  const main = document.querySelector("main");

  // ----- ранг -----
  const rankBox = C.el("div", "rank");
  const rankName = C.el("b");
  const rankBar = C.el("div", "rank-bar");
  RANKS.forEach(() => rankBar.appendChild(C.el("i")));
  const rankScore = C.el("span", "rank-score");
  rankBox.append(rankName, rankBar, rankScore);
  main.appendChild(rankBox);

  const foundBox = C.el("details", "found");
  const foundSum = C.el("summary");
  const foundList = C.el("div", "found-list");
  foundBox.append(foundSum, foundList);
  main.appendChild(foundBox);

  // ----- ввод и соты -----
  const word = C.el("div", "word-line");
  main.appendChild(word);
  const hive = C.el("div", "hive");
  main.appendChild(hive);
  const ctrls = C.el("div", "hive-ctrls");
  const bDel = C.el("button", "btn", "Стереть");
  const bMix = C.el("button", "btn round", "⟳");
  bMix.title = "Перемешать";
  const bOk = C.el("button", "btn primary", "Ввод");
  ctrls.append(bDel, bMix, bOk);
  main.appendChild(ctrls);
  bDel.onclick = () => key("back");
  bMix.onclick = () => {
    outer = C.seededShuffle(outer, Date.now() & 0xffff);
    drawHive();
  };
  bOk.onclick = () => key("enter");

  const reveal = C.el("button", "link-btn", "Показать все слова");
  reveal.onclick = () => {
    if (st.revealed || !confirm("Показать все слова? Дальше очки за сегодня не начисляются.")) return;
    st.revealed = true;
    save();
    render();
    foundBox.open = true;
  };
  main.appendChild(reveal);

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".modal-back")) return;
    if (e.key === "Enter") return key("enter"), e.preventDefault();
    if (e.key === "Backspace") return key("back"), e.preventDefault();
    if (e.key === " ") return bMix.click(), e.preventDefault();
    const k = C.toCyr(e.key);
    if (k) key(k);
  });

  drawHive();
  render();
  if (!practice && !C.store.get("seen:" + GAME)) {
    C.store.set("seen:" + GAME, 1);
    help();
  }

  function drawHive() {
    hive.innerHTML = "";
    const cell = (ch, cls) => {
      const b = C.el("button", "hex " + cls, ch);
      b.type = "button";
      b.onclick = () => key(ch);
      return b;
    };
    hive.appendChild(cell(pz.center, "center"));
    outer.forEach((ch, i) => hive.appendChild(cell(ch, "o" + i)));
  }

  function drawWord() {
    word.innerHTML = "";
    if (!cur) word.appendChild(C.el("span", "ph", "набери слово"));
    for (const ch of cur) {
      word.appendChild(C.el("span", ch === pz.center ? "c" : pz.set.has(ch) ? "" : "bad", ch));
    }
  }

  function save() {
    if (!practice) {
      const r = rankOf(score());
      st.statusText = `${RANKS[r][0]} · ${st.found.length} сл.`;
      st.done = r === RANKS.length - 1;
      st.won = st.done;
      C.store.set(GAME + ":day", st);
      const best = C.store.get(GAME + ":best", {});
      best[day] = Math.max(best[day] ?? 0, r);
      C.store.set(GAME + ":best", best);
    }
  }

  function render() {
    const sc = score();
    const r = rankOf(sc);
    rankName.textContent = RANKS[r][0];
    [...rankBar.children].forEach((d, i) => d.classList.toggle("on", i <= r));
    const next = RANKS[r + 1];
    rankScore.textContent = next ? `${sc} очк. · до «${next[0]}» ещё ${Math.ceil((next[1] / 100) * maxScore) - sc}` : `${sc} очк.`;
    const rare = st.found.filter((w) => !answers.has(w)).length;
    foundSum.textContent = `Найдено слов: ${st.found.length - rare} из ${pz.words.length}` + (rare ? ` + редких: ${rare}` : "");
    foundList.innerHTML = "";
    const show = st.revealed ? [...pz.words, ...st.found.filter((w) => !answers.has(w))] : st.found.slice().sort((a, b) => a.localeCompare(b, "ru"));
    show.forEach((w) => {
      const s = C.el("span", (st.found.includes(w) ? "got" : "miss") + (new Set(w).size === 7 ? " pan" : "") + (answers.has(w) ? "" : " rare"), w);
      if (!answers.has(w)) s.title = "Редкое слово — бонус";
      foundList.appendChild(s);
    });
    reveal.hidden = st.revealed;
    drawWord();
  }

  function key(k) {
    if (k === "back") cur = cur.slice(0, -1);
    else if (k === "enter") return submit();
    else if (cur.length < 20) cur += k;
    drawWord();
  }

  function fail(msg) {
    C.shake(word);
    C.toast(msg);
    setTimeout(() => {
      cur = "";
      drawWord();
    }, 500);
  }

  function submit() {
    if (!cur) return;
    if (st.revealed) return fail("Ответы уже открыты");
    if (cur.length < 4) return fail("Слишком коротко — нужно от 4 букв");
    if ([...cur].some((ch) => !pz.set.has(ch))) return fail("Есть лишние буквы");
    if (!cur.includes(pz.center)) return fail("Нет центральной буквы");
    if (st.found.includes(cur)) return fail("Уже найдено");
    const rare = !answers.has(cur);
    if (rare && !EXTRA.has(cur)) return fail("Нет в словаре");
    const before = rankOf(score());
    st.found.push(cur);
    const p = points(cur, pz.set);
    const pan = new Set(cur).size === 7;
    cur = "";
    save();
    render();
    const after = rankOf(score());
    C.toast(pan ? `Панграмма! +${p}` : rare ? `Редкое слово! +${p}` : `+${p}`);
    if (after > before) setTimeout(() => C.toast("Новый ранг: " + RANKS[after][0], 1800), 600);
  }

  function shareText() {
    const r = rankOf(score());
    const bar = RANKS.map((_, i) => (i <= r ? "🟨" : "⬜")).join("");
    return `Соты №${day} 🐝 ${RANKS[r][0]}\n${bar}\n${st.found.length} слов · ${score()} очков\n${C.siteUrl()}`;
  }

  function stats() {
    const best = C.store.get(GAME + ":best", {});
    const days = Object.keys(best).length;
    const geniuses = Object.values(best).filter((r) => r === RANKS.length - 1).length;
    const body = C.el("div", "stats");
    const sum = C.el("div", "summary");
    sum.appendChild(C.el("div", null, practice ? "Тренировка" : "Сегодня"));
    sum.appendChild(C.el("div", "word", RANKS[rankOf(score())][0]));
    const common = st.found.filter((w) => answers.has(w)).length;
    sum.appendChild(C.el("div", null, `${common} из ${pz.words.length} слов` + (common < st.found.length ? ` + редких: ${st.found.length - common}` : "") + ` · ${score()} очков из ${maxScore}`));
    body.appendChild(sum);
    const nums = C.el("div", "stat-nums");
    [[days, "дней играл"], [geniuses, "раз «Гений»"], [pz.words.filter((w) => new Set(w).size === 7).length, "панграмм сегодня"], [maxScore, "макс. очков"]].forEach(([v, l]) => {
      const c = C.el("div", "stat-num");
      c.append(C.el("b", null, String(v)), C.el("span", null, l));
      nums.appendChild(c);
    });
    body.appendChild(nums);
    if (!practice && st.found.length) {
      body.appendChild(C.shareBox(shareText()));
      body.appendChild(C.moreGames(GAME));
    }
    C.modal("Статистика", body);
  }

  function help() {
    C.showHelp(
      "Как играть",
      `<p>Собирай существительные из букв в сотах.</p>
       <ul>
        <li>В каждом слове должна быть <b>центральная</b> буква.</li>
        <li>Слова от 4 букв, буквы можно повторять.</li>
        <li>Только существительные в начальной форме, без имён и названий.</li>
       </ul>
       <p>Очки: слово из 4 букв — 1 очко, длиннее — по очку за букву. <b>Панграмма</b> — слово со всеми семью буквами — ещё +7.</p>
       <p>Редкие слова тоже засчитываются и дают очки, но в число слов дня не входят — это бонус.</p>
       <p>Набирай очки и поднимайся по рангам до «Гения». Кнопка ⟳ (или пробел) перемешивает буквы.</p>`
    );
  }
})();
