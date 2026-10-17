// Собирает данные для географических игр: data/geo.js и assets/flags/*.svg.
//
// Источники:
//   tools/raw/countries.json — mledoze/countries (названия на русском, координаты, площадь, регион)
//   tools/raw/pop.json       — население, World Bank SP.POP.TOTL (последний год)
//   world-atlas/countries-50m — границы стран (Natural Earth 1:50m)
//   flag-icons               — SVG-флаги
//
// Запуск: node tools/build_geo.js
const fs = require("fs");
const path = require("path");
const topojson = require("topojson-client");
const simplify = require("topojson-simplify");

const ROOT = path.resolve(__dirname, "..");
const raw = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "raw", f), "utf8"));

const EXTRA = new Set(["TWN", "PSE", "UNK"]); // не члены ООН, но в играх такого типа обычно есть
const NAMES = {
  US: ["США", "Соединенные Штаты Америки", "Америка", "Соединенные Штаты"],
  GB: ["Великобритания", "Соединенное Королевство", "Англия", "Британия"],
  AE: ["ОАЭ", "Объединенные Арабские Эмираты", "Эмираты"],
  ZA: ["ЮАР", "Южно-Африканская Республика", "Южная Африка"],
  CF: ["ЦАР", "Центральноафриканская Республика"],
  CD: ["ДР Конго", "Демократическая Республика Конго", "Заир", "Конго-Киншаса"],
  CG: ["Республика Конго", "Конго", "Конго-Браззавиль"],
  FM: ["Микронезия", "Федеративные Штаты Микронезии"],
  BS: ["Багамы", "Багамские Острова"],
  SZ: ["Эсватини", "Свазиленд"],
  KR: ["Южная Корея", "Корея", "Республика Корея"],
  KP: ["Северная Корея", "КНДР"],
  CZ: ["Чехия", "Чешская Республика"],
  MK: ["Северная Македония", "Македония"],
  TL: ["Восточный Тимор", "Тимор-Лесте"],
  CI: ["Кот-д'Ивуар", "Берег Слоновой Кости"],
  MM: ["Мьянма", "Бирма"],
  NL: ["Нидерланды", "Голландия"],
  BY: ["Беларусь", "Белоруссия"],
  MD: ["Молдавия", "Молдова"],
  KG: ["Киргизия", "Кыргызстан"],
  TM: ["Туркмения", "Туркменистан"],
  VA: ["Ватикан"],
  CV: ["Кабо-Верде", "Острова Зеленого Мыса"],
  PG: ["Папуа - Новая Гвинея", "Папуа Новая Гвинея", "Папуа"],
  TW: ["Тайвань"],
  PS: ["Палестина"],
  XK: ["Косово"],
};
// Части стран, которые в Natural Earth нарисованы отдельно.
const GEOM_BY_NAME = { Kosovo: "XK", "N. Cyprus": "CY", Somaliland: "SO" };

const CONT = {
  Africa: "Африка", Europe: "Европа", Asia: "Азия", Oceania: "Океания",
  "North America": "Северная Америка", "Central America": "Северная Америка",
  Caribbean: "Северная Америка", "South America": "Южная Америка",
};

const norm = (s) => s.replace(/ё/g, "е").replace(/Ё/g, "Е").replace(/’/g, "'").replace(/\s+—\s+/g, " - ");

const countries = raw("countries.json").filter(
  (c) => ((c.independent || c.unMember) && c.cca3 !== "ATA") || EXTRA.has(c.cca3)
);
const popRows = raw("pop.json")[1];
const pop = Object.fromEntries(popRows.filter((r) => r.value).map((r) => [r.countryiso3code, r.value]));
pop.TWN = pop.TWN || 23400000;
pop.UNK = pop.UNK || pop.XKX || 1600000;
pop.PSE = pop.PSE || 5500000;
pop.VAT = pop.VAT || 800;

// ----- геометрия -----
const topo = JSON.parse(fs.readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8"));
const byNum = Object.fromEntries(countries.map((c) => [c.ccn3, c.cca2]));
const geoms = topo.objects.countries.geometries;
topo.objects.countries.geometries = geoms
  .map((g) => {
    const id = GEOM_BY_NAME[g.properties.name] || byNum[g.id];
    return id ? { type: g.type, arcs: g.arcs, id } : null;
  })
  .filter(Boolean);
const pre = simplify.presimplify(topo);
const small = simplify.simplify(pre, simplify.quantile(pre, 0.25));
let filtered = small;
const withGeom = new Set(filtered.objects.countries.geometries.map((g) => g.id));
// убираем служебные веса и снова квантуем (дельта-кодирование) — файл меньше
filtered.arcs = filtered.arcs.map((arc) => arc.map((p) => [p[0], p[1]]));
delete filtered.objects.land;
filtered = topojson.quantize(filtered, 1e4);

// ----- список стран -----
const out = countries
  .map((c) => {
    const cca2 = c.cca3 === "UNK" ? "XK" : c.cca2;
    const names = (NAMES[cca2] || [c.translations.rus.common, c.translations.rus.official]).map(norm);
    const official = norm(c.translations.rus.official || "");
    const aliases = [...new Set(names.concat(official ? [official] : []))];
    const cont = CONT[c.subregion] || CONT[c.region] || c.region;
    return {
      id: cca2,
      n: aliases[0],
      al: aliases.slice(1),
      lat: +c.latlng[0].toFixed(2),
      lng: +c.latlng[1].toFixed(2),
      area: Math.round(c.area),
      pop: pop[c.cca3 === "UNK" ? "XKX" : c.cca3] || pop[c.cca3] || 0,
      cont,
      land: !!c.landlocked,
      geo: withGeom.has(cca2),
    };
  })
  .sort((a, b) => a.n.localeCompare(b.n, "ru"));

const noPop = out.filter((c) => !c.pop).map((c) => c.n);
if (noPop.length) console.warn("нет населения:", noPop.join(", "));

// ----- флаги -----
const flagDir = path.join(ROOT, "assets", "flags");
fs.mkdirSync(flagDir, { recursive: true });
const flagSrc = path.join(path.dirname(require.resolve("flag-icons/package.json")), "flags", "4x3");
let flags = 0;
for (const c of out) {
  const f = path.join(flagSrc, c.id.toLowerCase() + ".svg");
  if (fs.existsSync(f)) {
    fs.copyFileSync(f, path.join(flagDir, c.id.toLowerCase() + ".svg"));
    c.flag = true;
    flags++;
  }
}

fs.writeFileSync(
  path.join(ROOT, "data", "geo.js"),
  "// Сгенерировано tools/build_geo.js — не править руками.\n" +
    "window.GEO = " + JSON.stringify({ countries: out, topo: filtered }) + ";\n"
);
const size = fs.statSync(path.join(ROOT, "data", "geo.js")).size;
console.log(`стран: ${out.length}, с границами: ${withGeom.size}, флагов: ${flags}, geo.js: ${Math.round(size / 1024)} КБ`);

// Вендорим браузерные библиотеки (ISC-лицензия).
const vend = path.join(ROOT, "assets", "vendor");
fs.mkdirSync(vend, { recursive: true });
for (const [pkg, file] of [
  ["d3-array", "dist/d3-array.min.js"],
  ["d3-geo", "dist/d3-geo.min.js"],
  ["topojson-client", "dist/topojson-client.min.js"],
]) {
  fs.copyFileSync(path.join(__dirname, "node_modules", pkg, file), path.join(vend, path.basename(file)));
}
