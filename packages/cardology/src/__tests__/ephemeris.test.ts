/**
 * Ephemeris — smoke tests against well-known calendar events.
 *
 *   - Dec 21 2024 12:00 UTC ≈ winter solstice → Sun at 0° Capricorn ± 1°.
 *   - Moon longitude must be in [0, 360).
 *   - At least one aspect must be detectable for an arbitrary date.
 *   - Tropical sign math + retrograde flag shape.
 *
 * The accuracy budget is intentionally loose (±1°) — astronomia's
 * low-precision Sun is good to ~0.01°, but reviewers reading this
 * suite should know the assertion is for sign-resolution sanity, not
 * arcsecond-grade matching.
 */

import { describe, expect, it } from "vitest";

import { computeBirthChart } from "../astro/birth-chart";
import {
  computeAspects,
  computeHouses,
  computePlanetPositions,
  PLANET_NAMES,
} from "../astro/ephemeris";
import { degreeToSign, SIGNS } from "../astro/sign";

describe("degreeToSign", () => {
  it("maps every 30° arc onto the right sign", () => {
    for (let i = 0; i < 12; i++) {
      const expected = SIGNS[i];
      const { sign, sign_degree } = degreeToSign(i * 30 + 15);
      expect(sign).toBe(expected);
      expect(sign_degree).toBeCloseTo(15, 6);
    }
  });

  it("wraps negative and >360 longitudes", () => {
    expect(degreeToSign(-15).sign).toBe("Pisces");
    expect(degreeToSign(360 + 5).sign).toBe("Aries");
  });
});

describe("computePlanetPositions — Dec 21 2024 winter solstice", () => {
  const positions = computePlanetPositions(
    new Date("2024-12-21T12:00:00Z"),
    0, // lat
    0, // lng
  );

  it("places the Sun in Capricorn within ±1° of the cusp", () => {
    const sun = positions.sun;
    expect(sun.sign).toBe("Capricorn");
    // Either ~0° Cap (entered just now) or up to 1° in if the
    // ingress time was slightly before noon UTC.
    expect(sun.sign_degree).toBeGreaterThanOrEqual(0);
    expect(sun.sign_degree).toBeLessThan(1);
    expect(sun.longitude_deg).toBeGreaterThanOrEqual(270);
    expect(sun.longitude_deg).toBeLessThan(271);
  });

  it("returns a Moon longitude in [0, 360)", () => {
    const moon = positions.moon;
    expect(moon.longitude_deg).toBeGreaterThanOrEqual(0);
    expect(moon.longitude_deg).toBeLessThan(360);
    expect(SIGNS).toContain(moon.sign);
    expect(moon.retrograde).toBe(false); // Moon is never retrograde.
  });

  it("returns all 10 planets with valid longitudes + sign metadata", () => {
    for (const name of PLANET_NAMES) {
      const p = positions[name];
      expect(p.longitude_deg).toBeGreaterThanOrEqual(0);
      expect(p.longitude_deg).toBeLessThan(360);
      expect(SIGNS).toContain(p.sign);
      expect(p.sign_degree).toBeGreaterThanOrEqual(0);
      expect(p.sign_degree).toBeLessThan(30);
      expect(typeof p.retrograde).toBe("boolean");
    }
  });

  it("finds at least one aspect within the default 6° orb", () => {
    const aspects = computeAspects(positions);
    expect(aspects.length).toBeGreaterThan(0);
    for (const a of aspects) {
      expect(Math.abs(a.orb_deg)).toBeLessThanOrEqual(6);
      expect(a.planet_a).not.toBe(a.planet_b);
    }
  });
});

describe("computeHouses", () => {
  it("returns 12 cusps + asc/MC normalised to [0, 360)", () => {
    const h = computeHouses(
      new Date("2024-12-21T12:00:00Z"),
      37.7749, // San Francisco
      -122.4194,
      "whole_sign",
    );
    expect(h.system).toBe("whole_sign");
    expect(h.cusps).toHaveLength(12);
    for (const c of h.cusps) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(360);
    }
    expect(h.ascendant_deg).toBeGreaterThanOrEqual(0);
    expect(h.ascendant_deg).toBeLessThan(360);
    expect(h.midheaven_deg).toBeGreaterThanOrEqual(0);
    expect(h.midheaven_deg).toBeLessThan(360);
    // Whole-sign cusp 1 must be the start of the ascendant's sign.
    expect(Math.round(h.cusps[0]) % 30).toBe(0);
  });
});

describe("computeBirthChart", () => {
  it("wires ephemeris + houses + aspects into one shape", () => {
    const chart = computeBirthChart({
      dob: "1990-06-15",
      dob_time: "03:45",
      lat: 37.7749,
      lng: -122.4194,
      tz_offset_minutes: -420, // PDT
      house_system: "whole_sign",
    });
    expect(chart.birth_utc).toMatch(/T/);
    expect(chart.positions.sun.sign).toBeTruthy();
    expect(chart.houses.cusps).toHaveLength(12);
    expect(Array.isArray(chart.aspects)).toBe(true);
  });
});
