// Общее для всех игр: номер дня, сид, сохранения, статистика, клавиатура, тосты, шеринг.
// Подключается обычным <script>, чтобы сайт работал и с file://.
(function () {
  "use strict";

  const EPOCH = Date.UTC(2026, 9, 17); // день №1 — 17.10.2026
  const MSK = 3 * 3600 * 1000;
  const DAY = 86400 * 1000;

  // Номер сегодняшнего задания по московскому времени. ?d=N — посмотреть другой день (для отладки).
  function dayNumber() {
    const q = new URLSearchParams(location.search).get("d");
    if (q && /^\d+$/.test(q)) return +q;
    return Math.floor((Date.now() + MSK - EPOCH) / DAY) + 1;
  }

  function msToNextDay() {
    const now = Date.now() + MSK - EPOCH;
    return DAY - (now % DAY);
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const norm = (s) => s.toLowerCase().replace(/ё/g, "е");

  // ---------- словари ----------
  const dictCache = {};
  function dict(n) {
    if (!dictCache[n]) {
      const D = window.DICT;
      dictCache[n] = {
        valid: new Set(D["v" + n].split(" ")),
        answers: D["a" + n].split(" "),
      };
    }
    return dictCache[n];
  }

  // ---------- хранилище ----------
  const store = {
    get(key, def) {
      try {
        const v = localStorage.getItem("igry:" + key);
        return v == null ? def : JSON.parse(v);
      } catch (e) {
        return def;
      }
    },
    set(key, val) {
      try {
        localStorage.setItem("igry:" + key, JSON.stringify(val));
      } catch (e) {}
    },
  };

  function loadStats(game) {
    return Object.assign(
      { played: 0, wins: 0, streak: 0, maxStreak: 0, lastWinDay: 0, dist: {} },
      store.get(game + ":stats", {})
    );
  }

  // result: число (попытки/шаги) при победе или null при поражении
  function recordResult(game, day, result) {
    const s = loadStats(game);
    if (s.lastDay === day) return s; // уже учтено
    goal("finish", { game, won: result != null });
    s.lastDay = day;
    s.played++;
    if (result != null) {
      s.wins++;
      s.streak = s.lastWinDay === day - 1 ? s.streak + 1 : 1;
      s.lastWinDay = day;
      s.maxStreak = Math.max(s.maxStreak, s.streak);
      s.dist[result] = (s.dist[result] || 0) + 1;
    } else {
      s.streak = 0;
      s.dist.x = (s.dist.x || 0) + 1;
    }
    store.set(game + ":stats", s);
    return s;
  }

  // ---------- UI-мелочи ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function toast(msg, ms) {
    let box = document.querySelector(".toasts");
    if (!box) {
      box = el("div", "toasts");
      document.body.appendChild(box);
    }
    const t = el("div", "toast", msg);
    box.prepend(t);
    [...box.children].slice(2).forEach((old) => old.remove()); // не больше двух разом
    setTimeout(() => {
      t.classList.add("out");
      setTimeout(() => t.remove(), 300);
    }, ms || 1600);
  }

  function shake(node) {
    node.classList.remove("shake");
    void node.offsetWidth;
    node.classList.add("shake");
  }

  // Цель в Яндекс Метрике (если счётчик подключён — см. tools/build_seo.py).
  function goal(name, params) {
    try { if (window.ym && window.METRIKA_ID) window.ym(window.METRIKA_ID, "reachGoal", name, params); } catch (e) {}
  }

  async function share(text) {
    goal("share", { game: location.pathname.split("/").filter(Boolean).pop() });
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ text });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Скопировано — вставь другу");
    } catch (e) {
      prompt("Скопируй результат:", text);
    }
  }

  function modal(title, body) {
    closeModal();
    const back = el("div", "modal-back");
    const box = el("div", "modal");
    const head = el("div", "modal-head");
    head.appendChild(el("h2", null, title));
    const x = el("button", "icon-btn", "✕");
    x.setAttribute("aria-label", "Закрыть");
    x.onclick = closeModal;
    head.appendChild(x);
    box.appendChild(head);
    box.appendChild(body);
    back.appendChild(box);
    back.addEventListener("click", (e) => {
      if (e.target === back) closeModal();
    });
    document.body.appendChild(back);
    return box;
  }
  function closeModal() {
    document.querySelectorAll(".modal-back").forEach((m) => m.remove());
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const p = (n) => String(n).padStart(2, "0");
    return p(Math.floor(s / 3600)) + ":" + p(Math.floor((s % 3600) / 60)) + ":" + p(s % 60);
  }

  // Окно статистики. labels — подписи строк распределения (["1","2",...,"x"]).
  function showStats(game, opts) {
    const s = loadStats(game);
    const body = el("div", "stats");
    if (opts.summary) body.appendChild(opts.summary);

    // Сначала «Поделиться» и «Сыграй ещё» — чтобы их было видно без прокрутки.
    if (opts.shareText) {
      const foot = el("div", "stats-foot");
      const timer = el("div", "next");
      timer.appendChild(el("span", null, "Новое задание через"));
      const t = el("b", null, fmtTime(msToNextDay()));
      timer.appendChild(t);
      const iv = setInterval(() => {
        if (!t.isConnected) return clearInterval(iv);
        t.textContent = fmtTime(msToNextDay());
      }, 1000);
      foot.appendChild(timer);
      const btn = el("button", "btn primary", "Поделиться");
      btn.onclick = () => share(opts.shareText());
      foot.appendChild(btn);
      body.appendChild(foot);
      body.appendChild(moreGames(game));
    }

    const nums = el("div", "stat-nums");
    [
      [s.played, "сыграно"],
      [s.played ? Math.round((s.wins / s.played) * 100) : 0, "% побед"],
      [s.streak, "серия"],
      [s.maxStreak, "лучшая серия"],
    ].forEach(([v, l]) => {
      const c = el("div", "stat-num");
      c.appendChild(el("b", null, String(v)));
      c.appendChild(el("span", null, l));
      nums.appendChild(c);
    });
    body.appendChild(nums);

    if (opts.labels) {
      body.appendChild(el("h3", null, opts.distTitle || "Распределение"));
      const max = Math.max(1, ...opts.labels.map((k) => s.dist[k] || 0));
      opts.labels.forEach((k) => {
        const row = el("div", "dist-row");
        row.appendChild(el("span", "dist-k", k === "x" ? "✕" : k));
        const bar = el("div", "dist-bar" + (String(opts.highlight) === k ? " hl" : ""), String(s.dist[k] || 0));
        bar.style.width = Math.max(8, ((s.dist[k] || 0) / max) * 100) + "%";
        row.appendChild(bar);
        body.appendChild(row);
      });
    }
    modal("Статистика", body);
  }

  // «Сыграй ещё»: игры, которые сегодня ещё не решены (сначала совсем не начатые).
  function moreGames(current) {
    const day = dayNumber();
    const left = GAMES.filter((g) => g.id !== current)
      .map((g) => {
        const st = store.get(g.id + ":day", null);
        const today = st && st.day === day;
        return { g, started: !!today, done: !!(today && st.done) };
      })
      .filter((x) => !x.done)
      .sort((a, b) => a.started - b.started);
    if (!left.length) {
      const box = el("div", "more all-done");
      box.appendChild(el("b", null, "Все игры на сегодня пройдены 🎉"));
      box.appendChild(el("span", null, "Возвращайся завтра — будут новые задания."));
      return box;
    }
    const box = el("div", "more");
    box.appendChild(el("h3", null, "Сыграй ещё сегодня"));
    const list = el("div", "more-grid");
    left.forEach(({ g, started }) => {
      const a = el("a", "more-item");
      a.href = "../" + g.id + "/index.html";
      a.title = g.desc;
      a.style.setProperty("--game", g.accent);
      const ic = el("span", "more-icon");
      ic.innerHTML = icon(g.id);
      a.appendChild(ic);
      a.appendChild(el("b", null, g.name));
      if (started) a.appendChild(el("span", "more-badge", "начато"));
      list.appendChild(a);
    });
    box.appendChild(list);
    return box;
  }

  function showHelp(title, html) {
    const body = el("div", "help");
    body.innerHTML = html;
    modal(title, body);
  }

  // Иконки игр (24×24, цвет — currentColor).
  const ICONS = {
    slovo: '<rect x="2" y="8" width="6" height="8" rx="1.5" fill="currentColor"/><rect x="9" y="8" width="6" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="16" y="8" width="6" height="8" rx="1.5" fill="currentColor" opacity=".55"/>',
    vertikal: '<rect x="8" y="1.5" width="8" height="5.5" rx="1.4" fill="currentColor"/><rect x="8" y="8.5" width="8" height="5.5" rx="1.4" fill="currentColor" opacity=".55"/><rect x="8" y="15.5" width="8" height="5.5" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19.5 9v11m0 0-2.5-2.5m2.5 2.5 2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    chetyre: '<rect x="2.5" y="2.5" width="8.5" height="8.5" rx="2" fill="currentColor"/><rect x="13" y="2.5" width="8.5" height="8.5" rx="2" fill="currentColor" opacity=".55"/><rect x="2.5" y="13" width="8.5" height="8.5" rx="2" fill="currentColor" opacity=".55"/><rect x="13" y="13" width="8.5" height="8.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    lesenka: '<path d="M3 21h5v-5h5v-5h5V6h3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="3.5" r="2" fill="currentColor"/>',
    soty: '<path d="M1.8 7.6L4.6 2.8L10.2 2.8L13.0 7.6L10.2 12.4L4.6 12.4Z" fill="currentColor"/><path d="M11.0 7.6L13.8 2.8L19.4 2.8L22.2 7.6L19.4 12.4L13.8 12.4Z" fill="currentColor" opacity=".55"/><path d="M6.4 15.8L9.2 11.0L14.8 11.0L17.6 15.8L14.8 20.6L9.2 20.6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    chisla: '<path d="M6 3.5v7M2.5 7h7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M14.5 5.5h7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M3 15l6 6M9 15l-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M14.5 16h7M14.5 20h7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    flag: '<path d="M5 22V3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M5 4c3-1.8 5.5 1.6 8.5 0S18 3.2 20 4v9c-2-.8-3.5-.8-6.5.6S8 14.2 5 13z" fill="currentColor"/><path d="M5 8.5c3-1.8 5.5 1.6 8.5 0S18 7.7 20 8.5" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="2"/>',
    kontur: '<path d="M4 9.5 8 4.5l4 1.5 3.5-2.5 5 2.5L19 11l2 4-4.5 5L13 17.5 9 20l-3.5-3L6.5 13z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-dasharray="3 2.2"/><circle cx="12.5" cy="11.5" r="2" fill="currentColor"/>',
    strana: '<path d="M12 22s7-6.3 7-12.2A7 7 0 0 0 5 9.8C5 15.7 12 22 12 22z" fill="currentColor"/><circle cx="12" cy="9.8" r="2.6" fill="#000" fill-opacity=".25"/>',
    globus: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><ellipse cx="12" cy="12" rx="4" ry="9.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.8 9h18.4M2.8 15h18.4" stroke="currentColor" stroke-width="1.6"/><circle cx="16.5" cy="8" r="2.4" fill="currentColor"/>',
  };
  const icon = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id] || ""}</svg>`;

  // Все игры сайта: порядок = порядок на главной.
  const SITE = "Разминка";
  const GAMES = [
    { id: "slovo", name: "Слово дня", cat: "Слова", accent: "#2f9e6b", desc: "Угадай слово из 5 букв за 6 попыток." },
    { id: "vertikal", name: "Вертикаль", cat: "Слова", accent: "#7a5af5", desc: "«Слово дня», но догадки пишутся сверху вниз — по столбцу на попытку." },
    { id: "chetyre", name: "Четыре слова", cat: "Слова", accent: "#e2683a", desc: "Четыре слова разом, 9 попыток на все." },
    { id: "lesenka", name: "Лесенка", cat: "Слова", accent: "#c98a12", desc: "Из одного слова в другое, меняя по одной букве." },
    { id: "soty", name: "Соты", cat: "Слова", accent: "#e8a800", desc: "Собери как можно больше слов из семи букв." },
    { id: "chisla", name: "Числа", cat: "Числа", accent: "#2b7de9", desc: "Угадай верное равенство из 8 символов." },
    { id: "flag", name: "Флаг", cat: "География", accent: "#d93f4c", desc: "Флаг открывается по кусочку. Чья он?" },
    { id: "kontur", name: "Контур", cat: "География", accent: "#8a5a3c", desc: "Угадай страну по силуэту — подскажут расстояние и направление." },
    { id: "strana", name: "Страна", cat: "География", accent: "#0f9a9a", desc: "Угадай страну по приметам: материк, население, площадь." },
    { id: "globus", name: "Глобус", cat: "География", accent: "#3a6fd8", desc: "Чем ближе догадка к загаданной стране, тем горячее цвет." },
  ];

  // Шапка игры: логотип, название, кнопки справки/статистики/тренировки.
  function header(opts) {
    const game = GAMES.find((g) => g.id === opts.id);
    if (game) document.documentElement.style.setProperty("--game", game.accent);
    if (!document.title) document.title = opts.title + " — " + SITE; // SEO-заголовок из <head> не трогаем
    const h = el("header", "topbar");
    const brand = el("a", "brand");
    brand.href = "../index.html";
    brand.title = "Все игры";
    brand.appendChild(el("span", "brand-tile", "Р"));
    brand.appendChild(el("span", "brand-name", SITE));
    h.appendChild(brand);
    const t = el("div", "title");
    t.appendChild(el("h1", null, opts.title));
    t.appendChild(el("span", "sub", opts.practice ? "тренировка" : "№" + opts.day));
    h.appendChild(t);
    const right = el("div", "actions");
    const mk = (txt, title, fn) => {
      const b = el("button", "icon-btn", txt);
      b.title = title;
      b.setAttribute("aria-label", title);
      b.onclick = fn;
      right.appendChild(b);
      return b;
    };
    mk("?", "Как играть", opts.onHelp);
    mk("▥", "Статистика", opts.onStats);
    mk(opts.practice ? "☀" : "∞", opts.practice ? "К заданию дня" : "Тренировка", () => {
      const u = new URL(location.href);
      if (opts.practice) u.searchParams.delete("practice");
      else u.searchParams.set("practice", Date.now().toString(36));
      location.href = u.toString();
    });
    h.appendChild(right);
    document.body.prepend(h);
    if (opts.practice) document.body.classList.add("practice");
    return h;
  }

  // Детерминированно перемешанный пул: у каждой игры свой порядок, одинаковый у всех игроков.
  function seededShuffle(arr, seed) {
    const a = arr.slice();
    const rnd = mulberry32(seed);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- клавиатура ----------
  const ROWS = ["йцукенгшщзхъ", "фывапролджэ", "⏎ячсмитьбю⌫"];
  // Если раскладка английская — понимаем qwerty как йцукен.
  const LAT = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
  const CYR = "йцукенгшщзхъфывапролджэячсмитьбюё";

  // Символ с физической клавиатуры -> русская буква (понимает и английскую раскладку).
  function toCyr(key) {
    if (!key || key.length !== 1) return null;
    let k = key.toLowerCase();
    const li = LAT.indexOf(k);
    if (li >= 0) k = CYR[li];
    k = norm(k);
    return /[а-я]/.test(k) ? k : null;
  }

  // layout: { rows, map(key) -> символ клавиши или null } — для нестандартных клавиатур (цифры).
  function keyboard(container, onKey, layout) {
    const kb = el("div", "keyboard");
    const keys = {};
    (layout ? layout.rows : ROWS).forEach((r) => {
      const row = el("div", "kb-row");
      for (const ch of r) {
        const k = el("button", "key");
        k.type = "button";
        if (ch === "⏎") {
          k.textContent = "Ввод";
          k.classList.add("wide");
          k.dataset.k = "enter";
        } else if (ch === "⌫") {
          k.textContent = "⌫";
          k.classList.add("wide");
          k.dataset.k = "back";
          k.setAttribute("aria-label", "Стереть");
        } else {
          k.textContent = ch;
          k.dataset.k = ch;
          keys[ch] = k;
        }
        k.addEventListener("click", () => onKey(k.dataset.k));
        row.appendChild(k);
      }
      kb.appendChild(row);
    });
    container.appendChild(kb);

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest && e.target.closest("input, textarea")) return;
      if (document.querySelector(".modal-back")) {
        if (e.key === "Escape") closeModal();
        return;
      }
      let k = e.key;
      if (k === "Enter") return onKey("enter"), e.preventDefault();
      if (k === "Backspace") return onKey("back"), e.preventDefault();
      if (k.length !== 1) return;
      if (layout) {
        k = layout.map(k);
      } else {
        k = k.toLowerCase();
        const li = LAT.indexOf(k);
        if (li >= 0) k = CYR[li];
        k = norm(k);
      }
      if (k && keys[k]) {
        onKey(k);
        e.preventDefault();
      }
    });

    const rank = { absent: 1, present: 2, correct: 3 };
    return {
      keys,
      // Обычная раскраска: клавиша получает лучший из известных статусов.
      mark(ch, state) {
        const k = keys[ch];
        if (!k) return;
        if ((rank[state] || 0) > (rank[k.dataset.state] || 0)) {
          k.dataset.state = state;
        }
      },
      reset() {
        Object.values(keys).forEach((k) => {
          delete k.dataset.state;
          k.style.background = "";
        });
      },
    };
  }

  // Классическая оценка Wordle с повторами букв.
  function score(guess, sol) {
    const n = sol.length;
    const res = Array(n).fill("absent");
    const left = {};
    for (let i = 0; i < n; i++) {
      if (guess[i] === sol[i]) res[i] = "correct";
      else left[sol[i]] = (left[sol[i]] || 0) + 1;
    }
    for (let i = 0; i < n; i++) {
      if (res[i] === "correct") continue;
      if (left[guess[i]] > 0) {
        res[i] = "present";
        left[guess[i]]--;
      }
    }
    return res;
  }

  const EMOJI = { correct: "🟩", present: "🟨", absent: "⬛" };

  // Игра сообщает ответ дня (строкой или функцией, которая его посчитает). На странице ничего
  // не делает; tools/telegram_post.js запускает код игры с ANSWER_ONLY и так узнаёт ответ.
  function answer(value) {
    if (window.ANSWER_ONLY) throw { answer: typeof value === "function" ? value() : value };
  }

  function practiceSeed() {
    const p = new URLSearchParams(location.search).get("practice");
    if (p == null) return null;
    let h = 2166136261;
    for (const c of p) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
  }

  window.Core = {
    dayNumber, msToNextDay, mulberry32, norm, dict, store, loadStats, recordResult,
    el, toast, shake, share, modal, closeModal, showStats, showHelp, header, keyboard,
    score, EMOJI, practiceSeed, answer, GAMES, SITE, seededShuffle, toCyr, moreGames, icon,
    siteUrl: () => location.origin + location.pathname.replace(/[^/]*\/[^/]*$/, ""),
  };
})();
