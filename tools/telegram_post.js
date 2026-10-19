// Посты в Telegram-канал, запускаются из .github/workflows/telegram.yml:
//   MODE=morning (8 утра по Москве) — «Разминка №N готова» со ссылками на все игры;
//   MODE=answers (днём) — вчерашние ответы под спойлером.
//
// Переменные окружения: TG_TOKEN — токен бота, TG_CHAT — @канал (бот должен быть его админом).
// Без TG_TOKEN (или с DRY_RUN=1) только печатает пост.
// Запуск руками: node tools/telegram_post.js  или  MODE=answers node tools/telegram_post.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SITE = "https://ykyki4.github.io/razminka/";
// Метка для Метрики: встроенный браузер Telegram не передаёт referrer, без неё переходы из канала
// попадают в «Прямые заходы».
const UTM = "?utm_source=telegram&utm_medium=channel";
const CAT_EMOJI = { "Слова": "🔤", "Числа": "🔢", "География": "🌍" };
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

// Запускает скрипты страницы сайта в песочнице. Список игр, номер дня и ответы берём
// из самого сайта, чтобы ничего не разъезжалось.
function sandbox(day) {
  const ctx = { location: { search: day ? `?d=${day}` : "", origin: "", pathname: "/" }, document: {}, navigator: {}, URLSearchParams, console };
  ctx.window = ctx.self = ctx;
  return vm.createContext(ctx);
}
const run = (ctx, file) => vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx, { filename: file });

function loadCore() {
  const ctx = sandbox();
  run(ctx, "assets/core.js");
  return ctx.Core;
}

// Ответ игры за день: выполняем её скрипты по порядку, C.answer() бросает ответ наружу.
function answerOf(id, day) {
  const html = fs.readFileSync(path.join(ROOT, id, "index.html"), "utf8");
  const ctx = sandbox(day);
  ctx.ANSWER_ONLY = true;
  try {
    for (const [, src] of html.matchAll(/<script src="([^"?]+)/g)) run(ctx, path.join(id, src));
  } catch (e) {
    if (e && e.answer) return e.answer;
    throw e;
  }
  throw new Error(`${id}: игра не сообщила ответ (нет C.answer?)`);
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function dateOf(day) {
  const d = new Date(Date.UTC(2026, 9, 17) + (day - 1) * 86400000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function morningPost(C) {
  const day = C.dayNumber();
  const cats = [];
  for (const g of C.GAMES) {
    let c = cats.find((x) => x.name === g.cat);
    if (!c) cats.push((c = { name: g.cat, games: [] }));
    c.games.push(`<a href="${SITE}${g.id}/${esc(UTM)}">${g.name}</a>`);
  }
  return {
    text: [
      `🧩 <b>Разминка №${day}</b> · ${dateOf(day)}`,
      "Новые задания готовы!",
      "",
      ...cats.map((c) => `${CAT_EMOJI[c.name] || "•"} ${c.name}: ${c.games.join(" · ")}`),
      "",
      "Сколько попыток ушло у тебя? Делись результатом 👇",
    ].join("\n"),
    button: "Играть ▶",
  };
}

function answersPost(C) {
  const day = C.dayNumber() - 1;
  const lines = C.GAMES.map((g) => `<b>${g.name}</b>: <tg-spoiler>${esc(answerOf(g.id, day))}</tg-spoiler>`);
  return {
    text: [
      `🔑 <b>Ответы Разминки №${day}</b> · ${dateOf(day)}`,
      "Нажми на скрытый текст, чтобы открыть.",
      "",
      ...lines,
      "",
      "Что далось труднее всего? Пиши в комментариях 👇",
    ].join("\n"),
    button: "Сыграть сегодняшнюю ▶",
  };
}

async function main() {
  const C = loadCore();
  const post = process.env.MODE === "answers" ? answersPost(C) : morningPost(C);
  const token = process.env.TG_TOKEN;
  if (!token || process.env.DRY_RUN === "1") {
    console.log(post.text);
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.TG_CHAT,
      text: post.text,
      parse_mode: "HTML",
      link_preview_options: { url: SITE, prefer_large_media: true, show_above_text: false },
      reply_markup: { inline_keyboard: [[{ text: post.button, url: SITE + UTM }]] },
    }),
  });
  const body = await res.json();
  if (!body.ok) {
    console.error("Telegram ответил ошибкой:", body.description);
    process.exit(1);
  }
  console.log("опубликовано, message_id", body.result.message_id);
}

main();
