/**
 * D7 Cognitive Flexibility Training — Core scoring logic (pure functions, no Three.js)
 *
 * Universal cognitive flexibility training using a magic chessboard theme.
 * Players must rapidly switch between boards with different rules and
 * complete patterns within time limits. No progressive difficulty,
 * no failure condition — fixed parameters, 2-minute timer, pure scoring.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BoardId = 'A' | 'B' | 'C' | 'D' | 'E';

export type LightingRule =
  'clockwise' | 'counter-clockwise' | 'cross' | 'three-of-four' | 'diagonal';

export type PiecePosition = 0 | 1 | 2 | 3;

export interface BoardRule {
  id: BoardId;
  rule: LightingRule;
  color: number;
  order: PiecePosition[];
  key: string;
}

export interface SwitchEvent {
  timestamp: number;
  fromBoard: BoardId | null;
  toBoard: BoardId;
  firstKeypressBoard: BoardId | null;
  reactionTimeMs: number;
  isCorrectFirstSwitch: boolean;
}

export interface PatternCompletion {
  timestamp: number;
  boardId: BoardId;
  clickedOrder: PiecePosition[];
  correctOrder: PiecePosition[];
  isCompleted: boolean;
  timeElapsedMs: number;
  isWithinTime: boolean;
}

export interface SessionMetrics {
  totalScore: number;
  avgSwitchReactionMs: number;
  firstSwitchAccuracy: number;
  postSwitchErrorRate: number;
  totalCompletions: number;
  totalSwitches: number;
}

export interface SubMetricSnapshot {
  switchReactionMs: number;
  firstSwitchAccuracy: number;
  postSwitchErrorRate: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Total session duration in ms (2 minutes) */
export const SESSION_DURATION_MS = 120_000;

/** Time limit for completing a pattern after switching to a board (ms) */
export const PATTERN_TIME_LIMIT_MS = 3_000;

/** Light change interval range (ms) */
export const LIGHT_CHANGE_MIN_MS = 10_000;
export const LIGHT_CHANGE_MAX_MS = 15_000;

/** Maximum possible score */
export const MAX_SCORE = 1000;

/** Board count */
export const BOARD_COUNT = 5;

/** Pieces per board */
export const PIECES_PER_BOARD = 4;

// ---------------------------------------------------------------------------
// Board rules
// ---------------------------------------------------------------------------

export const BOARD_RULES: BoardRule[] = [
  {
    id: 'A',
    rule: 'clockwise',
    color: 0xff4500,
    order: [0, 1, 2, 3],
    key: 'a',
  },
  {
    id: 'B',
    rule: 'counter-clockwise',
    color: 0x4488ff,
    order: [3, 2, 1, 0],
    key: 'b',
  },
  {
    id: 'C',
    rule: 'cross',
    color: 0xaa44ff,
    order: [0, 3, 1, 2],
    key: 'c',
  },
  {
    id: 'D',
    rule: 'three-of-four',
    color: 0x44ff44,
    order: [0, 1, 3],
    key: 'd',
  },
  {
    id: 'E',
    rule: 'diagonal',
    color: 0xff8800,
    order: [0, 3, 1, 2],
    key: 'e',
  },
];

export function getBoardRule(boardId: BoardId): BoardRule {
  const rule = BOARD_RULES.find((r) => r.id === boardId);
  if (!rule) throw new Error(`Unknown board: ${boardId}`);
  return rule;
}

export function getBoardByKey(key: string): BoardRule | null {
  const lower = key.toLowerCase();
  return BOARD_RULES.find((r) => r.key === lower) ?? null;
}

// ---------------------------------------------------------------------------
// Light change timing
// ---------------------------------------------------------------------------

export function generateLightChangeInterval(): number {
  return LIGHT_CHANGE_MIN_MS + Math.random() * (LIGHT_CHANGE_MAX_MS - LIGHT_CHANGE_MIN_MS);
}

export function generateRandomBoard(exclude?: BoardId): BoardId {
  const available = BOARD_RULES.filter((r) => r.id !== exclude);
  const idx = Math.floor(Math.random() * available.length);
  return available[idx].id;
}

// ---------------------------------------------------------------------------
// Pattern validation
// ---------------------------------------------------------------------------

export function validatePattern(
  clickedOrder: PiecePosition[],
  correctOrder: PiecePosition[],
): boolean {
  if (clickedOrder.length !== correctOrder.length) return false;
  return clickedOrder.every((piece, i) => piece === correctOrder[i]);
}

export function isPatternCompletedWithinTime(timeElapsedMs: number): boolean {
  return timeElapsedMs <= PATTERN_TIME_LIMIT_MS;
}

// ---------------------------------------------------------------------------
// Switch event analysis
// ---------------------------------------------------------------------------

export function calculateSwitchReactionTime(events: SwitchEvent[]): number {
  const valid = events.filter((e) => e.reactionTimeMs > 0);
  if (valid.length === 0) return 0;
  const total = valid.reduce((sum, e) => sum + e.reactionTimeMs, 0);
  return Math.round(total / valid.length);
}

export function calculateFirstSwitchAccuracy(events: SwitchEvent[]): number {
  if (events.length === 0) return 0;
  const correct = events.filter((e) => e.isCorrectFirstSwitch).length;
  return Math.round((correct / events.length) * 100);
}

// ---------------------------------------------------------------------------
// Pattern completion analysis
// ---------------------------------------------------------------------------

export function calculatePostSwitchErrorRate(completions: PatternCompletion[]): number {
  if (completions.length === 0) return 0;
  const errors = completions.filter((c) => !c.isCompleted || !c.isWithinTime).length;
  return Math.round((errors / completions.length) * 100);
}

export function calculateCompletions(completions: PatternCompletion[]): number {
  return completions.filter((c) => c.isCompleted && c.isWithinTime).length;
}

// ---------------------------------------------------------------------------
// Comprehensive scoring (weighted)
// ---------------------------------------------------------------------------

/** Weight factors for comprehensive score */
const WEIGHT_SWITCH_REACTION = 0.35;
const WEIGHT_FIRST_SWITCH = 0.3;
const WEIGHT_EXECUTION = 0.35;

/** Reference reaction times (ms) */
const PRO_REACTION_MS = 500;
const EXPERT_REACTION_MS = 1000;
const AVERAGE_REACTION_MS = 2000;

export function calculateScore(metrics: SubMetricSnapshot): number {
  if (metrics.switchReactionMs <= 0) return 0;

  const reactionScore = scoreReactionTime(metrics.switchReactionMs);
  const accuracyScore = metrics.firstSwitchAccuracy; // 0-100
  const executionScore = 100 - metrics.postSwitchErrorRate; // 0-100

  const total =
    reactionScore * WEIGHT_SWITCH_REACTION +
    accuracyScore * WEIGHT_FIRST_SWITCH +
    executionScore * WEIGHT_EXECUTION;

  return Math.round((total / 100) * MAX_SCORE);
}

function scoreReactionTime(reactionMs: number): number {
  if (reactionMs <= 0) return 0;
  if (reactionMs <= PRO_REACTION_MS) return 100;
  if (reactionMs <= EXPERT_REACTION_MS) {
    const ratio = (reactionMs - PRO_REACTION_MS) / (EXPERT_REACTION_MS - PRO_REACTION_MS);
    return Math.round(100 - ratio * 25);
  }
  if (reactionMs <= AVERAGE_REACTION_MS) {
    const ratio = (reactionMs - EXPERT_REACTION_MS) / (AVERAGE_REACTION_MS - EXPERT_REACTION_MS);
    return Math.round(75 - ratio * 35);
  }
  if (reactionMs <= 4000) {
    const ratio = (reactionMs - AVERAGE_REACTION_MS) / (4000 - AVERAGE_REACTION_MS);
    return Math.round(40 - ratio * 30);
  }
  return Math.max(0, Math.round(10 - (reactionMs - 4000) / 200));
}

// ---------------------------------------------------------------------------
// Session metrics aggregation
// ---------------------------------------------------------------------------

export function calculateSessionMetrics(
  switchEvents: SwitchEvent[],
  patternCompletions: PatternCompletion[],
): SessionMetrics {
  const avgSwitchReactionMs = calculateSwitchReactionTime(switchEvents);
  const firstSwitchAccuracy = calculateFirstSwitchAccuracy(switchEvents);
  const postSwitchErrorRate = calculatePostSwitchErrorRate(patternCompletions);

  const score = calculateScore({
    switchReactionMs: avgSwitchReactionMs,
    firstSwitchAccuracy,
    postSwitchErrorRate,
  });

  const totalCompletions = calculateCompletions(patternCompletions);

  return {
    totalScore: score,
    avgSwitchReactionMs,
    firstSwitchAccuracy,
    postSwitchErrorRate,
    totalCompletions,
    totalSwitches: switchEvents.length,
  };
}

// ---------------------------------------------------------------------------
// Grade
// ---------------------------------------------------------------------------

export function calculateGrade(score: number): string {
  if (score >= 850) return 'S';
  if (score >= 700) return 'A';
  if (score >= 500) return 'B';
  if (score >= 300) return 'C';
  return 'D';
}

// ---------------------------------------------------------------------------
// Remaining time helper
// ---------------------------------------------------------------------------

export function calculateRemainingTime(startTime: number, currentTime: number): number {
  const elapsed = currentTime - startTime;
  return Math.max(0, SESSION_DURATION_MS - elapsed);
}

export function isSessionOver(startTime: number, currentTime: number): boolean {
  return currentTime - startTime >= SESSION_DURATION_MS;
}

// ---------------------------------------------------------------------------
// Key mapping
// ---------------------------------------------------------------------------

export const KEY_TO_BOARD: Record<string, BoardId> = {
  a: 'A',
  b: 'B',
  c: 'C',
  d: 'D',
  e: 'E',
};

export function isBoardKey(key: string): boolean {
  return key.toLowerCase() in KEY_TO_BOARD;
}
