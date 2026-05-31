/**
 * @autonomux/cardology
 *
 * Sacred-Symbols cardology engine + Western astrology ephemeris.
 *
 * Two independent surfaces, exposed from one package because they
 * share the same Oracle subagent + same Supabase rows:
 *
 *   - `cardology` — deterministic 53-card system (PUSH/PITCH/PAUSE/SAVE
 *     classifier, weekly money forecast actors, day/week/month lookups).
 *     No randomness, no I/O — pure functions over a static data table.
 *
 *   - `astro` — apparent geocentric planet positions, houses, and
 *     aspects computed from `astronomia` (pure JS VSOP87 + Meeus). No
 *     native deps; runs unchanged on Vercel Functions, Railway, Edge,
 *     Lambda, and Windows.
 *
 * Both are pure: no DB connection, no fetch, no console.log. Persistence
 * lives in `@autonomux/db` migrations (see 0012_cardology_and_astro.sql).
 */

// ── cardology engine ───────────────────────────────────────────────────
export {
  bestRecord,
  buildFrame,
  calcActors,
  combine,
  defaultTransitMap,
  fmtDate,
  formatSummary,
  getCallLabel,
  getIntensity,
  getPlanets,
  getPPPS,
  getScore,
  getSolar,
  getWeekCard,
  PLANET_LIST,
  type ActorRecord,
  type ActorResult,
  type DayCard,
  type ForecastResult,
  type WeekFrame,
} from "./cardology/engine";

// ── cardology data ─────────────────────────────────────────────────────
export {
  CALL_LABEL,
  CARDOLOGY_DATA,
  DAY_NAMES,
  DEFAULT_TRANSIT,
  MONTHS,
  PLANETS,
  TRANSIT_OPTS,
  type Card,
  type CardologyData,
  type Intensity,
  type IntensityKey,
  type Planet,
  type PPPS,
  type Suit,
  type Transit,
  type WeekEntry,
} from "./cardology/data";

// ── astro: zodiac signs ────────────────────────────────────────────────
export {
  degreeToSign,
  ELEMENTS,
  MODALITIES,
  normalizeDeg,
  SIGNS,
  type ZodiacElement,
  type ZodiacModality,
  type ZodiacSign,
} from "./astro/sign";

// ── astro: ephemeris ───────────────────────────────────────────────────
export {
  computeAspects,
  computeHouses,
  computePlanetPositions,
  PLANET_NAMES,
  type Aspect,
  type AspectType,
  type Houses,
  type HouseSystem,
  type PlanetName,
  type PlanetPosition,
  type PlanetPositions,
} from "./astro/ephemeris";

// ── astro: high-level birth-chart ──────────────────────────────────────
export {
  computeBirthChart,
  type BirthChart,
  type BirthChartInput,
} from "./astro/birth-chart";
