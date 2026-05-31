/**
 * Cardology engine — parity tests.
 *
 * Mirrors the behaviour of the autonomux2 source engine (`lib/cardology.ts`),
 * with assertions on the canonical 2026 weekly calendar + the actor
 * algorithm's contract for week-of 2026-03-01.
 */

import { describe, expect, it } from "vitest";

import {
  buildFrame,
  calcActors,
  combine,
  getIntensity,
  getPlanets,
  getPPPS,
  getSolar,
  getWeekCard,
} from "../cardology/engine";
import { CARDOLOGY_DATA } from "../cardology/data";

describe("cardology lookups", () => {
  it("returns the 2026 calendar's primary week-card for the first Sunday of March", () => {
    // 2026-03-01 is a Sunday; week #10 = "10 of Hearts".
    expect(getWeekCard("2026-03-01")).toBe("10 of Hearts");
  });

  it("exposes intensity/ppps/planets/solar lookups for every full-deck card", () => {
    for (const card of CARDOLOGY_DATA.all_52) {
      const ppps = getPPPS(card);
      expect(ppps, `ppps for ${card}`).toBeTruthy();
      const intensity = getIntensity(card);
      expect(["L", "M", "H"]).toContain(intensity);
      expect(getPlanets(card)).toBeTruthy();
      expect(getSolar(card)).toBeGreaterThanOrEqual(1);
      expect(getSolar(card)).toBeLessThanOrEqual(52);
    }
  });

  it("solar-combines two cards via mod-52 arithmetic", () => {
    // Ace of Hearts (1) + King of Spades (52) = 53 → mod 52 = 1 → Ace of Hearts
    expect(combine("Ace of Hearts", "King of Spades")).toBe("Ace of Hearts");
    // 2H (2) + 3H (3) = 5 → 5 of Hearts
    expect(combine("2 of Hearts", "3 of Hearts")).toBe("5 of Hearts");
  });
});

describe("buildFrame + calcActors — week of 2026-03-01", () => {
  const built = buildFrame("2026-03-01");

  it("returns a valid frame (no error string)", () => {
    expect("error" in built).toBe(false);
  });

  it("anchors on the 10-of-Hearts weekly card with March's King of Hearts month card", () => {
    if ("error" in built) throw new Error(built.error);
    expect(built.weekCard).toBe("10 of Hearts");
    expect(built.monthCards).toContain("King of Hearts");
    expect(built.dailyCards).toHaveLength(7);
    expect(built.dailyCards[0]?.card).toBe("9 of Spades");
  });

  it("produces at least one primary actor + every actor has occ ≥ 4", () => {
    if ("error" in built) throw new Error(built.error);
    const result = calcActors(built);
    expect(result.primaryActors.length).toBeGreaterThan(0);
    for (const a of result.primaryActors) {
      expect(a.occ).toBeGreaterThanOrEqual(4);
      expect(a.totalScore).toBeGreaterThan(0);
      expect(a.ppps).toMatch(/^(PUSH|PITCH|PAUSE|SAVE)$/);
    }
    for (const a of result.supportingActors) {
      expect(a.occ).toBe(3);
    }
  });
});

describe("buildFrame error paths", () => {
  it("rejects a non-Sunday date with a friendly error", () => {
    const out = buildFrame("2026-03-02"); // Monday
    expect("error" in out).toBe(true);
    if ("error" in out) {
      expect(out.error.toLowerCase()).toContain("sunday");
    }
  });

  it("rejects a date outside the 2026 weekly calendar", () => {
    const out = buildFrame("2027-01-03"); // Sunday in 2027
    expect("error" in out).toBe(true);
  });
});
