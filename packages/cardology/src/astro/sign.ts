/**
 * Zodiac sign utilities.
 *
 * Tropical zodiac (0° = March equinox, sign-of-date Aries). Pure
 * arithmetic over an ecliptic longitude in degrees; no ephemeris
 * dependency here.
 */

export type ZodiacSign =
  | "Aries"
  | "Taurus"
  | "Gemini"
  | "Cancer"
  | "Leo"
  | "Virgo"
  | "Libra"
  | "Scorpio"
  | "Sagittarius"
  | "Capricorn"
  | "Aquarius"
  | "Pisces";

export type ZodiacModality = "Cardinal" | "Fixed" | "Mutable";
export type ZodiacElement = "Fire" | "Earth" | "Air" | "Water";

/** The 12 signs in ecliptic order. SIGNS[n] is the sign that owns the
 *  30° arc starting at n*30°. */
export const SIGNS: readonly ZodiacSign[] = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
] as const;

export const MODALITIES: Record<ZodiacSign, ZodiacModality> = {
  Aries: "Cardinal",
  Taurus: "Fixed",
  Gemini: "Mutable",
  Cancer: "Cardinal",
  Leo: "Fixed",
  Virgo: "Mutable",
  Libra: "Cardinal",
  Scorpio: "Fixed",
  Sagittarius: "Mutable",
  Capricorn: "Cardinal",
  Aquarius: "Fixed",
  Pisces: "Mutable",
};

export const ELEMENTS: Record<ZodiacSign, ZodiacElement> = {
  Aries: "Fire",
  Taurus: "Earth",
  Gemini: "Air",
  Cancer: "Water",
  Leo: "Fire",
  Virgo: "Earth",
  Libra: "Air",
  Scorpio: "Water",
  Sagittarius: "Fire",
  Capricorn: "Earth",
  Aquarius: "Air",
  Pisces: "Water",
};

/** Normalise a longitude (degrees) into [0, 360). */
export function normalizeDeg(deg: number): number {
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

/**
 * Convert an ecliptic longitude (deg, any range) into a tropical
 * zodiac sign + degree-within-sign (0..30, exclusive of 30).
 */
export function degreeToSign(longitude_deg: number): {
  sign: ZodiacSign;
  sign_degree: number;
} {
  const lon = normalizeDeg(longitude_deg);
  const idx = Math.floor(lon / 30); // 0..11
  // Defensive: 360° normalised away → idx never 12, but keep clamp.
  const safeIdx = Math.min(idx, 11);
  const sign = SIGNS[safeIdx] as ZodiacSign;
  return {
    sign,
    sign_degree: lon - safeIdx * 30,
  };
}
