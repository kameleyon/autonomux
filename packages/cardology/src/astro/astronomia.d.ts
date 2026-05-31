/**
 * Minimal ambient typings for `astronomia` (v4.x).
 *
 * `astronomia` ships untyped. We declare only the slice used by the
 * ephemeris module so the rest of @autonomux/cardology stays
 * `strict: true` clean. If the surface grows, extend these — don't
 * fall back to `any`.
 *
 * Module layout (per astronomia/package.json `exports`):
 *   - Top-level `astronomia` re-exports a namespace per module (e.g.
 *     `import { julian } from 'astronomia'` gives the default-export
 *     of julian.js).
 *   - Each VSOP87 dataset is its own file: `astronomia/data/vsop87B<planet>.js`.
 *     The top-level package does NOT re-export the `data` namespace.
 */

declare module "astronomia" {
  // ── julian ──────────────────────────────────────────────────────────
  export namespace julian {
    /** Convert a JS Date (UTC) into a Julian Day. */
    export function DateToJD(date: Date): number;
    /** Convert a JS Date (UTC) into a Julian Ephemeris Day. */
    export function DateToJDE(date: Date): number;
    /** Convert a Julian Day back into a JS Date (UTC). */
    export function JDToDate(jd: number): Date;
    /** Convert a Julian Ephemeris Day back into a JS Date (UTC). */
    export function JDEToDate(jde: number): Date;

    export class CalendarGregorian {
      constructor(year: number, month: number, day: number, hour?: number);
      toJDE(): number;
      toJD(): number;
    }
  }

  // ── base ────────────────────────────────────────────────────────────
  export namespace base {
    export const J2000: number;
    export const AU: number;
    /** Julian centuries since J2000.0 for the given JDE. */
    export function J2000Century(jde: number): number;
    export function pmod(x: number, y: number): number;
  }

  // ── planetposition ──────────────────────────────────────────────────
  export namespace planetposition {
    export interface VSOP87Coord {
      /** Heliocentric ecliptic longitude (radians). */
      lon: number;
      /** Heliocentric ecliptic latitude (radians). */
      lat: number;
      /** Heliocentric distance (AU). */
      range: number;
    }

    export class Planet {
      // Opaque: pass the default-export of an `astronomia/data/vsop87B*.js`.
      constructor(planetData: unknown);
      /** Heliocentric position, equinox + ecliptic of date. */
      position(jde: number): VSOP87Coord;
      /** Heliocentric position, J2000 reference frame. */
      position2000(jde: number): VSOP87Coord;
    }
  }

  // ── moonposition ────────────────────────────────────────────────────
  export namespace moonposition {
    /** Geocentric Moon position. lon/lat in radians, range in km. */
    export function position(jde: number): {
      lon: number;
      lat: number;
      range: number;
    };
  }

  // ── solar ───────────────────────────────────────────────────────────
  export namespace solar {
    /**
     * Sun apparent geocentric longitude in radians (low-precision —
     * accurate to ~0.01° for modern dates). Input is `T` = Julian
     * centuries since J2000 (see `base.J2000Century`).
     */
    export function apparentLongitude(T: number): number;
  }

  // ── pluto ───────────────────────────────────────────────────────────
  export namespace pluto {
    /** Heliocentric Pluto position. lon/lat in radians, range in AU. */
    export function heliocentric(jde: number): {
      lon: number;
      lat: number;
      range: number;
    };
  }

  // ── nutation ────────────────────────────────────────────────────────
  export namespace nutation {
    /** Mean obliquity of the ecliptic in radians. */
    export function meanObliquity(jde: number): number;
  }

  // ── sidereal ────────────────────────────────────────────────────────
  export namespace sidereal {
    /** Greenwich apparent sidereal time at JD, in seconds of time. */
    export function apparent(jd: number): number;
    /** Greenwich mean sidereal time at JD, in seconds of time. */
    export function mean(jd: number): number;
  }
}

// ── VSOP87 data subpath ────────────────────────────────────────────────
// `astronomia/data` is a separate subpath export — a default object
// holding every VSOP87B (ecliptic-of-date) and VSOP87D (J2000) table.
// We only consume the B series; the field shape on each is opaque (it's
// the polynomial-series tables the Planet constructor accepts).
declare module "astronomia/data" {
  interface AstronomiaDataMap {
    vsop87Bmercury: unknown;
    vsop87Bvenus: unknown;
    vsop87Bearth: unknown;
    vsop87Bmars: unknown;
    vsop87Bjupiter: unknown;
    vsop87Bsaturn: unknown;
    vsop87Buranus: unknown;
    vsop87Bneptune: unknown;
  }
  const data: AstronomiaDataMap;
  export default data;
}
