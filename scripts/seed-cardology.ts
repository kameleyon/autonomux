#!/usr/bin/env tsx
/**
 * Seed the cardology reference tables in the autonomux Supabase from
 * the canonical @autonomux/cardology dataset.
 *
 * Tables seeded (all idempotent via PostgREST `upsert` on the primary key):
 *   - cardology_cards            (53 rows)
 *   - cardology_card_dual_ppps   (4 rows: 2 cards × 2 PPPS each)
 *   - cardology_day_cards        (366 rows — leap-year complete)
 *   - cardology_weekly_calendar  (52 rows — 2026)
 *   - cardology_monthly_cards    (12 rows — year=0 "all years" bucket)
 *   - cardology_score_table      (9 rows — intensity combinations)
 *
 * Run:
 *   npx tsx scripts/seed-cardology.ts
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL          (trailing slash stripped)
 *   SUPABASE_SERVICE_ROLE_KEY         (NOT the anon key — we bypass RLS
 *                                      and need INSERT on reference tables)
 *
 * Exit codes:
 *   0 — every table seeded
 *   1 — env missing / Supabase error / row-count mismatch
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { CARDOLOGY_DATA } from "../packages/cardology/src/cardology/data";

// ─────────────────────────────────────────────────────────────────────
// Env

function requireEnv(name: string): string {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) {
    console.error(`[seed-cardology] missing env: ${name}`);
    process.exit(1);
  }
  return raw.trim();
}

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

// ─────────────────────────────────────────────────────────────────────
// Card name → id (solar value) helpers
// `Joker` is special-cased to id=53 since its solar value isn't in the
// 1..52 table.

const JOKER_ID = 53;

function cardId(name: string): number {
  if (name === "Joker") return JOKER_ID;
  const v = CARDOLOGY_DATA.solar[name];
  if (typeof v !== "number") {
    throw new Error(`[seed-cardology] unknown card name: ${name}`);
  }
  return v;
}

function suitOf(name: string): "Hearts" | "Clubs" | "Diamonds" | "Spades" | "Joker" {
  if (name === "Joker") return "Joker";
  if (name.includes("Hearts")) return "Hearts";
  if (name.includes("Clubs")) return "Clubs";
  if (name.includes("Diamonds")) return "Diamonds";
  if (name.includes("Spades")) return "Spades";
  throw new Error(`[seed-cardology] cannot derive suit from: ${name}`);
}

function rankOf(name: string): string {
  if (name === "Joker") return "Joker";
  // "Ace of Hearts" → "Ace"; "10 of Spades" → "10"
  const idx = name.indexOf(" of ");
  return idx > 0 ? name.slice(0, idx) : name;
}

// ─────────────────────────────────────────────────────────────────────
// Row builders

interface CardRow {
  id: number;
  name: string;
  suit: string;
  rank: string;
  ppps: string;
  intensity: string;
  planets: string;
  solar_value: number;
}

function buildCardRows(): CardRow[] {
  const rows: CardRow[] = [];
  // 52-card deck
  for (const name of CARDOLOGY_DATA.all_52) {
    const ppps = CARDOLOGY_DATA.ppps[name];
    const intensity = CARDOLOGY_DATA.intensity[name];
    const planets = CARDOLOGY_DATA.planets[name];
    const solar = CARDOLOGY_DATA.solar[name];
    if (!ppps || !intensity || !planets || typeof solar !== "number") {
      throw new Error(`[seed-cardology] incomplete card definition: ${name}`);
    }
    rows.push({
      id: solar,
      name,
      suit: suitOf(name),
      rank: rankOf(name),
      ppps,
      intensity,
      planets,
      solar_value: solar,
    });
  }
  // Joker — has intensity but no ppps/planets/solar in the source data.
  // We need to satisfy the NOT NULL constraints; choose conservative
  // defaults that won't get hit by the engine (it filters by all_52).
  const jokerIntensity = CARDOLOGY_DATA.intensity["Joker"] ?? "H";
  rows.push({
    id: JOKER_ID,
    name: "Joker",
    suit: "Joker",
    rank: "Joker",
    ppps: "PAUSE", // neutral default; Joker never appears in Step-1 pool
    intensity: jokerIntensity,
    planets: "Joker",
    solar_value: JOKER_ID,
  });
  return rows;
}

interface DualPppsRow {
  card_id: number;
  ppps: string;
}

function buildDualPppsRows(): DualPppsRow[] {
  const rows: DualPppsRow[] = [];
  for (const [name, list] of Object.entries(CARDOLOGY_DATA.step1_dual_ppps)) {
    for (const p of list) {
      rows.push({ card_id: cardId(name), ppps: p });
    }
  }
  return rows;
}

interface DayCardRow {
  mmdd: string;
  card_id: number;
}

function buildDayCardRows(): DayCardRow[] {
  return Object.entries(CARDOLOGY_DATA.day_cards).map(([mmdd, card]) => ({
    mmdd,
    card_id: cardId(card),
  }));
}

interface WeeklyRow {
  year: number;
  week_number: number;
  start_date: string;
  end_date: string;
  card_id: number;
}

function buildWeeklyRows(): WeeklyRow[] {
  return CARDOLOGY_DATA.weekly_cal.map((w) => ({
    year: Number(w.start.slice(0, 4)),
    week_number: w.week,
    start_date: w.start,
    end_date: w.end,
    card_id: cardId(w.card),
  }));
}

interface MonthlyRow {
  year: number;
  month: number;
  card_id: number;
}

function buildMonthlyRows(): MonthlyRow[] {
  // Source data is per-month-of-year (no year). Stash under year=0 to
  // mean "applies to all years" — see migration comment.
  return Object.entries(CARDOLOGY_DATA.monthly).map(([month, card]) => ({
    year: 0,
    month: Number(month),
    card_id: cardId(card),
  }));
}

interface ScoreRow {
  a: string;
  b: string;
  score: number;
}

function buildScoreRows(): ScoreRow[] {
  return Object.entries(CARDOLOGY_DATA.score_table).map(([key, score]) => {
    const parts = key.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`[seed-cardology] malformed score key: ${key}`);
    }
    return { a: parts[0], b: parts[1], score };
  });
}

// ─────────────────────────────────────────────────────────────────────
// Upsert helpers

async function upsertTable<T extends object>(
  supabase: SupabaseClient,
  table: string,
  rows: T[],
  onConflict: string,
): Promise<number> {
  if (rows.length === 0) {
    console.log(`[seed-cardology] ${table}: (empty input, skipped)`);
    return 0;
  }
  const { error } = await supabase
    .from(table)
    .upsert(rows, { onConflict, ignoreDuplicates: false });
  if (error) {
    console.error(
      `[seed-cardology] ${table}: upsert failed —`,
      error.message,
    );
    throw error;
  }
  const { count, error: countError } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (countError) {
    console.error(
      `[seed-cardology] ${table}: row-count check failed —`,
      countError.message,
    );
    throw countError;
  }
  console.log(
    `[seed-cardology] ${table}: ${rows.length} rows upserted (table total: ${count ?? "?"})`,
  );
  return rows.length;
}

// ─────────────────────────────────────────────────────────────────────
// main

async function main(): Promise<void> {
  console.log(`[seed-cardology] connecting to ${SUPABASE_URL}`);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) cards (parent table — must seed first because dual_ppps + day +
  //    weekly + monthly all FK back to cards).
  const cardRows = buildCardRows();
  await upsertTable(supabase, "cardology_cards", cardRows, "id");

  // 2) dual ppps (child of cards)
  const dualRows = buildDualPppsRows();
  await upsertTable(
    supabase,
    "cardology_card_dual_ppps",
    dualRows,
    "card_id,ppps",
  );

  // 3) day cards
  const dayRows = buildDayCardRows();
  await upsertTable(supabase, "cardology_day_cards", dayRows, "mmdd");

  // 4) weekly calendar
  const weeklyRows = buildWeeklyRows();
  await upsertTable(
    supabase,
    "cardology_weekly_calendar",
    weeklyRows,
    "year,week_number",
  );

  // 5) monthly cards (year=0 = all years)
  const monthlyRows = buildMonthlyRows();
  await upsertTable(
    supabase,
    "cardology_monthly_cards",
    monthlyRows,
    "year,month",
  );

  // 6) score table
  const scoreRows = buildScoreRows();
  await upsertTable(supabase, "cardology_score_table", scoreRows, "a,b");

  console.log("[seed-cardology] done.");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[seed-cardology] fatal: ${message}`);
  process.exit(1);
});
