/**
 * D6 Working Memory Training — Core scoring logic (pure functions, no Three.js)
 *
 * MOBA-themed working memory training. Players observe enemy units on a map,
 * units disappear (enter fog of war), then players mark where each unit was.
 * Difficulty increases progressively: more units, longer silence, movement,
 * and interference during the silence phase.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Position {
  x: number;
  y: number;
}

export interface UnitPosition {
  id: number;
  position: Position;
  type: UnitType;
  /** Movement that occurred before disappearance (0 = none, >0 = moving) */
  moveOffset?: Position;
}

export type UnitType = 'normal' | 'fast' | 'tank';

export type MovementType = 'none' | 'linear' | 'direction-change';

export type InterferenceType = 'none' | 'flashing' | 'text-prompt';

export interface DifficultyConfig {
  level: number;
  unitCount: number;
  silenceDurationMs: number;
  observeDurationMs: number;
  movement: MovementType;
  interference: InterferenceType;
  unitTypesDifferentiated: boolean;
}

export interface MarkingResult {
  unitId: number;
  markedPosition: Position;
  actualPosition: Position;
  deviation: number;
  isMissing: boolean;
}

export interface RoundResult {
  round: number;
  difficulty: DifficultyConfig;
  markings: MarkingResult[];
  avgDeviation: number;
  completeRecall: boolean;
  isFailure: boolean;
  roundScore: number;
}

export interface SessionStats {
  totalScore: number;
  avgDeviation: number;
  completeRecallRate: number;
  failures: number;
  roundsCompleted: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum failures before game over */
export const MAX_FAILURES = 3;

/** Starting unit count */
const BASE_UNIT_COUNT = 2;

/** Starting silence duration in ms */
const BASE_SILENCE_MS = 2000;

/** Starting observe duration in ms */
const BASE_OBSERVE_MS = 5000;

/** Observe duration decrement per 2 rounds (ms) */
const OBSERVE_DECREMENT_MS = 500;

/** Minimum observe duration (ms) */
const MIN_OBSERVE_MS = 3000;

/** Silence duration increment per 2 rounds (ms) */
const SILENCE_INCREMENT_MS = 1000;

/** Maximum score per round */
const MAX_ROUND_SCORE = 1000;

/** Deviation threshold for failure (px). Markings beyond this = failure */
export const FAILURE_DEVIATION_THRESHOLD = 200;

/** Maximum meaningful deviation for scoring (px). Beyond this = 0 points */
const MAX_DEVIATION_FOR_SCORE = 300;

/** Map size (logical units, square map) */
export const MAP_SIZE = 20;

/** Reference scores */
const PRO_DEVIATION = 30;
const EXPERT_DEVIATION = 70;
const AVERAGE_DEVIATION = 150;

// ---------------------------------------------------------------------------
// Difficulty progression
// ---------------------------------------------------------------------------

export function generateDifficulty(round: number): DifficultyConfig {
  const level = round;
  const tier = Math.floor((round - 1) / 2);

  const unitCount = BASE_UNIT_COUNT + tier;
  const silenceDurationMs = BASE_SILENCE_MS + tier * SILENCE_INCREMENT_MS;
  const observeDurationMs = Math.max(MIN_OBSERVE_MS, BASE_OBSERVE_MS - tier * OBSERVE_DECREMENT_MS);

  let movement: MovementType = 'none';
  if (tier >= 2) movement = 'linear';
  if (tier >= 4) movement = 'direction-change';

  let interference: InterferenceType = 'none';
  if (tier >= 1) interference = 'flashing';
  if (tier >= 3) interference = 'text-prompt';

  const unitTypesDifferentiated = tier >= 3;

  return {
    level,
    unitCount,
    silenceDurationMs,
    observeDurationMs,
    movement,
    interference,
    unitTypesDifferentiated,
  };
}

// ---------------------------------------------------------------------------
// Position generation
// ---------------------------------------------------------------------------

export function generateUnitPositions(count: number, mapSize: number): UnitPosition[] {
  const positions: UnitPosition[] = [];
  const minDistance = 2.5;

  let attempts = 0;
  while (positions.length < count && attempts < 500) {
    attempts++;
    const pos: Position = {
      x: (Math.random() - 0.5) * mapSize * 0.8,
      y: (Math.random() - 0.5) * mapSize * 0.8,
    };

    const tooClose = positions.some(
      (p) => Math.hypot(p.position.x - pos.x, p.position.y - pos.y) < minDistance,
    );
    if (tooClose) continue;

    positions.push({
      id: positions.length,
      position: pos,
      type: 'normal',
    });
  }

  return positions;
}

export function applyMovement(units: UnitPosition[], movement: MovementType): UnitPosition[] {
  if (movement === 'none') return units.map((u) => ({ ...u }));

  return units.map((u) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 1 + Math.random() * 1.5;

    let moveOffset: Position;
    if (movement === 'linear') {
      moveOffset = {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
      };
    } else {
      // direction-change: two segments
      const angle2 = angle + Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
      const dist2 = 0.5 + Math.random();
      moveOffset = {
        x: Math.cos(angle) * distance + Math.cos(angle2) * dist2,
        y: Math.sin(angle) * distance + Math.sin(angle2) * dist2,
      };
    }

    return {
      ...u,
      moveOffset,
      position: {
        x: u.position.x + moveOffset.x,
        y: u.position.y + moveOffset.y,
      },
    };
  });
}

export function assignUnitTypes(units: UnitPosition[], differentiated: boolean): UnitPosition[] {
  if (!differentiated) return units;

  const types: UnitType[] = ['normal', 'fast', 'tank'];
  return units.map((u, i) => ({
    ...u,
    type: types[i % types.length],
  }));
}

// ---------------------------------------------------------------------------
// Deviation & scoring
// ---------------------------------------------------------------------------

export function calculateDeviation(marked: Position, actual: Position): number {
  return Math.hypot(marked.x - actual.x, marked.y - actual.y);
}

export function calculateMarkingResults(
  markings: Position[],
  actualUnits: UnitPosition[],
): MarkingResult[] {
  const results: MarkingResult[] = [];
  const usedUnitIds = new Set<number>();

  for (const mark of markings) {
    let bestId = -1;
    let bestDeviation = Infinity;

    for (const unit of actualUnits) {
      if (usedUnitIds.has(unit.id)) continue;
      const dev = calculateDeviation(mark, unit.position);
      if (dev < bestDeviation) {
        bestDeviation = dev;
        bestId = unit.id;
      }
    }

    if (bestId >= 0) {
      usedUnitIds.add(bestId);
      results.push({
        unitId: bestId,
        markedPosition: mark,
        actualPosition: actualUnits[bestId].position,
        deviation: bestDeviation,
        isMissing: false,
      });
    }
  }

  for (const unit of actualUnits) {
    if (!usedUnitIds.has(unit.id)) {
      results.push({
        unitId: unit.id,
        markedPosition: { x: 0, y: 0 },
        actualPosition: unit.position,
        deviation: FAILURE_DEVIATION_THRESHOLD + 100,
        isMissing: true,
      });
    }
  }

  return results;
}

export function isFailure(markings: MarkingResult[], threshold: number): boolean {
  if (markings.length === 0) return true;
  return markings.some((m) => m.deviation > threshold || m.isMissing);
}

export function calculateRoundScore(
  markings: MarkingResult[],
  difficulty: DifficultyConfig,
): number {
  if (markings.length === 0) return 0;

  const totalDeviation = markings.reduce((sum, m) => sum + m.deviation, 0);
  const avgDeviation = totalDeviation / markings.length;

  if (avgDeviation >= MAX_DEVIATION_FOR_SCORE) return 0;

  const deviationRatio = avgDeviation / MAX_DEVIATION_FOR_SCORE;
  const baseScore = Math.round(MAX_ROUND_SCORE * (1 - deviationRatio));

  const difficultyMultiplier = 1 + (difficulty.level - 1) * 0.1;
  const completeBonus = markings.every((m) => !m.isMissing) ? 1.15 : 1.0;

  return Math.round(baseScore * difficultyMultiplier * completeBonus);
}

// ---------------------------------------------------------------------------
// Session-level aggregation
// ---------------------------------------------------------------------------

export function calculateAvgDeviation(rounds: RoundResult[]): number {
  if (rounds.length === 0) return 0;
  const validRounds = rounds.filter((r) => !r.isFailure);
  if (validRounds.length === 0) return 0;

  const total = validRounds.reduce((sum, r) => sum + r.avgDeviation, 0);
  return Math.round(total / validRounds.length);
}

export function calculateCompleteRecallRate(rounds: RoundResult[]): number {
  if (rounds.length === 0) return 0;
  const validRounds = rounds.filter((r) => !r.isFailure);
  if (validRounds.length === 0) return 0;

  const complete = validRounds.filter((r) => r.completeRecall).length;
  return Math.round((complete / validRounds.length) * 100);
}

export function calculateTotalScore(rounds: RoundResult[]): number {
  return rounds.reduce((sum, r) => sum + r.roundScore, 0);
}

export function calculateSessionStats(rounds: RoundResult[]): SessionStats {
  return {
    totalScore: calculateTotalScore(rounds),
    avgDeviation: calculateAvgDeviation(rounds),
    completeRecallRate: calculateCompleteRecallRate(rounds),
    failures: rounds.filter((r) => r.isFailure).length,
    roundsCompleted: rounds.length,
  };
}

// ---------------------------------------------------------------------------
// Grade
// ---------------------------------------------------------------------------

export function calculateGrade(score: number): string {
  if (score >= 5000) return 'S';
  if (score >= 3500) return 'A';
  if (score >= 2000) return 'B';
  if (score >= 1000) return 'C';
  return 'D';
}

// ---------------------------------------------------------------------------
// Reference benchmarks
// ---------------------------------------------------------------------------

export interface Benchmark {
  label: string;
  capacity: string;
  deviation: string;
}

export function getBenchmark(avgDeviation: number): Benchmark {
  if (avgDeviation <= PRO_DEVIATION) {
    return { label: 'Pro', capacity: '7-8', deviation: '<30px' };
  }
  if (avgDeviation <= EXPERT_DEVIATION) {
    return { label: 'Expert', capacity: '5-6', deviation: '40-70px' };
  }
  if (avgDeviation <= AVERAGE_DEVIATION) {
    return { label: 'Average', capacity: '3-4', deviation: '100-150px' };
  }
  return { label: 'Beginner', capacity: '1-2', deviation: '>150px' };
}
