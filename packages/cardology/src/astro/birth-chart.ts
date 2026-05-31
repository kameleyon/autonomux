/**
 * Birth chart — high-level wrapper that calls ephemeris + houses +
 * aspects and returns the unified shape the rest of the app stores in
 * Supabase (`astro_birth_charts` + `astro_planet_positions` + `astro_aspects`).
 *
 * Time handling: callers supply local birth date + local birth time +
 * tz_offset_minutes (e.g. -480 for Pacific Standard Time). We convert
 * to a UTC instant before calling the ephemeris — VSOP87 + Meeus all
 * operate in dynamical time, which we approximate by UTC for sign-level
 * precision (see notes in `ephemeris.ts`).
 */

import {
  computeAspects,
  computeHouses,
  computePlanetPositions,
  type Aspect,
  type HouseSystem,
  type Houses,
  type PlanetPositions,
} from "./ephemeris";

export interface BirthChartInput {
  /** Local birth date — "YYYY-MM-DD" (no timezone). */
  dob: string;
  /** Local birth time — "HH:MM" or "HH:MM:SS". If omitted, defaults to
   *  noon (best non-informative prior — minimises Moon-position error). */
  dob_time?: string | null;
  /** Geographic latitude in degrees, north positive. */
  lat: number;
  /** Geographic longitude in degrees, east positive. */
  lng: number;
  /** Offset from UTC in minutes at the birth instant (e.g. -480 for
   *  PST, +330 for IST). Required: we don't try to look up the
   *  historical zone here. */
  tz_offset_minutes: number;
  /** House system; default "placidus". */
  house_system?: HouseSystem;
}

export interface BirthChart {
  /** UTC instant of birth — ISO 8601. */
  birth_utc: string;
  positions: PlanetPositions;
  houses: Houses;
  aspects: Aspect[];
}

/**
 * Parse local date + time + tz offset into a UTC `Date` instant.
 *
 * Example: dob="1990-06-15", dob_time="03:45", tz_offset_minutes=-420
 *   → local midnight-of-day shifted by 3h45m, then UTC = local + 7h.
 */
function toUtcInstant(input: BirthChartInput): Date {
  const time = input.dob_time ?? "12:00";
  // Normalise "HH:MM" → "HH:MM:00" so Date.parse is deterministic.
  const fullTime = time.length === 5 ? `${time}:00` : time;
  // Construct the local wall-clock instant explicitly as UTC, then
  // shift by the negative offset to recover true UTC. (Avoids the
  // host-machine's Intl timezone leaking into the calculation.)
  const localAsIfUtc = new Date(`${input.dob}T${fullTime}Z`);
  if (Number.isNaN(localAsIfUtc.getTime())) {
    throw new Error(
      `Invalid birth date/time: dob=${input.dob} dob_time=${time}`,
    );
  }
  // localAsIfUtc currently holds the wall-clock numbers as if they were
  // UTC. To convert local→UTC, subtract the local zone's offset from
  // UTC. By convention tz_offset_minutes = (local − UTC), so
  // UTC = local − offset. We're subtracting offset_minutes from the
  // already-UTC-stamped wall clock.
  return new Date(
    localAsIfUtc.getTime() - input.tz_offset_minutes * 60_000,
  );
}

export function computeBirthChart(input: BirthChartInput): BirthChart {
  const utc = toUtcInstant(input);
  const positions = computePlanetPositions(utc, input.lat, input.lng);
  const houses = computeHouses(
    utc,
    input.lat,
    input.lng,
    input.house_system ?? "placidus",
  );
  const aspects = computeAspects(positions);
  return {
    birth_utc: utc.toISOString(),
    positions,
    houses,
    aspects,
  };
}
