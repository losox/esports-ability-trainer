/** Dimension 2: Aiming Precision — pure scoring logic (no Three.js) */

/** Maximum misses before game over */
export const MAX_MISSES = 3;

/** Targets per difficulty level increment */
export const TARGETS_PER_LEVEL = 5;

/** Base target distance in meters (level 0) */
const BASE_DISTANCE = 8;

/** Distance increment per difficulty level */
const DISTANCE_INCREMENT = 1.5;

/** Max target distance */
const MAX_DISTANCE = 22;

/** Base existence time in ms (level 0) */
const BASE_EXISTENCE_MS = 3000;

/** Existence time decrement per level */
const EXISTENCE_DECREMENT_MS = 200;

/** Minimum existence time */
const MIN_EXISTENCE_MS = 800;

/** Base angle range in degrees (level 0) */
const BASE_ANGLE_RANGE = 15;

/** Angle range increment per level */
const ANGLE_INCREMENT = 10;

/** Max angle range in degrees */
const MAX_ANGLE_RANGE = 90;

/** Base scores per hit zone */
const ZONE_BASE_SCORE: Record<HitZone, number> = {
  head: 50,
  body: 30,
  graze: 10,
  miss: 0,
};

/** Hit zone types */
export type HitZone = 'head' | 'body' | 'graze' | 'miss';

/** Result of a single shot */
export interface HitResult {
  zone: HitZone;
  distance: number;
  aimTimeMs: number;
  targetIndex: number;
}

/**
 * Calculate the score for a single hit.
 * Farther targets are worth more via a distance multiplier.
 */
export function calculateHitScore(hit: HitResult): number {
  const base = ZONE_BASE_SCORE[hit.zone];
  const distMultiplier = 1 + Math.max(0, (hit.distance - BASE_DISTANCE) / 24);
  return Math.round(base * Math.min(distMultiplier, 2));
}

/**
 * Calculate cumulative session score from all hits.
 */
export function calculateScore(hits: HitResult[]): number {
  return hits.reduce((sum, hit) => sum + calculateHitScore(hit), 0);
}

/**
 * Calculate headshot rate as a percentage (0-100).
 */
export function calculateHeadshotRate(hits: HitResult[]): number {
  if (hits.length === 0) return 0;
  const headshots = hits.filter((h) => h.zone === 'head').length;
  return Math.round((headshots / hits.length) * 100);
}

/**
 * Calculate average aim time in ms.
 * Only counts hits with a positive aim time.
 */
export function calculateAvgAimTime(hits: HitResult[]): number {
  const validHits = hits.filter((h) => h.aimTimeMs > 0);
  if (validHits.length === 0) return 0;
  const sum = validHits.reduce((s, h) => s + h.aimTimeMs, 0);
  return Math.round(sum / validHits.length);
}

/**
 * Calculate hit/miss ratio as a decimal (e.g. 0.75).
 */
export function calculateHitMissRatio(hits: HitResult[], misses: number): number {
  const total = hits.length + misses;
  if (total === 0) return 0;
  return Math.round((hits.length / total) * 100) / 100;
}

/**
 * Calculate grade based on total score.
 * Pro: 800-1000, Expert: 600-750, Average: 300-500
 */
export function calculateGrade(score: number): string {
  if (score >= 800) return 'S';
  if (score >= 600) return 'A';
  if (score >= 300) return 'B';
  if (score >= 150) return 'C';
  return 'D';
}

/**
 * Get the current difficulty level based on target index.
 * Difficulty increases every TARGETS_PER_LEVEL targets.
 */
export function getDifficultyLevel(targetIndex: number): number {
  return Math.floor(targetIndex / TARGETS_PER_LEVEL);
}

/**
 * Get target distance for a given difficulty level.
 */
export function getTargetDistance(level: number): number {
  return Math.min(MAX_DISTANCE, BASE_DISTANCE + level * DISTANCE_INCREMENT);
}

/**
 * Get target existence time in ms for a given difficulty level.
 */
export function getExistenceTime(level: number): number {
  return Math.max(MIN_EXISTENCE_MS, BASE_EXISTENCE_MS - level * EXISTENCE_DECREMENT_MS);
}

/**
 * Get target angle range in degrees for a given difficulty level.
 * Controls how far targets spread from center, requiring head turning.
 */
export function getTargetAngleRange(level: number): number {
  return Math.min(MAX_ANGLE_RANGE, BASE_ANGLE_RANGE + level * ANGLE_INCREMENT);
}

/**
 * Determine the hit zone from a raycast intersection.
 * Uses the object's userData.zone and checks edge proximity for graze.
 */
export function determineHitZone(
  zone: string,
  distFromCenter: number,
  bodyRadius: number,
): HitZone {
  if (zone === 'head') return 'head';
  if (zone === 'body') {
    if (distFromCenter > bodyRadius * 0.8) return 'graze';
    return 'body';
  }
  return 'miss';
}
