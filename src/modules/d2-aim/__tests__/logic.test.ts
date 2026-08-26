import { describe, it, expect } from 'vitest';
import {
  calculateHitScore,
  calculateScore,
  calculateHeadshotRate,
  calculateAvgAimTime,
  calculateHitMissRatio,
  calculateGrade,
  getDifficultyLevel,
  getTargetDistance,
  getExistenceTime,
  getTargetAngleRange,
  determineHitZone,
  MAX_MISSES,
  TARGETS_PER_LEVEL,
  type HitResult,
} from '../logic';

function makeHit(
  zone: HitResult['zone'],
  distance: number,
  aimTimeMs: number,
  targetIndex: number,
): HitResult {
  return { zone, distance, aimTimeMs, targetIndex };
}

describe('D2 Aiming Precision logic', () => {
  describe('calculateHitScore', () => {
    it('head shot scores higher than body shot', () => {
      const head = calculateHitScore(makeHit('head', 8, 500, 0));
      const body = calculateHitScore(makeHit('body', 8, 500, 0));
      expect(head).toBeGreaterThan(body);
    });

    it('body shot scores higher than graze', () => {
      const body = calculateHitScore(makeHit('body', 8, 500, 0));
      const graze = calculateHitScore(makeHit('graze', 8, 500, 0));
      expect(body).toBeGreaterThan(graze);
    });

    it('miss scores zero', () => {
      expect(calculateHitScore(makeHit('miss', 8, 500, 0))).toBe(0);
    });

    it('farther targets are worth more', () => {
      const near = calculateHitScore(makeHit('head', 8, 500, 0));
      const far = calculateHitScore(makeHit('head', 16, 500, 5));
      expect(far).toBeGreaterThan(near);
    });

    it('distance multiplier caps at 2x', () => {
      const far = calculateHitScore(makeHit('head', 100, 500, 0));
      const expected = 50 * 2;
      expect(far).toBe(expected);
    });
  });

  describe('calculateScore', () => {
    it('sums all hit scores', () => {
      const hits = [
        makeHit('head', 8, 500, 0),
        makeHit('body', 10, 600, 1),
        makeHit('graze', 12, 700, 2),
      ];
      const expected = hits.reduce((s, h) => s + calculateHitScore(h), 0);
      expect(calculateScore(hits)).toBe(expected);
    });

    it('empty hits returns 0', () => {
      expect(calculateScore([])).toBe(0);
    });

    it('miss hits contribute 0', () => {
      const withMiss = calculateScore([makeHit('head', 8, 500, 0), makeHit('miss', 8, 0, 1)]);
      const withoutMiss = calculateScore([makeHit('head', 8, 500, 0)]);
      expect(withMiss).toBe(withoutMiss);
    });
  });

  describe('calculateHeadshotRate', () => {
    it('calculates percentage of headshots', () => {
      const hits = [
        makeHit('head', 8, 500, 0),
        makeHit('body', 8, 500, 1),
        makeHit('head', 8, 500, 2),
        makeHit('body', 8, 500, 3),
      ];
      expect(calculateHeadshotRate(hits)).toBe(50);
    });

    it('all headshots returns 100', () => {
      const hits = [makeHit('head', 8, 500, 0), makeHit('head', 8, 500, 1)];
      expect(calculateHeadshotRate(hits)).toBe(100);
    });

    it('no headshots returns 0', () => {
      const hits = [makeHit('body', 8, 500, 0), makeHit('graze', 8, 500, 1)];
      expect(calculateHeadshotRate(hits)).toBe(0);
    });

    it('empty hits returns 0', () => {
      expect(calculateHeadshotRate([])).toBe(0);
    });
  });

  describe('calculateAvgAimTime', () => {
    it('calculates average of valid aim times', () => {
      const hits = [
        makeHit('head', 8, 400, 0),
        makeHit('body', 8, 600, 1),
        makeHit('head', 8, 500, 2),
      ];
      expect(calculateAvgAimTime(hits)).toBe(500);
    });

    it('ignores hits with zero aim time', () => {
      const hits = [
        makeHit('head', 8, 400, 0),
        makeHit('miss', 8, 0, 1),
        makeHit('body', 8, 600, 2),
      ];
      expect(calculateAvgAimTime(hits)).toBe(500);
    });

    it('empty hits returns 0', () => {
      expect(calculateAvgAimTime([])).toBe(0);
    });
  });

  describe('calculateHitMissRatio', () => {
    it('calculates ratio correctly', () => {
      expect(calculateHitMissRatio([], 0)).toBe(0);
      expect(calculateHitMissRatio([makeHit('head', 8, 500, 0)], 0)).toBe(1);
      expect(calculateHitMissRatio([makeHit('head', 8, 500, 0)], 1)).toBe(0.5);
      expect(calculateHitMissRatio([makeHit('head', 8, 500, 0)], 3)).toBe(0.25);
    });

    it('zero hits zero misses returns 0', () => {
      expect(calculateHitMissRatio([], 0)).toBe(0);
    });
  });

  describe('calculateGrade', () => {
    it('returns S for pro-level score', () => {
      expect(calculateGrade(850)).toBe('S');
    });

    it('returns A for expert-level score', () => {
      expect(calculateGrade(650)).toBe('A');
    });

    it('returns B for average-level score', () => {
      expect(calculateGrade(400)).toBe('B');
    });

    it('returns C for low score', () => {
      expect(calculateGrade(200)).toBe('C');
    });

    it('returns D for very low score', () => {
      expect(calculateGrade(50)).toBe('D');
    });
  });

  describe('getDifficultyLevel', () => {
    it('returns 0 for first 5 targets', () => {
      expect(getDifficultyLevel(0)).toBe(0);
      expect(getDifficultyLevel(4)).toBe(0);
    });

    it('returns 1 for targets 5-9', () => {
      expect(getDifficultyLevel(5)).toBe(1);
      expect(getDifficultyLevel(9)).toBe(1);
    });

    it('returns 2 for targets 10-14', () => {
      expect(getDifficultyLevel(10)).toBe(2);
      expect(getDifficultyLevel(14)).toBe(2);
    });
  });

  describe('getTargetDistance', () => {
    it('starts at base distance', () => {
      expect(getTargetDistance(0)).toBe(8);
    });

    it('increases with level', () => {
      expect(getTargetDistance(1)).toBeGreaterThan(8);
      expect(getTargetDistance(3)).toBeGreaterThan(getTargetDistance(1));
    });

    it('caps at max distance', () => {
      expect(getTargetDistance(100)).toBeLessThanOrEqual(22);
    });
  });

  describe('getExistenceTime', () => {
    it('starts at 3000ms', () => {
      expect(getExistenceTime(0)).toBe(3000);
    });

    it('decreases by 200ms per level', () => {
      expect(getExistenceTime(1)).toBe(2800);
      expect(getExistenceTime(2)).toBe(2600);
    });

    it('does not go below minimum', () => {
      expect(getExistenceTime(100)).toBeGreaterThanOrEqual(800);
    });
  });

  describe('getTargetAngleRange', () => {
    it('starts at 15 degrees', () => {
      expect(getTargetAngleRange(0)).toBe(15);
    });

    it('increases with level', () => {
      expect(getTargetAngleRange(1)).toBe(25);
      expect(getTargetAngleRange(2)).toBe(35);
    });

    it('caps at 90 degrees', () => {
      expect(getTargetAngleRange(100)).toBeLessThanOrEqual(90);
    });
  });

  describe('determineHitZone', () => {
    it('returns head for head zone', () => {
      expect(determineHitZone('head', 0, 0.25)).toBe('head');
    });

    it('returns body for center body hit', () => {
      expect(determineHitZone('body', 0.1, 0.25)).toBe('body');
    });

    it('returns graze for edge body hit', () => {
      expect(determineHitZone('body', 0.22, 0.25)).toBe('graze');
    });

    it('returns miss for unknown zone', () => {
      expect(determineHitZone('unknown', 0, 0.25)).toBe('miss');
    });
  });

  describe('MAX_MISSES', () => {
    it('is 3', () => {
      expect(MAX_MISSES).toBe(3);
    });
  });

  describe('TARGETS_PER_LEVEL', () => {
    it('is 5', () => {
      expect(TARGETS_PER_LEVEL).toBe(5);
    });
  });

  describe('reference score ranges', () => {
    it('average player (10 body hits at base distance) scores 300-500', () => {
      const hits = Array.from({ length: 10 }, (_, i) => makeHit('body', 8, 600, i));
      const score = calculateScore(hits);
      expect(score).toBeGreaterThanOrEqual(300);
      expect(score).toBeLessThanOrEqual(500);
    });

    it('expert player (15 head + 5 body at varied distances) scores 600-750', () => {
      const hits = [
        ...Array.from({ length: 15 }, (_, i) => makeHit('head', 8 + i * 0.5, 400, i)),
        ...Array.from({ length: 5 }, (_, i) => makeHit('body', 10 + i * 0.5, 500, 15 + i)),
      ];
      const score = calculateScore(hits);
      expect(score).toBeGreaterThanOrEqual(600);
    });

    it('pro player (25 head hits at far distances) scores 800+', () => {
      const hits = Array.from({ length: 25 }, (_, i) =>
        makeHit('head', 12 + (i % 5) * 1.5, 300, i),
      );
      const score = calculateScore(hits);
      expect(score).toBeGreaterThanOrEqual(800);
    });
  });
});
