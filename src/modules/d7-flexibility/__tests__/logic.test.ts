import { describe, it, expect } from 'vitest';
import {
  BOARD_RULES,
  BOARD_COUNT,
  PIECES_PER_BOARD,
  SESSION_DURATION_MS,
  PATTERN_TIME_LIMIT_MS,
  LIGHT_CHANGE_MIN_MS,
  LIGHT_CHANGE_MAX_MS,
  KEY_TO_BOARD,
  MAX_SCORE,
  getBoardRule,
  getBoardByKey,
  generateLightChangeInterval,
  generateRandomBoard,
  validatePattern,
  isPatternCompletedWithinTime,
  calculateSwitchReactionTime,
  calculateFirstSwitchAccuracy,
  calculatePostSwitchErrorRate,
  calculateCompletions,
  calculateScore,
  calculateSessionMetrics,
  calculateGrade,
  calculateRemainingTime,
  isSessionOver,
  isBoardKey,
  type SwitchEvent,
  type PatternCompletion,
  type PiecePosition,
  type BoardId,
  type SubMetricSnapshot,
} from '../logic';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('D7 constants', () => {
  it('SESSION_DURATION_MS should be 2 minutes', () => {
    expect(SESSION_DURATION_MS).toBe(120_000);
  });

  it('PATTERN_TIME_LIMIT_MS should be 3 seconds', () => {
    expect(PATTERN_TIME_LIMIT_MS).toBe(3_000);
  });

  it('LIGHT_CHANGE range should be 10-15 seconds', () => {
    expect(LIGHT_CHANGE_MIN_MS).toBe(10_000);
    expect(LIGHT_CHANGE_MAX_MS).toBe(15_000);
  });

  it('BOARD_COUNT should be 5', () => {
    expect(BOARD_COUNT).toBe(5);
  });

  it('PIECES_PER_BOARD should be 4', () => {
    expect(PIECES_PER_BOARD).toBe(4);
  });

  it('MAX_SCORE should be 1000', () => {
    expect(MAX_SCORE).toBe(1000);
  });

  it('KEY_TO_BOARD should map a-e', () => {
    expect(KEY_TO_BOARD.a).toBe('A');
    expect(KEY_TO_BOARD.e).toBe('E');
  });
});

// ---------------------------------------------------------------------------
// Board rules
// ---------------------------------------------------------------------------

describe('D7 board rules', () => {
  it('should have 5 boards', () => {
    expect(BOARD_RULES).toHaveLength(5);
  });

  it('each board should have unique id', () => {
    const ids = BOARD_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('board A should be clockwise with order [0,1,2,3]', () => {
    const rule = getBoardRule('A');
    expect(rule.rule).toBe('clockwise');
    expect(rule.order).toEqual([0, 1, 2, 3]);
  });

  it('board B should be counter-clockwise with order [3,2,1,0]', () => {
    const rule = getBoardRule('B');
    expect(rule.rule).toBe('counter-clockwise');
    expect(rule.order).toEqual([3, 2, 1, 0]);
  });

  it('board D should light only 3 of 4 pieces', () => {
    const rule = getBoardRule('D');
    expect(rule.rule).toBe('three-of-four');
    expect(rule.order.length).toBe(3);
  });

  it('getBoardRule should throw for unknown board', () => {
    expect(() => getBoardRule('Z' as BoardId)).toThrow();
  });

  it('getBoardByKey should return board by lowercase key', () => {
    expect(getBoardByKey('a')?.id).toBe('A');
    expect(getBoardByKey('c')?.id).toBe('C');
  });

  it('getBoardByKey should return null for unknown key', () => {
    expect(getBoardByKey('z')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Light change timing
// ---------------------------------------------------------------------------

describe('D7 light change timing', () => {
  it('generateLightChangeInterval should be within 10-15s', () => {
    for (let i = 0; i < 100; i++) {
      const interval = generateLightChangeInterval();
      expect(interval).toBeGreaterThanOrEqual(LIGHT_CHANGE_MIN_MS);
      expect(interval).toBeLessThanOrEqual(LIGHT_CHANGE_MAX_MS);
    }
  });

  it('generateRandomBoard should return a valid board', () => {
    const board = generateRandomBoard();
    expect(BOARD_RULES.some((r) => r.id === board)).toBe(true);
  });

  it('generateRandomBoard should exclude specified board', () => {
    for (let i = 0; i < 50; i++) {
      const board = generateRandomBoard('A');
      expect(board).not.toBe('A');
    }
  });
});

// ---------------------------------------------------------------------------
// Pattern validation
// ---------------------------------------------------------------------------

describe('D7 validatePattern', () => {
  it('correct order should be valid', () => {
    expect(validatePattern([0, 1, 2, 3], [0, 1, 2, 3])).toBe(true);
  });

  it('wrong order should be invalid', () => {
    expect(validatePattern([0, 2, 1, 3], [0, 1, 2, 3])).toBe(false);
  });

  it('different lengths should be invalid', () => {
    expect(validatePattern([0, 1, 2], [0, 1, 2, 3])).toBe(false);
  });

  it('empty patterns should be valid', () => {
    expect(validatePattern([], [])).toBe(true);
  });

  it('three-of-four board pattern should validate with 3 pieces', () => {
    const rule = getBoardRule('D');
    expect(validatePattern([0, 1, 3], rule.order)).toBe(true);
    expect(validatePattern([0, 1, 2], rule.order)).toBe(false);
  });
});

describe('D7 isPatternCompletedWithinTime', () => {
  it('within 3s should be true', () => {
    expect(isPatternCompletedWithinTime(2500)).toBe(true);
  });

  it('exactly 3s should be true', () => {
    expect(isPatternCompletedWithinTime(3000)).toBe(true);
  });

  it('over 3s should be false', () => {
    expect(isPatternCompletedWithinTime(3001)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Switch reaction time
// ---------------------------------------------------------------------------

describe('D7 calculateSwitchReactionTime', () => {
  it('should average valid reaction times', () => {
    const events: SwitchEvent[] = [
      makeSwitchEvent(1000, 'A', 'A', true),
      makeSwitchEvent(2000, 'B', 'B', true),
      makeSwitchEvent(3000, 'C', 'C', true),
    ];
    expect(calculateSwitchReactionTime(events)).toBe(2000);
  });

  it('should skip events with 0 reaction time', () => {
    const events: SwitchEvent[] = [
      makeSwitchEvent(1000, 'A', 'A', true),
      {
        timestamp: 2000,
        fromBoard: null,
        toBoard: 'B',
        firstKeypressBoard: null,
        reactionTimeMs: 0,
        isCorrectFirstSwitch: false,
      },
    ];
    expect(calculateSwitchReactionTime(events)).toBe(1000);
  });

  it('empty events should return 0', () => {
    expect(calculateSwitchReactionTime([])).toBe(0);
  });

  it('all invalid events should return 0', () => {
    const events: SwitchEvent[] = [
      {
        timestamp: 1000,
        fromBoard: null,
        toBoard: 'A',
        firstKeypressBoard: null,
        reactionTimeMs: 0,
        isCorrectFirstSwitch: false,
      },
    ];
    expect(calculateSwitchReactionTime(events)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// First switch accuracy
// ---------------------------------------------------------------------------

describe('D7 calculateFirstSwitchAccuracy', () => {
  it('all correct should be 100%', () => {
    const events: SwitchEvent[] = [
      makeSwitchEvent(1000, 'A', 'A', true),
      makeSwitchEvent(1200, 'B', 'B', true),
    ];
    expect(calculateFirstSwitchAccuracy(events)).toBe(100);
  });

  it('half correct should be 50%', () => {
    const events: SwitchEvent[] = [
      makeSwitchEvent(1000, 'A', 'A', true),
      makeSwitchEvent(1200, 'B', 'C', false),
    ];
    expect(calculateFirstSwitchAccuracy(events)).toBe(50);
  });

  it('none correct should be 0%', () => {
    const events: SwitchEvent[] = [
      makeSwitchEvent(1000, 'A', 'B', false),
      makeSwitchEvent(1200, 'B', 'A', false),
    ];
    expect(calculateFirstSwitchAccuracy(events)).toBe(0);
  });

  it('empty events should return 0', () => {
    expect(calculateFirstSwitchAccuracy([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Post-switch error rate
// ---------------------------------------------------------------------------

describe('D7 calculatePostSwitchErrorRate', () => {
  it('all completed should be 0% error rate', () => {
    const completions: PatternCompletion[] = [
      makeCompletion('A', [0, 1, 2, 3], true, 2000),
      makeCompletion('B', [3, 2, 1, 0], true, 2500),
    ];
    expect(calculatePostSwitchErrorRate(completions)).toBe(0);
  });

  it('all failed should be 100% error rate', () => {
    const completions: PatternCompletion[] = [
      makeCompletion('A', [0, 2, 1, 3], false, 2500),
      makeCompletion('B', [3, 1, 2, 0], false, 2500),
    ];
    expect(calculatePostSwitchErrorRate(completions)).toBe(100);
  });

  it('half failed should be 50% error rate', () => {
    const completions: PatternCompletion[] = [
      makeCompletion('A', [0, 1, 2, 3], true, 2000),
      makeCompletion('B', [3, 1, 2, 0], false, 2500),
    ];
    expect(calculatePostSwitchErrorRate(completions)).toBe(50);
  });

  it('timeout should count as error', () => {
    const completions: PatternCompletion[] = [makeCompletion('A', [0, 1, 2, 3], true, 4000)];
    expect(calculatePostSwitchErrorRate(completions)).toBe(100);
  });

  it('empty completions should return 0', () => {
    expect(calculatePostSwitchErrorRate([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Completions count
// ---------------------------------------------------------------------------

describe('D7 calculateCompletions', () => {
  it('should count only completed and within-time', () => {
    const completions: PatternCompletion[] = [
      makeCompletion('A', [0, 1, 2, 3], true, 2000),
      makeCompletion('B', [3, 2, 1, 0], true, 2500),
      makeCompletion('C', [0, 3, 1, 2], false, 2000),
      makeCompletion('D', [0, 1, 3], true, 4000),
    ];
    expect(calculateCompletions(completions)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------

describe('D7 calculateScore', () => {
  it('perfect metrics should give near-max score', () => {
    const metrics: SubMetricSnapshot = {
      switchReactionMs: 400,
      firstSwitchAccuracy: 100,
      postSwitchErrorRate: 0,
    };
    const score = calculateScore(metrics);
    expect(score).toBeGreaterThan(900);
  });

  it('worse reaction time should lower score', () => {
    const fast = calculateScore({
      switchReactionMs: 500,
      firstSwitchAccuracy: 100,
      postSwitchErrorRate: 0,
    });
    const slow = calculateScore({
      switchReactionMs: 2000,
      firstSwitchAccuracy: 100,
      postSwitchErrorRate: 0,
    });
    expect(fast).toBeGreaterThan(slow);
  });

  it('lower accuracy should lower score', () => {
    const high = calculateScore({
      switchReactionMs: 1000,
      firstSwitchAccuracy: 100,
      postSwitchErrorRate: 0,
    });
    const low = calculateScore({
      switchReactionMs: 1000,
      firstSwitchAccuracy: 50,
      postSwitchErrorRate: 0,
    });
    expect(high).toBeGreaterThan(low);
  });

  it('higher error rate should lower score', () => {
    const lowErr = calculateScore({
      switchReactionMs: 1000,
      firstSwitchAccuracy: 100,
      postSwitchErrorRate: 0,
    });
    const highErr = calculateScore({
      switchReactionMs: 1000,
      firstSwitchAccuracy: 100,
      postSwitchErrorRate: 80,
    });
    expect(lowErr).toBeGreaterThan(highErr);
  });

  it('zero reaction time should return 0', () => {
    expect(
      calculateScore({ switchReactionMs: 0, firstSwitchAccuracy: 100, postSwitchErrorRate: 0 }),
    ).toBe(0);
  });

  it('worst metrics should give low score', () => {
    const score = calculateScore({
      switchReactionMs: 5000,
      firstSwitchAccuracy: 0,
      postSwitchErrorRate: 100,
    });
    expect(score).toBeLessThan(150);
  });

  it('score should never exceed MAX_SCORE', () => {
    const score = calculateScore({
      switchReactionMs: 100,
      firstSwitchAccuracy: 100,
      postSwitchErrorRate: 0,
    });
    expect(score).toBeLessThanOrEqual(MAX_SCORE);
  });
});

// ---------------------------------------------------------------------------
// Session metrics
// ---------------------------------------------------------------------------

describe('D7 calculateSessionMetrics', () => {
  it('should aggregate all metrics correctly', () => {
    const switchEvents: SwitchEvent[] = [
      makeSwitchEvent(800, 'A', 'A', true),
      makeSwitchEvent(1200, 'B', 'B', true),
      makeSwitchEvent(1500, 'C', 'D', false),
    ];
    const completions: PatternCompletion[] = [
      makeCompletion('A', [0, 1, 2, 3], true, 2000),
      makeCompletion('B', [3, 2, 1, 0], true, 2500),
      makeCompletion('D', [0, 2, 1], false, 2000),
    ];

    const metrics = calculateSessionMetrics(switchEvents, completions);
    expect(metrics.totalSwitches).toBe(3);
    expect(metrics.totalCompletions).toBe(2);
    expect(metrics.avgSwitchReactionMs).toBe(Math.round((800 + 1200 + 1500) / 3));
    expect(metrics.firstSwitchAccuracy).toBe(67);
    expect(metrics.postSwitchErrorRate).toBe(33);
    expect(metrics.totalScore).toBeGreaterThan(0);
    expect(metrics.totalScore).toBeLessThanOrEqual(MAX_SCORE);
  });

  it('empty inputs should return zero metrics', () => {
    const metrics = calculateSessionMetrics([], []);
    expect(metrics.totalScore).toBe(0);
    expect(metrics.avgSwitchReactionMs).toBe(0);
    expect(metrics.firstSwitchAccuracy).toBe(0);
    expect(metrics.postSwitchErrorRate).toBe(0);
    expect(metrics.totalCompletions).toBe(0);
    expect(metrics.totalSwitches).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Grade
// ---------------------------------------------------------------------------

describe('D7 calculateGrade', () => {
  it('score >= 850 should be S', () => {
    expect(calculateGrade(850)).toBe('S');
    expect(calculateGrade(950)).toBe('S');
  });

  it('score >= 700 should be A', () => {
    expect(calculateGrade(700)).toBe('A');
  });

  it('score >= 500 should be B', () => {
    expect(calculateGrade(500)).toBe('B');
  });

  it('score >= 300 should be C', () => {
    expect(calculateGrade(300)).toBe('C');
  });

  it('score < 300 should be D', () => {
    expect(calculateGrade(299)).toBe('D');
    expect(calculateGrade(0)).toBe('D');
  });
});

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

describe('D7 time helpers', () => {
  it('calculateRemainingTime should compute correctly', () => {
    expect(calculateRemainingTime(0, 60_000)).toBe(60_000);
    expect(calculateRemainingTime(0, 120_000)).toBe(0);
  });

  it('calculateRemainingTime should never go negative', () => {
    expect(calculateRemainingTime(0, 200_000)).toBe(0);
  });

  it('isSessionOver should be false before duration', () => {
    expect(isSessionOver(0, 60_000)).toBe(false);
  });

  it('isSessionOver should be true at duration', () => {
    expect(isSessionOver(0, 120_000)).toBe(true);
  });

  it('isSessionOver should be true after duration', () => {
    expect(isSessionOver(0, 150_000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Key mapping
// ---------------------------------------------------------------------------

describe('D7 key mapping', () => {
  it('isBoardKey should recognize a-e', () => {
    expect(isBoardKey('a')).toBe(true);
    expect(isBoardKey('b')).toBe(true);
    expect(isBoardKey('c')).toBe(true);
    expect(isBoardKey('d')).toBe(true);
    expect(isBoardKey('e')).toBe(true);
  });

  it('isBoardKey should be case-insensitive', () => {
    expect(isBoardKey('A')).toBe(true);
    expect(isBoardKey('C')).toBe(true);
  });

  it('isBoardKey should reject non-board keys', () => {
    expect(isBoardKey('f')).toBe(false);
    expect(isBoardKey('x')).toBe(false);
    expect(isBoardKey('1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSwitchEvent(
  reactionMs: number,
  toBoard: BoardId,
  firstKey: BoardId,
  isCorrect: boolean,
): SwitchEvent {
  return {
    timestamp: Date.now(),
    fromBoard: null,
    toBoard,
    firstKeypressBoard: firstKey,
    reactionTimeMs: reactionMs,
    isCorrectFirstSwitch: isCorrect,
  };
}

function makeCompletion(
  boardId: BoardId,
  clickedOrder: PiecePosition[],
  isCompleted: boolean,
  timeElapsedMs: number,
): PatternCompletion {
  const rule = getBoardRule(boardId);
  return {
    timestamp: Date.now(),
    boardId,
    clickedOrder,
    correctOrder: rule.order,
    isCompleted,
    timeElapsedMs,
    isWithinTime: isPatternCompletedWithinTime(timeElapsedMs),
  };
}
