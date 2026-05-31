/**
 * Cardology Weekly Money Forecast — primary actors algorithm.
 *
 * Port of the algorithm embedded in the source HTML tool's `runCalc()`
 * function. Deterministic + pure — given the same week + transit map,
 * always returns the same actors. No side effects, no globals; the
 * component manages state.
 *
 * Methodology lives in `docs/Weekly_Money_Forecast_Master_Methodology.md`
 * (preserved in the original cardology_tool folder). The high-level
 * shape:
 *
 *   1. Build "Step 1" list from week-card + month-card(s) + 7 day-cards
 *   2. For each, lookup PPPS (push/pitch/pause/save) — some have dual
 *   3. For each PPPS, find all 52 cards that share it + are HIGH intensity
 *   4. Solar-add (Step 1 card + Step 3 card mod 52) → activated card
 *   5. Tally occurrences per activated card; score by intensity table
 *   6. Primary actors: 4+ occurrences. Supporting: exactly 3.
 *
 * The astrological transit map adjusts the rendered planet tags on
 * each actor but does NOT change the algorithm's activation logic in
 * this implementation (the original tool's runCalc didn't gate on
 * transit either — transit is presentation only at this layer).
 */

import {
  CARDOLOGY_DATA,
  CALL_LABEL,
  DAY_NAMES,
  DEFAULT_TRANSIT,
  MONTHS,
  PLANETS,
  type Card,
  type IntensityKey,
  type Intensity,
  type PPPS,
  type Planet,
  type Transit,
} from "./data";

export interface DayCard {
  /** "Sun Mar 1" */
  label: string;
  /** "MM-DD" */
  mmdd: string;
  card: Card;
}

export interface WeekFrame {
  weekStart: string; // YYYY-MM-DD (Sunday)
  weekCard: Card;
  monthCards: Card[]; // 1 or 2 (current + next if the week crosses a month)
  dailyCards: DayCard[]; // 7 entries
}

export interface ActorRecord {
  /** Which step-1 input produced this activation (e.g., "Weekly", "Month", "Mon Mar 2"). */
  role: string;
  score: number;
  ppps: PPPS;
}

export interface ActorResult {
  card: Card;
  ppps: PPPS;
  planets: string;
  /** Count of step-1 inputs that activated this card. */
  occ: number;
  /** Sum of per-record scores. */
  totalScore: number;
  recs: ActorRecord[];
}

export interface ForecastResult {
  primaryActors: ActorResult[];
  supportingActors: ActorResult[];
}

// ─────────────────────────────────────────────────────────────────────
// Lookups

export function getPPPS(card: Card): PPPS | undefined {
  return CARDOLOGY_DATA.ppps[card];
}

export function getIntensity(card: Card): Intensity {
  return CARDOLOGY_DATA.intensity[card] ?? "M";
}

export function getPlanets(card: Card): string {
  return CARDOLOGY_DATA.planets[card] ?? "?";
}

export function getSolar(card: Card): number {
  return CARDOLOGY_DATA.solar[card] ?? 0;
}

export function getCallLabel(ppps: PPPS): string {
  return CALL_LABEL[ppps];
}

/**
 * Combine two cards via their solar values mod 52. Returns the card at
 * the resulting position, or null if either input is invalid.
 */
export function combine(a: Card, b: Card): Card | null {
  let v = getSolar(a) + getSolar(b);
  if (v === 0) return null;
  while (v > 52) v -= 52;
  return CARDOLOGY_DATA.card_by_val[String(v)] ?? null;
}

export function getScore(a: Intensity, b: Intensity): number {
  const key = `${a}/${b}` as IntensityKey;
  return CARDOLOGY_DATA.score_table[key] ?? 0;
}

// ─────────────────────────────────────────────────────────────────────
// Frame construction

/** Format a Date as "Mar 5" using the constant MONTHS array. */
export function fmtDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Lookup the weekly cardology card for a given Sunday-opening date. */
export function getWeekCard(startYYYYMMDD: string): Card | null {
  const t = new Date(`${startYYYYMMDD}T00:00:00`);
  for (const w of CARDOLOGY_DATA.weekly_cal) {
    if (
      t >= new Date(`${w.start}T00:00:00`) &&
      t <= new Date(`${w.end}T00:00:00`)
    ) {
      return w.card;
    }
  }
  return null;
}

/** Build the full week frame (week card + month cards + 7 daily cards). */
export function buildFrame(weekStart: string): WeekFrame | { error: string } {
  const d = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    return { error: "Invalid date." };
  }
  if (d.getDay() !== 0) {
    return { error: "Select a Sunday — weeks open on Sunday." };
  }
  const weekCard = getWeekCard(weekStart);
  if (!weekCard) {
    return { error: "Week card not found for this date (calendar covers 2026)." };
  }

  const m1 = d.getMonth() + 1;
  const monthCards: Card[] = [CARDOLOGY_DATA.monthly[String(m1)]!];
  const last = new Date(d);
  last.setDate(last.getDate() + 6);
  const m2 = last.getMonth() + 1;
  if (m2 !== m1) {
    monthCards.push(CARDOLOGY_DATA.monthly[String(m2)]!);
  }

  const dailyCards: DayCard[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(d);
    day.setDate(day.getDate() + i);
    const mm = String(day.getMonth() + 1).padStart(2, "0");
    const dd = String(day.getDate()).padStart(2, "0");
    const mmdd = `${mm}-${dd}`;
    dailyCards.push({
      label: `${DAY_NAMES[i]} ${fmtDate(day)}`,
      mmdd,
      card: CARDOLOGY_DATA.day_cards[mmdd] ?? "?",
    });
  }

  return {
    weekStart,
    weekCard,
    monthCards,
    dailyCards,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Primary-actors calculation

interface Step1Entry {
  role: string;
  card: Card;
}

export function calcActors(frame: WeekFrame): ForecastResult {
  // Step 1 — assemble the list of "input" cards.
  const step1: Step1Entry[] = [];
  step1.push({ role: "Weekly", card: frame.weekCard });
  frame.monthCards.forEach((mc, i) => {
    step1.push({ role: i === 0 ? "Month" : "Month+", card: mc });
  });
  frame.dailyCards.forEach((d) => {
    if (d.card && d.card !== "?") {
      // Use the day-name prefix as the role label (Sun, Mon, ...).
      step1.push({ role: d.label.split(" ")[0]!, card: d.card });
    }
  });

  // Steps 2-3 — for each Step-1 card, expand by its PPPS (some cards
  // have a dual classification), then for each PPPS, walk all 52 cards
  // filtered to that PPPS + HIGH intensity, and solar-combine.
  const activated: Record<Card, ActorRecord[]> = {};

  for (const wc of step1) {
    const wint = getIntensity(wc.card);
    const dual = CARDOLOGY_DATA.step1_dual_ppps[wc.card];
    const direct = getPPPS(wc.card);
    const pppsVals: PPPS[] = dual ?? (direct ? [direct] : []);

    for (const pVal of pppsVals) {
      const pool = CARDOLOGY_DATA.all_52.filter(
        (c) =>
          CARDOLOGY_DATA.ppps[c] === pVal && getIntensity(c) === "H",
      );
      const seen = new Set<Card>();
      for (const bc of pool) {
        if (seen.has(bc)) continue;
        seen.add(bc);
        const act = combine(wc.card, bc);
        if (!act) continue;
        const score = getScore(wint, "H");
        if (!activated[act]) activated[act] = [];
        activated[act].push({ role: wc.role, score, ppps: pVal });
      }
    }
  }

  // Steps 4-6 — tally + classify.
  const all = Object.entries(activated)
    .map(([card, recs]) => ({
      card,
      ppps: getPPPS(card)!,
      planets: getPlanets(card),
      occ: recs.length,
      totalScore: recs.reduce((s, r) => s + r.score, 0),
      recs,
    }))
    .sort((a, b) => b.occ - a.occ || b.totalScore - a.totalScore);

  return {
    primaryActors: all.filter((r) => r.occ >= 4),
    supportingActors: all.filter((r) => r.occ === 3),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Helpers for presentation

/** Pick the highest-scoring record (the "best day" for this actor). */
export function bestRecord(actor: ActorResult): ActorRecord {
  return actor.recs.reduce(
    (b, d) => (d.score > b.score ? d : b),
    actor.recs[0] ?? { role: "?", score: 0, ppps: "PAUSE" as PPPS },
  );
}

/**
 * Format a complete summary block (copy-to-clipboard target). Mirrors
 * the original `doExport()` output shape.
 */
export function formatSummary(
  weekStart: string,
  result: ForecastResult,
): string {
  const lines: string[] = [];
  lines.push(`PRIMARY ACTORS — ${weekStart}\n`);
  for (const r of result.primaryActors) {
    const best = bestRecord(r);
    lines.push(
      `${r.card} | ${r.ppps} | Occ:${r.occ} Score:${r.totalScore} | Best:${best.role} | ${r.planets}`,
    );
    lines.push(
      `  ${r.recs.map((d) => `${d.role}(${d.score})`).join(", ")}\n`,
    );
  }
  if (result.supportingActors.length) {
    lines.push("\nSUPPORTING");
    for (const r of result.supportingActors) {
      lines.push(
        `${r.card} | ${r.ppps} | Occ:3 Score:${r.totalScore}`,
      );
    }
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────
// Default transit map factory + planet utilities

export function defaultTransitMap(): Record<Planet, Transit> {
  return { ...DEFAULT_TRANSIT };
}

export const PLANET_LIST: ReadonlyArray<Planet> = PLANETS;
