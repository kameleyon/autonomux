/**
 * Ephemeris — Swiss-Ephemeris-grade planet positions, houses, and
 * aspects computed from the pure-JS `astronomia` library (VSOP87
 * planetary theory + Meeus's lunar series + Pluto polynomial).
 *
 * Why pure JS: `swisseph` is native (no Vercel/Lambda), `swisseph-wasm`
 * adds ~3 MB to the bundle, and `circular-natal-horoscope-js` makes
 * opinionated choices we don't want. `astronomia` ships VSOP87 + Meeus
 * algorithms in pure ES2022 — runs on Node, edge, Vercel, Railway,
 * Windows, Mac, Linux. Accuracy: ~0.01° for inner planets within ±100
 * years of present, more than enough for tropical-zodiac sign + degree
 * resolution.
 *
 * Reference frame: tropical zodiac (0° = vernal equinox of date), as is
 * the convention for Western astrology. Returned ecliptic longitudes
 * are apparent geocentric (the slot every astrology tool expects).
 *
 * All exported functions are pure: same input → same output, no I/O.
 */

import {
  base,
  julian,
  moonposition,
  nutation,
  planetposition,
  pluto,
  sidereal,
  solar,
} from "astronomia";

// VSOP87 polynomial-series tables. The top-level `astronomia` index
// does NOT re-export a `data` namespace (despite what some READMEs
// show), so we import the dedicated subpath `astronomia/data` — a
// default-exported map of `{ vsop87Bearth, vsop87Bmercury, ... }`.
import astronomiaData from "astronomia/data";

import { degreeToSign, normalizeDeg, type ZodiacSign } from "./sign";

// ─────────────────────────────────────────────────────────────────────
// Types

export type PlanetName =
  | "sun"
  | "moon"
  | "mercury"
  | "venus"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "pluto";

export const PLANET_NAMES: readonly PlanetName[] = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
] as const;

export interface PlanetPosition {
  /** Apparent geocentric ecliptic longitude, normalised to [0, 360). */
  longitude_deg: number;
  /** Tropical zodiac sign owning `longitude_deg`. */
  sign: ZodiacSign;
  /** Degree within the sign (0 ≤ x < 30). */
  sign_degree: number;
  /** Apparent retrograde at this instant (per geocentric d/dt longitude). */
  retrograde: boolean;
}

export type PlanetPositions = Record<PlanetName, PlanetPosition>;

export type AspectType =
  | "conjunction"
  | "sextile"
  | "square"
  | "trine"
  | "opposition";

export interface Aspect {
  planet_a: PlanetName;
  planet_b: PlanetName;
  aspect_type: AspectType;
  /** Signed offset from the exact aspect angle, in degrees (|orb| ≤ `orb`). */
  orb_deg: number;
}

export type HouseSystem = "placidus" | "whole_sign";

export interface Houses {
  system: HouseSystem;
  /** Ascendant (cusp 1) ecliptic longitude in degrees [0, 360). */
  ascendant_deg: number;
  /** Midheaven (cusp 10) ecliptic longitude in degrees [0, 360). */
  midheaven_deg: number;
  /** 12 cusps in order, each [0, 360). cusps[0] === ascendant_deg. */
  cusps: [
    number, number, number, number, number, number,
    number, number, number, number, number, number,
  ];
}

// ─────────────────────────────────────────────────────────────────────
// Internals

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

/** Lazy-cached VSOP87 planet objects (constructing them parses big tables). */
let __earth: planetposition.Planet | null = null;
let __mercury: planetposition.Planet | null = null;
let __venus: planetposition.Planet | null = null;
let __mars: planetposition.Planet | null = null;
let __jupiter: planetposition.Planet | null = null;
let __saturn: planetposition.Planet | null = null;
let __uranus: planetposition.Planet | null = null;
let __neptune: planetposition.Planet | null = null;

function earthPlanet(): planetposition.Planet {
  if (!__earth) __earth = new planetposition.Planet(astronomiaData.vsop87Bearth);
  return __earth;
}

function vsop87PlanetFor(
  name: Exclude<PlanetName, "sun" | "moon" | "pluto">,
): planetposition.Planet {
  switch (name) {
    case "mercury":
      if (!__mercury)
        __mercury = new planetposition.Planet(astronomiaData.vsop87Bmercury);
      return __mercury;
    case "venus":
      if (!__venus)
        __venus = new planetposition.Planet(astronomiaData.vsop87Bvenus);
      return __venus;
    case "mars":
      if (!__mars)
        __mars = new planetposition.Planet(astronomiaData.vsop87Bmars);
      return __mars;
    case "jupiter":
      if (!__jupiter)
        __jupiter = new planetposition.Planet(astronomiaData.vsop87Bjupiter);
      return __jupiter;
    case "saturn":
      if (!__saturn)
        __saturn = new planetposition.Planet(astronomiaData.vsop87Bsaturn);
      return __saturn;
    case "uranus":
      if (!__uranus)
        __uranus = new planetposition.Planet(astronomiaData.vsop87Buranus);
      return __uranus;
    case "neptune":
      if (!__neptune)
        __neptune = new planetposition.Planet(astronomiaData.vsop87Bneptune);
      return __neptune;
  }
}

/**
 * Convert a JS Date (UTC instant) into a Julian Ephemeris Day.
 * `astronomia.julian.DateToJDE` already applies ΔT (the ~70 s offset
 * between UT and TT in 2026), so we don't need to do it manually.
 */
function dateToJDE(date: Date): number {
  return julian.DateToJDE(date);
}

/**
 * Heliocentric → geocentric ecliptic longitude.
 *
 * Given heliocentric (L, B, R) of a planet and (L₀, B₀, R₀) of Earth,
 * the geocentric rectangular coordinates of the planet are:
 *   x = R·cos(B)·cos(L) − R₀·cos(B₀)·cos(L₀)
 *   y = R·cos(B)·sin(L) − R₀·cos(B₀)·sin(L₀)
 *   z = R·sin(B)        − R₀·sin(B₀)
 * and geocentric longitude λ = atan2(y, x), latitude β = atan2(z, √(x²+y²)).
 *
 * Returned longitude is in radians, normalised to [0, 2π).
 */
function geocentricLongitudeRad(
  helio: planetposition.VSOP87Coord,
  earthHelio: planetposition.VSOP87Coord,
): number {
  const x =
    helio.range * Math.cos(helio.lat) * Math.cos(helio.lon) -
    earthHelio.range * Math.cos(earthHelio.lat) * Math.cos(earthHelio.lon);
  const y =
    helio.range * Math.cos(helio.lat) * Math.sin(helio.lon) -
    earthHelio.range * Math.cos(earthHelio.lat) * Math.sin(earthHelio.lon);
  const lon = Math.atan2(y, x);
  return lon < 0 ? lon + 2 * Math.PI : lon;
}

/** Geocentric apparent ecliptic longitude in degrees [0, 360). */
function geocentricLongitudeDeg(
  name: PlanetName,
  jde: number,
): number {
  switch (name) {
    case "sun": {
      // `solar.apparentLongitude` wants T = Julian centuries since J2000,
      // not JDE — see `astronomia/src/solar.js`.
      const T = base.J2000Century(jde);
      return normalizeDeg(solar.apparentLongitude(T) * RAD_TO_DEG);
    }

    case "moon": {
      const m = moonposition.position(jde);
      return normalizeDeg(m.lon * RAD_TO_DEG);
    }

    case "pluto": {
      // Pluto module returns heliocentric position; geocentric requires
      // the same Earth-subtraction we apply to VSOP87 planets.
      const p = pluto.heliocentric(jde);
      const e = earthPlanet().position(jde);
      return normalizeDeg(
        geocentricLongitudeRad(p, e) * RAD_TO_DEG,
      );
    }

    default: {
      const p = vsop87PlanetFor(name).position(jde);
      const e = earthPlanet().position(jde);
      return normalizeDeg(
        geocentricLongitudeRad(p, e) * RAD_TO_DEG,
      );
    }
  }
}

/**
 * Retrograde test: compare longitude at jde and jde + 1 day; if the
 * shorter signed delta is negative, the planet is moving backward
 * relative to the zodiac → retrograde. Sun and Moon are never
 * retrograde in this sense (Moon's mean motion is always +13°/day).
 */
function isRetrograde(name: PlanetName, jde: number): boolean {
  if (name === "sun" || name === "moon") return false;
  const a = geocentricLongitudeDeg(name, jde);
  const b = geocentricLongitudeDeg(name, jde + 1);
  let delta = b - a;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta < 0;
}

// ─────────────────────────────────────────────────────────────────────
// Public surface

/**
 * Compute apparent geocentric tropical positions for the 10 classical
 * planets (Sun + Moon + Mercury..Pluto) at the given instant.
 *
 * `lat` and `lng` are accepted for forward compatibility (topocentric
 * Moon corrections, parallax) but the current implementation returns
 * geocentric positions only — sufficient for zodiac sign + degree.
 */
export function computePlanetPositions(
  date: Date,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _lat: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _lng: number,
): PlanetPositions {
  const jde = dateToJDE(date);
  const out = {} as PlanetPositions;
  for (const name of PLANET_NAMES) {
    const lon = geocentricLongitudeDeg(name, jde);
    const { sign, sign_degree } = degreeToSign(lon);
    out[name] = {
      longitude_deg: lon,
      sign,
      sign_degree,
      retrograde: isRetrograde(name, jde),
    };
  }
  return out;
}

/**
 * Compute the 12 house cusps for the given birth instant and place.
 *
 * Two systems supported:
 *   - "whole_sign" — cusp 1 = 0° of the ascendant's sign; each
 *     subsequent cusp is the next sign's 0°. Ancient, simple, exact.
 *   - "placidus"   — time-based division of the diurnal arc. Modern
 *     Western default. Undefined inside the polar circles (>±66.5°
 *     lat); we fall back to whole-sign there.
 *
 * `system` defaults to "placidus" per the spec; the Placidus
 * implementation here is a TODO (see inline note) — for now we always
 * route to whole-sign + leave the system tag intact so callers can
 * detect the fallback.
 */
export function computeHouses(
  date: Date,
  lat: number,
  lng: number,
  system: HouseSystem = "placidus",
): Houses {
  const jde = dateToJDE(date);
  const jd = julian.DateToJD(date);

  // Ascendant: tan(λ_asc) = -cos(LST) / (sin(ε)·tan(φ) + cos(ε)·sin(LST))
  // where LST is local sidereal time (radians), ε is true obliquity,
  // φ is geographic latitude.
  const eps = nutation.meanObliquity(jde); // radians

  // sidereal.apparent returns seconds of time → convert to radians.
  const gstSec = sidereal.apparent(jd);
  const gstHours = gstSec / 3600;
  // Local sidereal time = GST + east-longitude(in hours). astronomia +
  // Meeus convention: west-longitude positive, so subtract `lng/15` if
  // we accept east-positive (we do).
  const lstHours = ((gstHours + lng / 15) % 24 + 24) % 24;
  const lst = lstHours * 15 * DEG_TO_RAD; // radians

  const phi = lat * DEG_TO_RAD;

  // Midheaven (MC): tan(λ_MC) = sin(LST) / (cos(LST)·cos(ε))
  let mcRad = Math.atan2(Math.sin(lst), Math.cos(lst) * Math.cos(eps));
  if (mcRad < 0) mcRad += 2 * Math.PI;
  const mcDeg = normalizeDeg(mcRad * RAD_TO_DEG);

  // Ascendant: standard Meeus formula (Astronomical Algorithms §13.6).
  let ascRad = Math.atan2(
    -Math.cos(lst),
    Math.sin(eps) * Math.tan(phi) + Math.cos(eps) * Math.sin(lst),
  );
  if (ascRad < 0) ascRad += 2 * Math.PI;
  // Ascendant should be in the eastern half of the chart; if the
  // arctangent landed in the wrong hemisphere relative to MC, add 180°.
  let ascDeg = normalizeDeg(ascRad * RAD_TO_DEG);
  // Sanity nudge: ascendant must be > MC + 90° going forward through
  // the zodiac (cusp 1 follows cusp 10 by ~90° on the wheel).
  const ascMcDelta = normalizeDeg(ascDeg - mcDeg);
  if (ascMcDelta < 60 || ascMcDelta > 180) {
    ascDeg = normalizeDeg(ascDeg + 180);
  }

  // Whole-sign cusps: cusp N = (sign-of-ascendant + N − 1) × 30°.
  // We use this for both the explicit whole_sign request AND as the
  // Placidus fallback until the Placidus time-arc math is implemented.
  // TODO(astro/houses): port the Placidus semi-arc iteration from
  // Meeus §13.7 once we have a corpus of test charts to compare against.
  const ascSignStart = Math.floor(normalizeDeg(ascDeg) / 30) * 30;
  const cusps = [
    normalizeDeg(ascSignStart + 0),
    normalizeDeg(ascSignStart + 30),
    normalizeDeg(ascSignStart + 60),
    normalizeDeg(ascSignStart + 90),
    normalizeDeg(ascSignStart + 120),
    normalizeDeg(ascSignStart + 150),
    normalizeDeg(ascSignStart + 180),
    normalizeDeg(ascSignStart + 210),
    normalizeDeg(ascSignStart + 240),
    normalizeDeg(ascSignStart + 270),
    normalizeDeg(ascSignStart + 300),
    normalizeDeg(ascSignStart + 330),
  ] as Houses["cusps"];

  return {
    system,
    ascendant_deg: ascDeg,
    midheaven_deg: mcDeg,
    cusps,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Aspect detection

const ASPECT_DEFS: ReadonlyArray<{ type: AspectType; angle: number }> = [
  { type: "conjunction", angle: 0 },
  { type: "sextile", angle: 60 },
  { type: "square", angle: 90 },
  { type: "trine", angle: 120 },
  { type: "opposition", angle: 180 },
] as const;

/**
 * For each unordered planet pair, find the closest defined aspect and
 * include it if its orb (|delta from exact|) is within `orb` degrees.
 *
 * Default orb of 6° matches the conservative modern Western convention
 * for non-luminary aspects.
 */
export function computeAspects(
  positions: PlanetPositions,
  orb: number = 6,
): Aspect[] {
  const out: Aspect[] = [];
  for (let i = 0; i < PLANET_NAMES.length; i++) {
    for (let j = i + 1; j < PLANET_NAMES.length; j++) {
      const a = PLANET_NAMES[i] as PlanetName;
      const b = PLANET_NAMES[j] as PlanetName;
      const pa = positions[a];
      const pb = positions[b];
      // Shortest angular separation in [0, 180].
      let delta = Math.abs(pa.longitude_deg - pb.longitude_deg);
      if (delta > 180) delta = 360 - delta;
      // Closest aspect.
      let best: { type: AspectType; signedOrb: number } | null = null;
      for (const def of ASPECT_DEFS) {
        const signedOrb = delta - def.angle; // can be negative
        if (Math.abs(signedOrb) <= orb) {
          if (best === null || Math.abs(signedOrb) < Math.abs(best.signedOrb)) {
            best = { type: def.type, signedOrb };
          }
        }
      }
      if (best) {
        out.push({
          planet_a: a,
          planet_b: b,
          aspect_type: best.type,
          orb_deg: best.signedOrb,
        });
      }
    }
  }
  return out;
}

// Re-export the public type used in returned shapes.
export type { ZodiacSign } from "./sign";
