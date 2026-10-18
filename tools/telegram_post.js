// Ежедневный пост в Telegram-канал: «Разминка №N готова» со ссылками на все игры.
// Запускается из .github/workflows/telegram.yml в 8 утра по Москве.
//
// Переменные окружения: TG_TOKEN — токен бота, TG_CHAT — @канал (бот должен быть его админом).
// Без TG_TOKEN (или с DRY_RUN=1) только печатает пост.
// Запуск руками: node tools/telegram_post.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SITE = "https://ykyki4.github.io/razminka/";
const CAT_EMOJI = { "Слова": "🔤", "Числа": "🔢", "География": "🌍" };
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

// Список игр и номер дня берём из самого сайта, чтобы не разъезжались.
function loadCore() {
  const ctx = { window: {}, location: { search: "", origin: "", pathname: "/" }, document: {}, navigator: {}, URLSearchParams };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "assets", "core.js"), "utf8"), ctx);
  return ctx.window.Core;
}

function buildPost(C) {
  const day = C.dayNumber();
  const msk = new Date(Date.now() + 3 * 3600 * 1000);
  const date = `${msk.getUTCDate()} ${MONTHS[msk.getUTCMonth()]}`;
  const cats = [];
  for (const g of C.GAMES) {
    let c = cats.find((x) => x.name === g.cat);
    if (!c) cats.push((c = { name: g.cat, games: [] }));
    c.games.push(`<a href="${SITE}${g.id}/">${g.name}</a>`);
  }
  const lines = [
    `🧩 <b>Разминка №${day}</b> · ${date}`,
    "Новые задания готовы!",
    "",
    ...cats.map((c) => `${CAT_EMOJI[c.name] || "•"} ${c.name}: ${c.games.join(" · ")}`),
    "",
    "Сколько попыток ушло у тебя? Делись результатом 👇",
  ];
  return lines.join("\n");
}

async function main() {
  const text = buildPost(loadCore());
  const token = process.env.TG_TOKEN;
  const chat = process.env.TG_CHAT;
  if (!token || process.env.DRY_RUN === "1") {
    console.log(text);
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chat,
      text,
      parse_mode: "HTML",
      link_preview_options: { url: SITE, prefer_large_media: true, show_above_text: false },
      reply_markup: { inline_keyboard: [[{ text: "Играть ▶", url: SITE }]] },
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
