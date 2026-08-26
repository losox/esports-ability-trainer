import { describe, it, expect } from 'vitest';
import {
  calculateScore,
  calculateTrackingAccuracy,
  calculateAvgKillTime,
  calculateTrackingSmoothness,
  calculateOverallAccuracy,
  calculateOverallSmoothness,
  calculateGrade,
  getDifficultyLevel,
  getMovementSpeed,
  getMovementPattern,
  getTargetSize,
  getKillTimeLimit,
  getTargetHealth,
  MAX_FAILS,
  TARGETS_PER_LEVEL,
  type KillResult,
} from '../logic';

function makeKill(
  killTimeMs: number,
  timeOnTargetMs: number,
  totalTimeMs: number,
  difficultyLevel: number,
  smoothness: number,
): KillResult {
  return { killTimeMs, timeOnTargetMs, totalTimeMs, difficultyLevel, smoothness };
}

describe('D3 Target Tracking logic', () => {
  describe('calculateScore', () => {
    it('returns cumulative kill count', () => {
      const kills = [
        makeKill(3000, 2000, 3000, 0, 80),
        makeKill(4000, 2500, 4000, 0, 70),
        makeKill(5000, 3000, 5000, 1, 75),
      ];
      expect(calculateScore(kills)).toBe(3);
    });

    it('empty kills returns 0', () => {
      expect(calculateScore([])).toBe(0);
    });
  });

  describe('calculateTrackingAccuracy', () => {
    it('calculates percentage of time on target', () => {
      expect(calculateTrackingAccuracy(3000, 5000)).toBe(60);
    });

    it('100 percent when all time on target', () => {
      expect(calculateTrackingAccuracy(5000, 5000)).toBe(100);
    });

    it('0 percent when no time on target', () => {
      expect(calculateTrackingAccuracy(0, 5000)).toBe(0);
    });

    it('returns 0 for zero total time', () => {
      expect(calculateTrackingAccuracy(0, 0)).toBe(0);
    });
  });

  describe('calculateAvgKillTime', () => {
    it('calculates average kill time', () => {
      const kills = [makeKill(3000, 2000, 3000, 0, 80), makeKill(5000, 3000, 5000, 0, 70)];
      expect(calculateAvgKillTime(kills)).toBe(4000);
    });

    it('empty kills returns 0', () => {
      expect(calculateAvgKillTime([])).toBe(0);
    });

    it('single kill returns its time', () => {
      const kills = [makeKill(4000, 2000, 4000, 0, 80)];
      expect(calculateAvgKillTime(kills)).toBe(4000);
    });
  });

  describe('calculateTrackingSmoothness', () => {
    it('returns 100 for perfectly smooth (all zeros)', () => {
      expect(calculateTrackingSmoothness([0, 0, 0, 0, 0])).toBe(100);
    });

    it('returns 100 for fewer than 2 values', () => {
      expect(calculateTrackingSmoothness([0.5])).toBe(100);
      expect(calculateTrackingSmoothness([])).toBe(100);
    });

    it('lower score for jerky movement', () => {
      const smooth = calculateTrackingSmoothness([0.01, 0.011, 0.01, 0.012, 0.01]);
      const jerky = calculateTrackingSmoothness([0.5, 0.01, 0.8, 0.02, 0.6]);
      expect(smooth).toBeGreaterThan(jerky);
    });

    it('returns 0 for extremely jerky movement', () => {
      const result = calculateTrackingSmoothness([0, 1, 0, 1, 0, 1]);
      expect(result).toBeLessThanOrEqual(100);
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateOverallAccuracy', () => {
    it('calculates weighted accuracy across all kills', () => {
      const kills = [makeKill(3000, 2000, 3000, 0, 80), makeKill(5000, 3000, 5000, 0, 70)];
      expect(calculateOverallAccuracy(kills)).toBe(63);
    });

    it('empty kills returns 0', () => {
      expect(calculateOverallAccuracy([])).toBe(0);
    });
  });

  describe('calculateOverallSmoothness', () => {
    it('calculates average smoothness', () => {
      const kills = [makeKill(3000, 2000, 3000, 0, 80), makeKill(5000, 3000, 5000, 0, 60)];
      expect(calculateOverallSmoothness(kills)).toBe(70);
    });

    it('empty kills returns 0', () => {
      expect(calculateOverallSmoothness([])).toBe(0);
    });
  });

  describe('calculateGrade', () => {
    it('returns S for 45+ kills', () => {
      expect(calculateGrade(45)).toBe('S');
      expect(calculateGrade(50)).toBe('S');
    });

    it('returns A for 25-44 kills', () => {
      expect(calculateGrade(25)).toBe('A');
      expect(calculateGrade(44)).toBe('A');
    });

    it('returns B for 15-24 kills', () => {
      expect(calculateGrade(15)).toBe('B');
      expect(calculateGrade(24)).toBe('B');
    });

    it('returns C for 10-14 kills', () => {
      expect(calculateGrade(10)).toBe('C');
      expect(calculateGrade(14)).toBe('C');
    });

    it('returns D for fewer than 10 kills', () => {
      expect(calculateGrade(9)).toBe('D');
      expect(calculateGrade(0)).toBe('D');
    });
  });

  describe('getDifficultyLevel', () => {
    it('returns 0 for first 5 kills', () => {
      expect(getDifficultyLevel(0)).toBe(0);
      expect(getDifficultyLevel(4)).toBe(0);
    });

    it('returns 1 for kills 5-9', () => {
      expect(getDifficultyLevel(5)).toBe(1);
      expect(getDifficultyLevel(9)).toBe(1);
    });

    it('returns 2 for kills 10-14', () => {
      expect(getDifficultyLevel(10)).toBe(2);
      expect(getDifficultyLevel(14)).toBe(2);
    });
  });

  describe('getMovementSpeed', () => {
    it('starts at base speed', () => {
      expect(getMovementSpeed(0)).toBe(2);
    });

    it('increases with level', () => {
      expect(getMovementSpeed(1)).toBeGreaterThan(2);
      expect(getMovementSpeed(3)).toBeGreaterThan(getMovementSpeed(1));
    });

    it('caps at max speed', () => {
      expect(getMovementSpeed(100)).toBeLessThanOrEqual(8);
    });
  });

  describe('getMovementPattern', () => {
    it('returns straight for levels 0-1', () => {
      expect(getMovementPattern(0)).toBe('straight');
      expect(getMovementPattern(1)).toBe('straight');
    });

    it('returns zigzag for levels 2-3', () => {
      expect(getMovementPattern(2)).toBe('zigzag');
      expect(getMovementPattern(3)).toBe('zigzag');
    });

    it('returns random for levels 4+', () => {
      expect(getMovementPattern(4)).toBe('random');
      expect(getMovementPattern(10)).toBe('random');
    });
  });

  describe('getTargetSize', () => {
    it('starts at 1.0', () => {
      expect(getTargetSize(0)).toBe(1.0);
    });

    it('decreases with level', () => {
      expect(getTargetSize(1)).toBeLessThan(1.0);
      expect(getTargetSize(3)).toBeLessThan(getTargetSize(1));
    });

    it('does not go below 0.5', () => {
      expect(getTargetSize(100)).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('getKillTimeLimit', () => {
    it('starts at 8000ms', () => {
      expect(getKillTimeLimit(0)).toBe(8000);
    });

    it('decreases by 500ms per level', () => {
      expect(getKillTimeLimit(1)).toBe(7500);
      expect(getKillTimeLimit(2)).toBe(7000);
    });

    it('does not go below 3000ms', () => {
      expect(getKillTimeLimit(100)).toBeGreaterThanOrEqual(3000);
    });
  });

  describe('getTargetHealth', () => {
    it('starts at 100', () => {
      expect(getTargetHealth(0)).toBe(100);
    });

    it('increases with level', () => {
      expect(getTargetHealth(1)).toBe(130);
      expect(getTargetHealth(2)).toBe(160);
    });
  });

  describe('MAX_FAILS', () => {
    it('is 3', () => {
      expect(MAX_FAILS).toBe(3);
    });
  });

  describe('TARGETS_PER_LEVEL', () => {
    it('is 5', () => {
      expect(TARGETS_PER_LEVEL).toBe(5);
    });
  });

  describe('reference score ranges', () => {
    it('average player gets 10-15 kills', () => {
      const kills = Array.from({ length: 12 }, (_, i) =>
        makeKill(5000, 2000, 5000, Math.floor(i / 5), 40),
      );
      expect(calculateScore(kills)).toBeGreaterThanOrEqual(10);
      expect(calculateScore(kills)).toBeLessThanOrEqual(15);
      expect(calculateOverallAccuracy(kills)).toBeGreaterThanOrEqual(35);
      expect(calculateOverallAccuracy(kills)).toBeLessThanOrEqual(45);
    });

    it('expert player gets 25-35 kills', () => {
      const kills = Array.from({ length: 30 }, (_, i) =>
        makeKill(4000, 2400, 4000, Math.floor(i / 5), 60),
      );
      expect(calculateScore(kills)).toBeGreaterThanOrEqual(25);
      expect(calculateScore(kills)).toBeLessThanOrEqual(35);
      expect(calculateOverallAccuracy(kills)).toBeGreaterThanOrEqual(55);
      expect(calculateOverallAccuracy(kills)).toBeLessThanOrEqual(65);
    });

    it('pro player gets 45+ kills', () => {
      const kills = Array.from({ length: 50 }, (_, i) =>
        makeKill(3000, 2100, 3000, Math.floor(i / 5), 75),
      );
      expect(calculateScore(kills)).toBeGreaterThanOrEqual(45);
      expect(calculateOverallAccuracy(kills)).toBeGreaterThanOrEqual(70);
    });
  });
});
