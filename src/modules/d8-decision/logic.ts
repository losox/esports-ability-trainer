/**
 * D8 Decision Speed — Core scoring logic (pure functions, no Three.js)
 *
 * Multi-target resource allocation decision training.
 * Three target types with different HP/attack/countdown attributes.
 * Player must prioritize which targets to eliminate first.
 */

// === Types ===

export type TargetType = 'normal' | 'high-attack' | 'tank';
export type GameVersion = 'fps' | 'moba';

export interface TargetSpec {
  type: TargetType;
  hp: number;
  attack: number;
}

export interface RoundConfig {
  round: number;
  targets: TargetSpec[];
  countdownMs: number;
  hasMovement: boolean;
  difficultyMultiplier: number;
}

export interface RoundResult {
  round: number;
  survived: boolean;
  firstDecisionMs: number | null;
  damageTaken: number;
  targetsEliminated: number;
  totalTargets: number;
}

// === Constants ===

export const PLAYER_MAX_HP = 100;
export const MAX_SCORE = 1000;

export const TARGET_SPECS: Record<TargetType, TargetSpec> = {
  normal: { type: 'normal', hp: 1, attack: 5 },
  'high-attack': { type: 'high-attack', hp: 1, attack: 20 },
  tank: { type: 'tank', hp: 3, attack: 5 },
};

const BASE_SCORE_PER_ROUND = 50;
const SPEED_BONUS_MAX = 150;
const DAMAGE_PENALTY_PER_HP = 3;

/** Reference decision times (ms) */
const PRO_DECISION_MS = 300;
const EXPERT_DECISION_MS = 500;
const AVERAGE_DECISION_MS = 900;

// === Difficulty progression ===

/**
 * Difficulty multiplier increases by 0.2 every 3 rounds.
 * Round 1-3: 1.0, Round 4-6: 1.2, Round 7-9: 1.4, ...
 */
export function getDifficultyMultiplier(round: number): number {
  const step = Math.floor((round - 1) / 3);
  return Math.round((1.0 + step * 0.2) * 10) / 10;
}

/**
 * Simultaneous targets: starts at 2, +1 every 3 rounds.
 */
export function getSimultaneousTargets(round: number): number {
  return 2 + Math.floor((round - 1) / 3);
}

/**
 * Countdown duration: starts at 5000ms, -500ms every 3 rounds, minimum 2000ms.
 */
export function getCountdownDuration(round: number): number {
  const base = 5000;
  const reduction = Math.floor((round - 1) / 3) * 500;
  return Math.max(2000, base - reduction);
}

/**
 * Target movement enabled after round 6.
 */
export function getTargetMovement(round: number): boolean {
  return round > 6;
}

/**
 * Type mix complexity level (0-3).
 * 0: normal only (round 1-2)
 * 1: normal + high-attack (round 3-5)
 * 2: normal + high-attack + tank, simple cycle (round 6-8)
 * 3: complex weighted pattern (round 9+)
 */
export function getTypeMixComplexity(round: number): number {
  if (round <= 2) return 0;
  if (round <= 5) return 1;
  if (round <= 8) return 2;
  return 3;
}

// === Target generation ===

/**
 * Select target type based on complexity level and index.
 * Deterministic — same inputs always produce same output.
 */
export function selectTargetType(complexity: number, index: number): TargetType {
  switch (complexity) {
    case 0:
      return 'normal';
    case 1:
      return index % 2 === 0 ? 'normal' : 'high-attack';
    case 2: {
      const cycle: TargetType[] = ['normal', 'high-attack', 'tank'];
      return cycle[index % cycle.length];
    }
    default: {
      const pattern: TargetType[] = [
        'high-attack',
        'normal',
        'tank',
        'high-attack',
        'normal',
        'tank',
        'high-attack',
        'high-attack',
      ];
      return pattern[index % pattern.length];
    }
  }
}

/**
 * Generate target specs for a given round.
 */
export function generateTargetSpecs(round: number): TargetSpec[] {
  const count = getSimultaneousTargets(round);
  const complexity = getTypeMixComplexity(round);
  const specs: TargetSpec[] = [];
  for (let i = 0; i < count; i++) {
    const type = selectTargetType(complexity, i);
    specs.push({ ...TARGET_SPECS[type] });
  }
  return specs;
}

/**
 * Generate full round configuration.
 */
export function generateRound(round: number): RoundConfig {
  return {
    round,
    targets: generateTargetSpecs(round),
    countdownMs: getCountdownDuration(round),
    hasMovement: getTargetMovement(round),
    difficultyMultiplier: getDifficultyMultiplier(round),
  };
}

// === Scoring ===

/**
 * Speed bonus based on average first decision time.
 * Pro (<300ms): full bonus
 * Expert (300-500ms): partial bonus
 * Average (500-900ms): small bonus
 * Slow (>900ms): minimal bonus
 */
export function calculateSpeedBonus(avgFirstDecisionMs: number): number {
  if (avgFirstDecisionMs <= 0) return 0;
  if (avgFirstDecisionMs <= PRO_DECISION_MS) return SPEED_BONUS_MAX;
  if (avgFirstDecisionMs <= EXPERT_DECISION_MS) {
    const ratio = (avgFirstDecisionMs - PRO_DECISION_MS) / (EXPERT_DECISION_MS - PRO_DECISION_MS);
    return Math.round(SPEED_BONUS_MAX - ratio * 70);
  }
  if (avgFirstDecisionMs <= AVERAGE_DECISION_MS) {
    const ratio =
      (avgFirstDecisionMs - EXPERT_DECISION_MS) / (AVERAGE_DECISION_MS - EXPERT_DECISION_MS);
    return Math.round(80 - ratio * 60);
  }
  return Math.max(0, Math.round(20 - (avgFirstDecisionMs - AVERAGE_DECISION_MS) / 50));
}

/**
 * Base score from survived rounds (sum of per-round scores scaled by difficulty).
 */
export function calculateBaseScore(survivedRounds: number): number {
  let score = 0;
  for (let i = 1; i <= survivedRounds; i++) {
    score += BASE_SCORE_PER_ROUND * getDifficultyMultiplier(i);
  }
  return Math.round(score);
}

/**
 * Calculate average first decision time from round results.
 * Returns 0 if no valid decision times.
 */
export function calculateFirstDecisionTime(results: RoundResult[]): number {
  const validTimes = results
    .filter((r) => r.firstDecisionMs !== null && r.firstDecisionMs > 0)
    .map((r) => r.firstDecisionMs as number);
  if (validTimes.length === 0) return 0;
  return Math.round(validTimes.reduce((sum, t) => sum + t, 0) / validTimes.length);
}

/**
 * Calculate total damage taken across all rounds.
 */
export function calculateTotalDamage(results: RoundResult[]): number {
  return results.reduce((sum, r) => sum + r.damageTaken, 0);
}

/**
 * Final score: base score + speed bonus - damage penalty, capped at MAX_SCORE.
 */
export function calculateScore(survivedRounds: number, results: RoundResult[]): number {
  const baseScore = calculateBaseScore(survivedRounds);
  const avgDecision = calculateFirstDecisionTime(results);
  const speedBonus = avgDecision > 0 ? calculateSpeedBonus(avgDecision) : 0;
  const totalDamage = calculateTotalDamage(results);
  const damagePenalty = totalDamage * DAMAGE_PENALTY_PER_HP;

  const score = baseScore + speedBonus - damagePenalty;
  return Math.max(0, Math.min(MAX_SCORE, Math.round(score)));
}

/**
 * Evaluate decision time tier for display.
 */
export function evaluateDecisionTime(timeMs: number): 'pro' | 'expert' | 'average' | 'slow' {
  if (timeMs <= PRO_DECISION_MS) return 'pro';
  if (timeMs <= EXPERT_DECISION_MS) return 'expert';
  if (timeMs <= AVERAGE_DECISION_MS) return 'average';
  return 'slow';
}

/**
 * Calculate grade from score.
 */
export function calculateGrade(score: number): string {
  if (score >= 850) return 'S';
  if (score >= 700) return 'A';
  if (score >= 500) return 'B';
  if (score >= 300) return 'C';
  return 'D';
}
