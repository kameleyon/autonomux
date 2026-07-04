/**
 * Compile the Oracle resource files (CSVs + prose books) into bundled JSON the
 * Oracle sub-agent imports at runtime. Run from the orchestrator package:
 *   node scripts/build-oracle-data.mjs
 *
 * Output: src/sub-agents/oracle/data/{cards,dates,corpus}.json
 *
 * We compile to JSON (imported as a module, webpack-bundled) rather than
 * reading the raw files with fs at runtime — that avoids serverless
 * file-tracing fragility on Vercel. Re-run this whenever the source files in
 * resources/oracle/ change, and commit the regenerated JSON.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RES = join(HERE, "..", "resources", "oracle");
const OUT = join(HERE, "..", "src", "sub-agents", "oracle", "data");
mkdirSync(OUT, { recursive: true });

/* ── minimal RFC-4180 CSV parser (handles quotes, commas + newlines in fields) ── */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  // Strip BOM.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); field = ""; rows.push(row); row = [];
    } else if (c === "\r") {
      /* skip */
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim().length > 0));
}

function rowsToObjects(rows) {
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); });
    return o;
  });
}

const read = (name) => readFileSync(join(RES, name), "utf8");

/* ── cards: keyed by canonical card name, merged from CardsGrid + planetary ── */
const grid = rowsToObjects(parseCsv(read("CardsGrid_view.csv")));
const planetary = rowsToObjects(parseCsv(read("CardPlanetary_Position.csv")));
const planetByCard = new Map(
  planetary.map((p) => [p["Card"], { rowPlanet: p["Row Planet"], columnPlanet: p["Column Planet"] }]),
);

const pick = (o, key) => (o[key] ?? "").trim();
const cards = {};
for (const g of grid) {
  const name = pick(g, "Card Name");
  if (!name) continue;
  const planet = planetByCard.get(name);
  cards[name.toLowerCase()] = {
    name,
    suit: pick(g, "Suit"),
    rank: pick(g, "Rank"),
    archetype: pick(g, "Card Archetype"),
    keywords: pick(g, "Core Keywords"),
    dayCardDate: pick(g, "Day Card Calendar"),
    planetary: planet ? `${planet.rowPlanet} / ${planet.columnPlanet}` : pick(g, "Planetary Positions"),
    shortDescription: pick(g, "Card Short Description"),
    uplifted: pick(g, "Uplifted Expression"),
    shadow: pick(g, "Shadow Expression"),
    lifeLesson: pick(g, "Primary Life Lesson"),
    generalEnergy: pick(g, "General Energy (Everyday)"),
    spiritual: pick(g, "Spiritual Dimension"),
    money: pick(g, "Business / Money"),
    health: pick(g, "Health / Wellbeing"),
    love: pick(g, "Love / Relationships"),
  };
}

/* ── date maps: MM-DD → card (birth card + day card) ── */
const birth = rowsToObjects(parseCsv(read("birth_card_primary_dates.csv")));
const day = rowsToObjects(parseCsv(read("day_card_calendar_corrected.csv")));
const birthByDate = {};
for (const b of birth) birthByDate[pick(b, "MM-DD")] = pick(b, "Card");
const dayByDate = {};
for (const d of day) dayByDate[pick(d, "MM-DD")] = pick(d, "Card");

/* ── prose corpus: chunk both books into searchable passages ── */
function chunkProse(source, text, targetChars = 1200) {
  const paras = text.split(/\n{2,}/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.length > 40);
  const chunks = [];
  let buf = "";
  for (const p of paras) {
    if ((buf + " " + p).length > targetChars && buf.length > 0) {
      chunks.push({ source, text: buf.trim() });
      buf = p;
    } else buf = buf ? buf + " " + p : p;
  }
  if (buf.trim().length > 0) chunks.push({ source, text: buf.trim() });
  return chunks;
}
const corpus = [
  ...chunkProse("Tarot Modern (Jo Constant)", read("tarot_modern.txt")),
  ...chunkProse("Sacred Symbols of the Ancients", read("sacred_symbols.md")),
];

writeFileSync(join(OUT, "cards.json"), JSON.stringify(cards));
writeFileSync(join(OUT, "dates.json"), JSON.stringify({ birth: birthByDate, day: dayByDate }));
writeFileSync(join(OUT, "corpus.json"), JSON.stringify(corpus));

console.log(
  `oracle-data: ${Object.keys(cards).length} cards, ` +
    `${Object.keys(birthByDate).length} birth dates, ${Object.keys(dayByDate).length} day dates, ` +
    `${corpus.length} prose chunks`,
);
