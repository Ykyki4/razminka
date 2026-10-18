// Рисует картинки превью ссылок assets/og/<id>.png (1200×630) по шаблону tools/og.html
// и аватарки Telegram-канала и чата tools/telegram/*.png (640×640) по tools/tg_avatar.html.
// Нужен запущенный сервер (python tools/serve.py 8765) и Chrome.
// Запуск: cd tools && npm i && node build_og.js
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const BASE = "http://localhost:8765/tools/og.html";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = path.join(__dirname, "..", "assets", "og");
const IDS = ["index", "slovo", "vertikal", "chetyre", "lesenka", "soty", "chisla", "flag", "kontur", "strana", "globus"];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630 });
  for (const id of IDS) {
    await page.goto(id === "index" ? BASE : `${BASE}?id=${id}`, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, id + ".png") });
    console.log("ok", id);
  }
  const TG = path.join(__dirname, "telegram");
  fs.mkdirSync(TG, { recursive: true });
  await page.setViewport({ width: 640, height: 640 });
  for (const kind of ["channel", "chat"]) {
    await page.goto(`http://localhost:8765/tools/tg_avatar.html?kind=${kind}`, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(TG, kind + ".png") });
    console.log("ok", kind);
  }
  await browser.close();
})();
