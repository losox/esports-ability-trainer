/** Dimension 3: Target Tracking — pure scoring logic (no Three.js) */

/** Maximum fails before game over */
export const MAX_FAILS = 3;

/** Kills per difficulty level increment */
export const TARGETS_PER_LEVEL = 5;

/** Base kill time limit in ms (level 0) */
const BASE_KILL_TIME_MS = 8000;

/** Kill time limit decrement per level */
const KILL_TIME_DECREMENT_MS = 500;

/** Minimum kill time limit */
const MIN_KILL_TIME_MS = 3000;

/** Base movement speed (level 0) */
const BASE_MOVEMENT_SPEED = 2;

/** Speed increment per level */
const SPEED_INCREMENT = 0.8;

/** Maximum movement speed */
const MAX_SPEED = 8;

/** Base target size multiplier (level 0) */
const BASE_TARGET_SIZE = 1.0;

/** Size decrement per level */
const SIZE_DECREMENT = 0.08;

/** Minimum target size */
const MIN_TARGET_SIZE = 0.5;

/** Base target health (level 0) */
const BASE_HEALTH = 100;

/** Health increment per level */
const HEALTH_INCREMENT = 30;

/** Movement pattern type */
export type MovementPattern = 'straight' | 'zigzag' | 'random';

/** Result of a single kill */
export interface KillResult {
  killTimeMs: number;
  timeOnTargetMs: number;
  totalTimeMs: number;
  difficultyLevel: number;
  smoothness: number;
}

/**
 * Calculate session score = cumulative kills.
 */
export function calculateScore(kills: KillResult[]): number {
  return kills.length;
}

/**
 * Calculate tracking accuracy as a percentage (0-100).
 * Time on target divided by total time.
 */
export function calculateTrackingAccuracy(timeOnTargetMs: number, totalTimeMs: number): number {
  if (totalTimeMs <= 0) return 0;
  return Math.round((timeOnTargetMs / totalTimeMs) * 100);
}

/**
 * Calculate average kill time in ms.
 */
export function calculateAvgKillTime(kills: KillResult[]): number {
  if (kills.length === 0) return 0;
  const sum = kills.reduce((s, k) => s + k.killTimeMs, 0);
  return Math.round(sum / kills.length);
}

/**
 * Calculate tracking smoothness (0-100) from velocity changes.
 * Lower variance in velocity changes = smoother tracking = higher score.
 */
export function calculateTrackingSmoothness(velocityChanges: number[]): number {
  if (velocityChanges.length < 2) return 100;
  const avg = velocityChanges.reduce((s, v) => s + v, 0) / velocityChanges.length;
  const variance = velocityChanges.reduce((s, v) => s + (v - avg) ** 2, 0) / velocityChanges.length;
  const stdDev = Math.sqrt(variance);
  return Math.max(0, Math.min(100, Math.round(100 - stdDev * 200)));
}

/**
 * Calculate overall tracking accuracy across all kills.
 */
export function calculateOverallAccuracy(kills: KillResult[]): number {
  if (kills.length === 0) return 0;
  const totalOnTarget = kills.reduce((s, k) => s + k.timeOnTargetMs, 0);
  const totalTime = kills.reduce((s, k) => s + k.totalTimeMs, 0);
  return calculateTrackingAccuracy(totalOnTarget, totalTime);
}

/**
 * Calculate overall tracking smoothness across all kills.
 */
export function calculateOverallSmoothness(kills: KillResult[]): number {
  if (kills.length === 0) return 0;
  const sum = kills.reduce((s, k) => s + k.smoothness, 0);
  return Math.round(sum / kills.length);
}

/**
 * Calculate grade based on kill count.
 * Pro: 45+, Expert: 25+, Average: 15+
 */
export function calculateGrade(score: number): string {
  if (score >= 45) return 'S';
  if (score >= 25) return 'A';
  if (score >= 15) return 'B';
  if (score >= 10) return 'C';
  return 'D';
}

/**
 * Get the current difficulty level based on kill count.
 */
export function getDifficultyLevel(killCount: number): number {
  return Math.floor(killCount / TARGETS_PER_LEVEL);
}

/**
 * Get target movement speed for a given difficulty level.
 */
export function getMovementSpeed(level: number): number {
  return Math.min(MAX_SPEED, BASE_MOVEMENT_SPEED + level * SPEED_INCREMENT);
}

/**
 * Get movement pattern for a given difficulty level.
 * straight → zigzag → random as level increases.
 */
export function getMovementPattern(level: number): MovementPattern {
  if (level < 2) return 'straight';
  if (level < 4) return 'zigzag';
  return 'random';
}

/**
 * Get target size multiplier for a given difficulty level.
 */
export function getTargetSize(level: number): number {
  return Math.max(MIN_TARGET_SIZE, BASE_TARGET_SIZE - level * SIZE_DECREMENT);
}

/**
 * Get kill time limit in ms for a given difficulty level.
 */
export function getKillTimeLimit(level: number): number {
  return Math.max(MIN_KILL_TIME_MS, BASE_KILL_TIME_MS - level * KILL_TIME_DECREMENT_MS);
}

/**
 * Get target health for a given difficulty level.
 */
export function getTargetHealth(level: number): number {
  return BASE_HEALTH + level * HEALTH_INCREMENT;
}
