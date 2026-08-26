import { describe, it, expect } from 'vitest';
import {
  calculateDeviation,
  calculateMarkingResults,
  calculateRoundScore,
  calculateAvgDeviation,
  calculateCompleteRecallRate,
  calculateTotalScore,
  calculateSessionStats,
  calculateGrade,
  isFailure,
  generateDifficulty,
  generateUnitPositions,
  applyMovement,
  assignUnitTypes,
  getBenchmark,
  MAX_FAILURES,
  FAILURE_DEVIATION_THRESHOLD,
  MAP_SIZE,
  type Position,
  type UnitPosition,
  type RoundResult,
  type DifficultyConfig,
} from '../logic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUnits(positions: Position[]): UnitPosition[] {
  return positions.map((p, i) => ({
    id: i,
    position: p,
    type: 'normal' as const,
  }));
}

function makeRound(
  round: number,
  avgDev: number,
  isFail: boolean,
  score: number,
  complete: boolean,
): RoundResult {
  const difficulty: DifficultyConfig = generateDifficulty(round);
  return {
    round,
    difficulty,
    markings: [],
    avgDeviation: avgDev,
    completeRecall: complete,
    isFailure: isFail,
    roundScore: score,
  };
}

// ---------------------------------------------------------------------------
// generateDifficulty
// ---------------------------------------------------------------------------

describe('D6 generateDifficulty', () => {
  it('round 1 should have base parameters', () => {
    const d = generateDifficulty(1);
    expect(d.unitCount).toBe(2);
    expect(d.silenceDurationMs).toBe(2000);
    expect(d.movement).toBe('none');
    expect(d.interference).toBe('none');
    expect(d.unitTypesDifferentiated).toBe(false);
  });

  it('should increase unit count every 2 rounds', () => {
    expect(generateDifficulty(1).unitCount).toBe(2);
    expect(generateDifficulty(2).unitCount).toBe(2);
    expect(generateDifficulty(3).unitCount).toBe(3);
    expect(generateDifficulty(4).unitCount).toBe(3);
    expect(generateDifficulty(5).unitCount).toBe(4);
  });

  it('should increase silence duration every 2 rounds', () => {
    expect(generateDifficulty(1).silenceDurationMs).toBe(2000);
    expect(generateDifficulty(3).silenceDurationMs).toBe(3000);
    expect(generateDifficulty(5).silenceDurationMs).toBe(4000);
  });

  it('should not let observe duration go below minimum', () => {
    const d = generateDifficulty(20);
    expect(d.observeDurationMs).toBeGreaterThanOrEqual(3000);
  });

  it('should escalate movement type with tiers', () => {
    expect(generateDifficulty(1).movement).toBe('none');
    expect(generateDifficulty(5).movement).toBe('linear');
    expect(generateDifficulty(9).movement).toBe('direction-change');
  });

  it('should escalate interference with tiers', () => {
    expect(generateDifficulty(1).interference).toBe('none');
    expect(generateDifficulty(3).interference).toBe('flashing');
    expect(generateDifficulty(7).interference).toBe('text-prompt');
  });

  it('should differentiate unit types at tier 3+', () => {
    expect(generateDifficulty(1).unitTypesDifferentiated).toBe(false);
    expect(generateDifficulty(5).unitTypesDifferentiated).toBe(false);
    expect(generateDifficulty(7).unitTypesDifferentiated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateUnitPositions
// ---------------------------------------------------------------------------

describe('D6 generateUnitPositions', () => {
  it('should generate the requested number of units', () => {
    const units = generateUnitPositions(5, MAP_SIZE);
    expect(units).toHaveLength(5);
  });

  it('each unit should have a unique id', () => {
    const units = generateUnitPositions(4, MAP_SIZE);
    const ids = units.map((u) => u.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('positions should be within map bounds', () => {
    const units = generateUnitPositions(10, MAP_SIZE);
    const half = MAP_SIZE * 0.4;
    for (const u of units) {
      expect(Math.abs(u.position.x)).toBeLessThanOrEqual(half + 0.1);
      expect(Math.abs(u.position.y)).toBeLessThanOrEqual(half + 0.1);
    }
  });

  it('units should not overlap (min distance)', () => {
    const units = generateUnitPositions(6, MAP_SIZE);
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const dist = Math.hypot(
          units[i].position.x - units[j].position.x,
          units[i].position.y - units[j].position.y,
        );
        expect(dist).toBeGreaterThanOrEqual(2.5);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// applyMovement
// ---------------------------------------------------------------------------

describe('D6 applyMovement', () => {
  it('none movement should return same positions', () => {
    const units = makeUnits([
      { x: 0, y: 0 },
      { x: 5, y: 3 },
    ]);
    const moved = applyMovement(units, 'none');
    expect(moved[0].position).toEqual({ x: 0, y: 0 });
    expect(moved[1].position).toEqual({ x: 5, y: 3 });
    expect(moved[0].moveOffset).toBeUndefined();
  });

  it('linear movement should change positions', () => {
    const units = makeUnits([{ x: 0, y: 0 }]);
    const moved = applyMovement(units, 'linear');
    const dist = Math.hypot(moved[0].moveOffset!.x, moved[0].moveOffset!.y);
    expect(dist).toBeGreaterThan(0);
  });

  it('direction-change should produce movement offset', () => {
    const units = makeUnits([{ x: 0, y: 0 }]);
    const moved = applyMovement(units, 'direction-change');
    const dist = Math.hypot(moved[0].moveOffset!.x, moved[0].moveOffset!.y);
    expect(dist).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// assignUnitTypes
// ---------------------------------------------------------------------------

describe('D6 assignUnitTypes', () => {
  it('non-differentiated should keep all normal', () => {
    const units = makeUnits([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]);
    const result = assignUnitTypes(units, false);
    expect(result.every((u) => u.type === 'normal')).toBe(true);
  });

  it('differentiated should assign varied types', () => {
    const units = makeUnits([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: -3, y: 2 },
    ]);
    const result = assignUnitTypes(units, true);
    const types = result.map((u) => u.type);
    expect(new Set(types).size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// calculateDeviation
// ---------------------------------------------------------------------------

describe('D6 calculateDeviation', () => {
  it('same position should have 0 deviation', () => {
    expect(calculateDeviation({ x: 5, y: 3 }, { x: 5, y: 3 })).toBe(0);
  });

  it('should calculate correct Euclidean distance', () => {
    const dev = calculateDeviation({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(dev).toBeCloseTo(5, 5);
  });

  it('deviation should be symmetric', () => {
    const a = { x: 2, y: 7 };
    const b = { x: -1, y: 3 };
    expect(calculateDeviation(a, b)).toBeCloseTo(calculateDeviation(b, a), 5);
  });
});

// ---------------------------------------------------------------------------
// calculateMarkingResults
// ---------------------------------------------------------------------------

describe('D6 calculateMarkingResults', () => {
  it('exact matches should have 0 deviation', () => {
    const units = makeUnits([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]);
    const markings: Position[] = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ];
    const results = calculateMarkingResults(markings, units);
    expect(results).toHaveLength(2);
    results.forEach((r) => expect(r.deviation).toBeCloseTo(0, 5));
    expect(results.every((r) => !r.isMissing)).toBe(true);
  });

  it('should match markings to nearest units', () => {
    const units = makeUnits([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
    const markings: Position[] = [
      { x: 0.5, y: 0.5 },
      { x: 9.5, y: 9.5 },
    ];
    const results = calculateMarkingResults(markings, units);
    expect(results).toHaveLength(2);
    expect(results[0].unitId).toBe(0);
    expect(results[1].unitId).toBe(1);
  });

  it('missing units should be marked as missing', () => {
    const units = makeUnits([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: -3, y: 2 },
    ]);
    const markings: Position[] = [{ x: 0, y: 0 }];
    const results = calculateMarkingResults(markings, units);
    expect(results).toHaveLength(3);
    const missing = results.filter((r) => r.isMissing);
    expect(missing).toHaveLength(2);
  });

  it('empty markings should mark all units as missing', () => {
    const units = makeUnits([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]);
    const results = calculateMarkingResults([], units);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.isMissing)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isFailure
// ---------------------------------------------------------------------------

describe('D6 isFailure', () => {
  it('empty markings should be a failure', () => {
    expect(isFailure([], FAILURE_DEVIATION_THRESHOLD)).toBe(true);
  });

  it('all markings within threshold should not fail', () => {
    const results = [
      {
        unitId: 0,
        markedPosition: { x: 0, y: 0 },
        actualPosition: { x: 0, y: 0 },
        deviation: 10,
        isMissing: false,
      },
      {
        unitId: 1,
        markedPosition: { x: 5, y: 5 },
        actualPosition: { x: 5, y: 5 },
        deviation: 20,
        isMissing: false,
      },
    ];
    expect(isFailure(results, FAILURE_DEVIATION_THRESHOLD)).toBe(false);
  });

  it('a missing unit should cause failure', () => {
    const results = [
      {
        unitId: 0,
        markedPosition: { x: 0, y: 0 },
        actualPosition: { x: 0, y: 0 },
        deviation: 10,
        isMissing: false,
      },
      {
        unitId: 1,
        markedPosition: { x: 0, y: 0 },
        actualPosition: { x: 5, y: 5 },
        deviation: 999,
        isMissing: true,
      },
    ];
    expect(isFailure(results, FAILURE_DEVIATION_THRESHOLD)).toBe(true);
  });

  it('deviation exceeding threshold should fail', () => {
    const results = [
      {
        unitId: 0,
        markedPosition: { x: 0, y: 0 },
        actualPosition: { x: 250, y: 0 },
        deviation: 250,
        isMissing: false,
      },
    ];
    expect(isFailure(results, FAILURE_DEVIATION_THRESHOLD)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateRoundScore
// ---------------------------------------------------------------------------

describe('D6 calculateRoundScore', () => {
  const easyDifficulty = generateDifficulty(1);

  it('perfect markings should give high score', () => {
    const results = [
      {
        unitId: 0,
        markedPosition: { x: 0, y: 0 },
        actualPosition: { x: 0, y: 0 },
        deviation: 0,
        isMissing: false,
      },
      {
        unitId: 1,
        markedPosition: { x: 5, y: 5 },
        actualPosition: { x: 5, y: 5 },
        deviation: 0,
        isMissing: false,
      },
    ];
    const score = calculateRoundScore(results, easyDifficulty);
    expect(score).toBeGreaterThan(800);
  });

  it('larger deviation should give lower score', () => {
    const perfect = [
      {
        unitId: 0,
        markedPosition: { x: 0, y: 0 },
        actualPosition: { x: 0, y: 0 },
        deviation: 10,
        isMissing: false,
      },
    ];
    const poor = [
      {
        unitId: 0,
        markedPosition: { x: 0, y: 0 },
        actualPosition: { x: 200, y: 0 },
        deviation: 200,
        isMissing: false,
      },
    ];
    expect(calculateRoundScore(perfect, easyDifficulty)).toBeGreaterThan(
      calculateRoundScore(poor, easyDifficulty),
    );
  });

  it('empty markings should return 0', () => {
    expect(calculateRoundScore([], easyDifficulty)).toBe(0);
  });

  it('higher difficulty should multiply score', () => {
    const results = [
      {
        unitId: 0,
        markedPosition: { x: 0, y: 0 },
        actualPosition: { x: 0, y: 0 },
        deviation: 5,
        isMissing: false,
      },
    ];
    const easy = generateDifficulty(1);
    const hard = generateDifficulty(10);
    expect(calculateRoundScore(results, hard)).toBeGreaterThan(calculateRoundScore(results, easy));
  });

  it('complete recall should give bonus', () => {
    const complete = [
      {
        unitId: 0,
        markedPosition: { x: 0, y: 0 },
        actualPosition: { x: 0, y: 0 },
        deviation: 10,
        isMissing: false,
      },
      {
        unitId: 1,
        markedPosition: { x: 5, y: 5 },
        actualPosition: { x: 5, y: 5 },
        deviation: 10,
        isMissing: false,
      },
    ];
    const incomplete = [
      {
        unitId: 0,
        markedPosition: { x: 0, y: 0 },
        actualPosition: { x: 0, y: 0 },
        deviation: 10,
        isMissing: false,
      },
      {
        unitId: 1,
        markedPosition: { x: 0, y: 0 },
        actualPosition: { x: 5, y: 5 },
        deviation: 999,
        isMissing: true,
      },
    ];
    const scoreComplete = calculateRoundScore(complete, easyDifficulty);
    const scoreIncomplete = calculateRoundScore(incomplete, easyDifficulty);
    expect(scoreComplete).toBeGreaterThan(scoreIncomplete);
  });

  it('deviation beyond max should return 0', () => {
    const results = [
      {
        unitId: 0,
        markedPosition: { x: 0, y: 0 },
        actualPosition: { x: 400, y: 0 },
        deviation: 400,
        isMissing: false,
      },
    ];
    expect(calculateRoundScore(results, easyDifficulty)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Session aggregation
// ---------------------------------------------------------------------------

describe('D6 session aggregation', () => {
  const rounds: RoundResult[] = [
    makeRound(1, 50, false, 900, true),
    makeRound(2, 60, false, 850, true),
    makeRound(3, 100, false, 700, false),
  ];

  it('calculateAvgDeviation should average non-failed rounds', () => {
    expect(calculateAvgDeviation(rounds)).toBe(Math.round((50 + 60 + 100) / 3));
  });

  it('calculateAvgDeviation should skip failed rounds', () => {
    const withFail = [...rounds, makeRound(4, 999, true, 0, false)];
    expect(calculateAvgDeviation(withFail)).toBe(Math.round((50 + 60 + 100) / 3));
  });

  it('calculateAvgDeviation empty should return 0', () => {
    expect(calculateAvgDeviation([])).toBe(0);
  });

  it('calculateCompleteRecallRate should compute percentage', () => {
    expect(calculateCompleteRecallRate(rounds)).toBe(67);
  });

  it('calculateCompleteRecallRate should skip failed rounds', () => {
    const withFail = [...rounds, makeRound(4, 999, true, 0, false)];
    expect(calculateCompleteRecallRate(withFail)).toBe(67);
  });

  it('calculateTotalScore should sum round scores', () => {
    expect(calculateTotalScore(rounds)).toBe(2450);
  });

  it('calculateSessionStats should return all stats', () => {
    const stats = calculateSessionStats(rounds);
    expect(stats.totalScore).toBe(2450);
    expect(stats.failures).toBe(0);
    expect(stats.roundsCompleted).toBe(3);
    expect(stats.avgDeviation).toBeGreaterThan(0);
    expect(stats.completeRecallRate).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// calculateGrade
// ---------------------------------------------------------------------------

describe('D6 calculateGrade', () => {
  it('score >= 5000 should be S', () => {
    expect(calculateGrade(5000)).toBe('S');
    expect(calculateGrade(8000)).toBe('S');
  });

  it('score >= 3500 should be A', () => {
    expect(calculateGrade(3500)).toBe('A');
  });

  it('score >= 2000 should be B', () => {
    expect(calculateGrade(2000)).toBe('B');
  });

  it('score >= 1000 should be C', () => {
    expect(calculateGrade(1000)).toBe('C');
  });

  it('score < 1000 should be D', () => {
    expect(calculateGrade(500)).toBe('D');
    expect(calculateGrade(0)).toBe('D');
  });
});

// ---------------------------------------------------------------------------
// getBenchmark
// ---------------------------------------------------------------------------

describe('D6 getBenchmark', () => {
  it('deviation <= 30 should be Pro', () => {
    expect(getBenchmark(30).label).toBe('Pro');
  });

  it('deviation <= 70 should be Expert', () => {
    expect(getBenchmark(70).label).toBe('Expert');
  });

  it('deviation <= 150 should be Average', () => {
    expect(getBenchmark(150).label).toBe('Average');
  });

  it('deviation > 150 should be Beginner', () => {
    expect(getBenchmark(200).label).toBe('Beginner');
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('D6 constants', () => {
  it('MAX_FAILURES should be 3', () => {
    expect(MAX_FAILURES).toBe(3);
  });

  it('FAILURE_DEVIATION_THRESHOLD should be positive', () => {
    expect(FAILURE_DEVIATION_THRESHOLD).toBeGreaterThan(0);
  });

  it('MAP_SIZE should be positive', () => {
    expect(MAP_SIZE).toBeGreaterThan(0);
  });
});
