/**
 * @autonomux/orchestrator — Oracle sub-agent tool.
 *
 * Grounds tarot / cardology answers in the user's own reference library
 * (Seven Reflections Destiny Cards data + the "Tarot Modern" and "Sacred
 * Symbols of the Ancients" books), so AlterEgo speaks from source material
 * instead of improvising.
 *
 * Local + synchronous — unlike Mailroom/Scheduler there is no worker job.
 * The compiled data (resources/oracle/* → src/sub-agents/oracle/data/*.json,
 * built by scripts/build-oracle-data.mjs) is imported and bundled, so this
 * works on serverless with no runtime file reads.
 *
 * Actions:
 *   - card_info(card)   full profile of a named card
 *   - birth_card(date)  the person's birth card for a MM-DD birthday + profile
 *   - day_card(date)    the destiny day-card for a date + profile
 *   - search(query)     passages from the two source books matching a query
 */
import { z } from "zod";

import type { ContentBlock, Tool } from "@autonomux/llm";

import type {
  SubAgentEntry,
  SubAgentInvoke,
  SubAgentInvokeContext,
} from "./registry";

import cardsData from "./oracle/data/cards.json";
import datesData from "./oracle/data/dates.json";
import corpusData from "./oracle/data/corpus.json";

/* ── typed views over the bundled JSON ─────────────────────────────────────── */

interface CardProfile {
  name: string;
  suit: string;
  rank: string;
  archetype: string;
  keywords: string;
  dayCardDate: string;
  planetary: string;
  shortDescription: string;
  uplifted: string;
  shadow: string;
  lifeLesson: string;
  generalEnergy: string;
  spiritual: string;
  money: string;
  health: string;
  love: string;
}

const CARDS = cardsData as Record<string, CardProfile>;
const DATES = datesData as { birth: Record<string, string>; day: Record<string, string> };
const CORPUS = corpusData as ReadonlyArray<{ source: string; text: string }>;

/* ── input schema ──────────────────────────────────────────────────────────── */

const inputSchema = z.object({
  action: z.enum(["card_info", "birth_card", "day_card", "search"]),
  card: z.string().min(1).max(60).optional(),
  date: z.string().min(1).max(40).optional(),
  query: z.string().min(1).max(300).optional(),
});

export const oracleTool: Tool = {
  name: "oracle",
  description:
    "Look up tarot / cardology source material from the user's own reference library. " +
    "IMPORTANT — two different card systems: 'card_info' covers only CARDOLOGY playing cards " +
    "(King of Spades, 7 of Hearts, etc.); it does NOT cover the tarot Major/Minor Arcana. " +
    "For TAROT cards (The High Priestess, The Chariot, Five of Wands, etc.) use 'search' with the card name — " +
    "that queries the Tarot Modern book. " +
    "Use 'birth_card' with a birthday to find someone's cardology birth card; 'day_card' with a date for that date's destiny card; " +
    "'card_info' for a cardology playing card's full profile; " +
    "'search' for tarot card meanings, spreads, symbolism, or any theory from the Tarot Modern and Sacred Symbols books. " +
    "For a multi-card tarot spread, call 'search' once per card name. " +
    "Call this whenever the user asks anything about tarot, cardology, birth cards, or readings, then interpret in your own voice.",
  input_schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["card_info", "birth_card", "day_card", "search"],
        description:
          "card_info = a named card's profile; birth_card = birth card for a birthday; day_card = destiny card for a date; search = passages from the source books.",
      },
      card: { type: "string", description: "card_info only: card name, e.g. 'Queen of Hearts', '10 of Clubs'." },
      date: {
        type: "string",
        description: "birth_card / day_card only: a date as MM-DD, YYYY-MM-DD, or 'Month D' (e.g. '03-05', 'March 5').",
      },
      query: { type: "string", description: "search only: what to look up (a card meaning, a spread, a symbol, a concept)." },
    },
    required: ["action"],
    additionalProperties: false,
  },
};

/* ── helpers ───────────────────────────────────────────────────────────────── */

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Normalize an arbitrary date string to "MM-DD", or null if unparseable. */
function toMmDd(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); // YYYY-MM-DD
  if (m) return `${m[2]}-${m[3]}`;
  m = /^(\d{1,2})-(\d{1,2})$/.exec(s); // MM-DD or M-D
  if (m) return `${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})/.exec(s); // MM/DD
  if (m) return `${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  m = /^([a-z]{3,})\.?\s+(\d{1,2})/.exec(s); // Month D
  if (m) {
    const mo = MONTHS[m[1]!.slice(0, 3)];
    if (mo) return `${mo}-${m[2]!.padStart(2, "0")}`;
  }
  m = /^(\d{1,2})\s+([a-z]{3,})/.exec(s); // D Month
  if (m) {
    const mo = MONTHS[m[2]!.slice(0, 3)];
    if (mo) return `${mo}-${m[1]!.padStart(2, "0")}`;
  }
  return null;
}

function lookupCard(name: string): CardProfile | null {
  const key = name.trim().toLowerCase();
  if (CARDS[key]) return CARDS[key]!;
  // Loose match: "queen of hearts" vs "Queen of Hearts" already lowercased;
  // also tolerate "hearts queen" / partial by scanning.
  for (const [k, v] of Object.entries(CARDS)) {
    if (k === key) return v;
  }
  const tokens = key.split(/\s+/).filter((t) => t !== "of");
  for (const [k, v] of Object.entries(CARDS)) {
    if (tokens.every((t) => k.includes(t))) return v;
  }
  return null;
}

function formatCard(c: CardProfile, lead?: string): string {
  const line = (label: string, val: string): string => (val ? `${label}: ${val}\n` : "");
  return (
    (lead ? `${lead}\n` : "") +
    `Card: ${c.name}${c.archetype ? ` — ${c.archetype}` : ""}\n` +
    line("Suit/Rank", `${c.rank} of ${c.suit}`.replace(/^ of /, "")) +
    line("Planetary", c.planetary) +
    line("Keywords", c.keywords) +
    line("Essence", c.shortDescription) +
    line("Uplifted", c.uplifted) +
    line("Shadow", c.shadow) +
    line("Life lesson", c.lifeLesson) +
    line("Love", c.love) +
    line("Money/Business", c.money) +
    line("Health", c.health) +
    line("Spiritual", c.spiritual)
  ).trim();
}

/** Rank corpus chunks by query-term hit count; return the top few, trimmed. */
function searchCorpus(query: string, limit = 4): string {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  if (terms.length === 0) return "No searchable terms in query.";
  const scored = CORPUS.map((chunk) => {
    const hay = chunk.text.toLowerCase();
    let score = 0;
    for (const t of terms) {
      let idx = hay.indexOf(t);
      while (idx !== -1) { score++; idx = hay.indexOf(t, idx + t.length); }
    }
    return { chunk, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) return `No passages found for "${query}".`;
  return scored
    .map((s) => {
      const text = s.chunk.text.length > 900 ? s.chunk.text.slice(0, 900) + "…" : s.chunk.text;
      return `[${s.chunk.source}]\n${text}`;
    })
    .join("\n\n---\n\n");
}

/* ── invoke ────────────────────────────────────────────────────────────────── */

const invoke: SubAgentInvoke = async (
  input: Record<string, unknown>,
  ctx: SubAgentInvokeContext,
): Promise<ContentBlock[]> => {
  const log = ctx.logger.child({ component: "sub-agent.oracle", tenant_id: ctx.tenantId });
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return [{ type: "text", text: `oracle.invalid_input: ${parsed.error.message}` }];
  }
  const { action, card, date, query } = parsed.data;

  const text = ((): string => {
    if (action === "card_info") {
      if (!card) return "oracle: 'card' is required for card_info.";
      const c = lookupCard(card);
      return c ? formatCard(c) : `No card found matching "${card}".`;
    }
    if (action === "birth_card" || action === "day_card") {
      if (!date) return `oracle: 'date' is required for ${action}.`;
      const mmdd = toMmDd(date);
      if (!mmdd) return `oracle: could not parse date "${date}". Use MM-DD, YYYY-MM-DD, or 'Month D'.`;
      const table = action === "birth_card" ? DATES.birth : DATES.day;
      const cardName = table[mmdd];
      if (!cardName) return `oracle: no ${action === "birth_card" ? "birth" : "day"} card on file for ${mmdd}.`;
      const c = lookupCard(cardName);
      const lead = `${action === "birth_card" ? "Birth card" : "Day card"} for ${mmdd}: ${cardName}`;
      return c ? formatCard(c, lead) : lead;
    }
    // search
    if (!query) return "oracle: 'query' is required for search.";
    return searchCorpus(query);
  })();

  log.info({ action }, "oracle: served from reference library");
  return [{ type: "text", text }];
};

export const oracleEntry: SubAgentEntry = {
  name: "oracle",
  tool: oracleTool,
  invoke,
};
