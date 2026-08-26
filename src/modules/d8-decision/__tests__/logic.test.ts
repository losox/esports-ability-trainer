import { describe, it, expect } from 'vitest';
import {
  calculateScore,
  calculateBaseScore,
  calculateSpeedBonus,
  calculateFirstDecisionTime,
  calculateTotalDamage,
  calculateGrade,
  evaluateDecisionTime,
  getDifficultyMultiplier,
  getSimultaneousTargets,
  getCountdownDuration,
  getTargetMovement,
  getTypeMixComplexity,
  selectTargetType,
  generateTargetSpecs,
  generateRound,
  TARGET_SPECS,
  PLAYER_MAX_HP,
  MAX_SCORE,
  type RoundResult,
  type TargetType,
} from '../logic';

describe('D8 决策速度训练逻辑', () => {
  // === Difficulty progression ===

  describe('getDifficultyMultiplier', () => {
    it('round 1-3 should return 1.0', () => {
      expect(getDifficultyMultiplier(1)).toBe(1.0);
      expect(getDifficultyMultiplier(2)).toBe(1.0);
      expect(getDifficultyMultiplier(3)).toBe(1.0);
    });

    it('round 4-6 should return 1.2', () => {
      expect(getDifficultyMultiplier(4)).toBe(1.2);
      expect(getDifficultyMultiplier(5)).toBe(1.2);
      expect(getDifficultyMultiplier(6)).toBe(1.2);
    });

    it('round 7-9 should return 1.4', () => {
      expect(getDifficultyMultiplier(7)).toBe(1.4);
      expect(getDifficultyMultiplier(9)).toBe(1.4);
    });

    it('should increase by 0.2 every 3 rounds', () => {
      expect(getDifficultyMultiplier(10)).toBe(1.6);
      expect(getDifficultyMultiplier(13)).toBe(1.8);
    });
  });

  describe('getSimultaneousTargets', () => {
    it('round 1-3 should have 2 targets', () => {
      expect(getSimultaneousTargets(1)).toBe(2);
      expect(getSimultaneousTargets(3)).toBe(2);
    });

    it('round 4-6 should have 3 targets', () => {
      expect(getSimultaneousTargets(4)).toBe(3);
      expect(getSimultaneousTargets(6)).toBe(3);
    });

    it('should increase by 1 every 3 rounds', () => {
      expect(getSimultaneousTargets(7)).toBe(4);
      expect(getSimultaneousTargets(10)).toBe(5);
    });
  });

  describe('getCountdownDuration', () => {
    it('round 1-3 should be 5000ms', () => {
      expect(getCountdownDuration(1)).toBe(5000);
      expect(getCountdownDuration(3)).toBe(5000);
    });

    it('round 4-6 should be 4500ms', () => {
      expect(getCountdownDuration(4)).toBe(4500);
      expect(getCountdownDuration(6)).toBe(4500);
    });

    it('should decrease by 500ms every 3 rounds', () => {
      expect(getCountdownDuration(7)).toBe(4000);
      expect(getCountdownDuration(10)).toBe(3500);
    });

    it('should never go below 2000ms', () => {
      expect(getCountdownDuration(19)).toBe(2000);
      expect(getCountdownDuration(30)).toBe(2000);
      expect(getCountdownDuration(100)).toBe(2000);
    });
  });

  describe('getTargetMovement', () => {
    it('should be false for rounds 1-6', () => {
      expect(getTargetMovement(1)).toBe(false);
      expect(getTargetMovement(6)).toBe(false);
    });

    it('should be true for round 7+', () => {
      expect(getTargetMovement(7)).toBe(true);
      expect(getTargetMovement(10)).toBe(true);
    });
  });

  describe('getTypeMixComplexity', () => {
    it('round 1-2 should be complexity 0 (normal only)', () => {
      expect(getTypeMixComplexity(1)).toBe(0);
      expect(getTypeMixComplexity(2)).toBe(0);
    });

    it('round 3-5 should be complexity 1 (normal + high-attack)', () => {
      expect(getTypeMixComplexity(3)).toBe(1);
      expect(getTypeMixComplexity(5)).toBe(1);
    });

    it('round 6-8 should be complexity 2 (all three types)', () => {
      expect(getTypeMixComplexity(6)).toBe(2);
      expect(getTypeMixComplexity(8)).toBe(2);
    });

    it('round 9+ should be complexity 3 (complex mix)', () => {
      expect(getTypeMixComplexity(9)).toBe(3);
      expect(getTypeMixComplexity(20)).toBe(3);
    });
  });

  // === Target generation ===

  describe('selectTargetType', () => {
    it('complexity 0 should always return normal', () => {
      for (let i = 0; i < 10; i++) {
        expect(selectTargetType(0, i)).toBe('normal');
      }
    });

    it('complexity 1 should alternate normal and high-attack', () => {
      expect(selectTargetType(1, 0)).toBe('normal');
      expect(selectTargetType(1, 1)).toBe('high-attack');
      expect(selectTargetType(1, 2)).toBe('normal');
      expect(selectTargetType(1, 3)).toBe('high-attack');
    });

    it('complexity 2 should cycle through all three types', () => {
      expect(selectTargetType(2, 0)).toBe('normal');
      expect(selectTargetType(2, 1)).toBe('high-attack');
      expect(selectTargetType(2, 2)).toBe('tank');
      expect(selectTargetType(2, 3)).toBe('normal');
    });

    it('complexity 3 should include all types', () => {
      const types = new Set<TargetType>();
      for (let i = 0; i < 8; i++) {
        types.add(selectTargetType(3, i));
      }
      expect(types.has('normal')).toBe(true);
      expect(types.has('high-attack')).toBe(true);
      expect(types.has('tank')).toBe(true);
    });
  });

  describe('generateTargetSpecs', () => {
    it('should produce correct number of targets', () => {
      expect(generateTargetSpecs(1)).toHaveLength(2);
      expect(generateTargetSpecs(4)).toHaveLength(3);
      expect(generateTargetSpecs(7)).toHaveLength(4);
    });

    it('round 1 targets should all be normal type', () => {
      const specs = generateTargetSpecs(1);
      expect(specs.every((s) => s.type === 'normal')).toBe(true);
    });

    it('round 3 targets should include normal and high-attack', () => {
      const specs = generateTargetSpecs(3);
      const types = new Set(specs.map((s) => s.type));
      expect(types.has('normal')).toBe(true);
      expect(types.has('high-attack')).toBe(true);
    });

    it('round 6 targets should include all three types', () => {
      const specs = generateTargetSpecs(6);
      const types = new Set(specs.map((s) => s.type));
      expect(types.has('normal')).toBe(true);
      expect(types.has('high-attack')).toBe(true);
      expect(types.has('tank')).toBe(true);
    });

    it('specs should match TARGET_SPECS values', () => {
      const specs = generateTargetSpecs(6);
      for (const spec of specs) {
        const base = TARGET_SPECS[spec.type];
        expect(spec.hp).toBe(base.hp);
        expect(spec.attack).toBe(base.attack);
      }
    });
  });

  describe('generateRound', () => {
    it('should produce correct round config', () => {
      const config = generateRound(1);
      expect(config.round).toBe(1);
      expect(config.targets).toHaveLength(2);
      expect(config.countdownMs).toBe(5000);
      expect(config.hasMovement).toBe(false);
      expect(config.difficultyMultiplier).toBe(1.0);
    });

    it('round 7 should have movement', () => {
      const config = generateRound(7);
      expect(config.hasMovement).toBe(true);
      expect(config.targets).toHaveLength(4);
      expect(config.countdownMs).toBe(4000);
    });
  });

  // === Constants ===

  describe('TARGET_SPECS', () => {
    it('normal should have low HP and low attack', () => {
      expect(TARGET_SPECS.normal.hp).toBe(1);
      expect(TARGET_SPECS.normal.attack).toBe(5);
    });

    it('high-attack should have low HP and high attack', () => {
      expect(TARGET_SPECS['high-attack'].hp).toBe(1);
      expect(TARGET_SPECS['high-attack'].attack).toBe(20);
    });

    it('tank should have high HP and low attack', () => {
      expect(TARGET_SPECS.tank.hp).toBe(3);
      expect(TARGET_SPECS.tank.attack).toBe(5);
    });
  });

  // === Scoring ===

  describe('calculateSpeedBonus', () => {
    it('pro decision time should get max bonus', () => {
      expect(calculateSpeedBonus(250)).toBe(150);
      expect(calculateSpeedBonus(300)).toBe(150);
    });

    it('expert decision time should get partial bonus', () => {
      const bonus = calculateSpeedBonus(400);
      expect(bonus).toBeGreaterThan(80);
      expect(bonus).toBeLessThan(150);
    });

    it('average decision time should get small bonus', () => {
      const bonus = calculateSpeedBonus(700);
      expect(bonus).toBeGreaterThan(20);
      expect(bonus).toBeLessThan(80);
    });

    it('slow decision time should get minimal bonus', () => {
      const bonus = calculateSpeedBonus(1200);
      expect(bonus).toBeGreaterThanOrEqual(0);
      expect(bonus).toBeLessThan(20);
    });

    it('zero or negative time should return 0', () => {
      expect(calculateSpeedBonus(0)).toBe(0);
      expect(calculateSpeedBonus(-100)).toBe(0);
    });

    it('faster decision should yield higher bonus', () => {
      expect(calculateSpeedBonus(300)).toBeGreaterThan(calculateSpeedBonus(500));
      expect(calculateSpeedBonus(500)).toBeGreaterThan(calculateSpeedBonus(900));
    });
  });

  describe('calculateBaseScore', () => {
    it('zero rounds should return 0', () => {
      expect(calculateBaseScore(0)).toBe(0);
    });

    it('3 rounds should give base score with multiplier 1.0', () => {
      const score = calculateBaseScore(3);
      expect(score).toBe(150); // 50 * 1.0 * 3
    });

    it('6 rounds should include multiplier 1.2 for rounds 4-6', () => {
      const score = calculateBaseScore(6);
      // rounds 1-3: 50*1.0 = 150, rounds 4-6: 50*1.2 = 180
      expect(score).toBe(330);
    });

    it('more rounds should yield higher score', () => {
      expect(calculateBaseScore(10)).toBeGreaterThan(calculateBaseScore(5));
    });
  });

  describe('calculateFirstDecisionTime', () => {
    it('should return average of valid decision times', () => {
      const results: RoundResult[] = [
        {
          round: 1,
          survived: true,
          firstDecisionMs: 400,
          damageTaken: 0,
          targetsEliminated: 2,
          totalTargets: 2,
        },
        {
          round: 2,
          survived: true,
          firstDecisionMs: 600,
          damageTaken: 0,
          targetsEliminated: 2,
          totalTargets: 2,
        },
      ];
      expect(calculateFirstDecisionTime(results)).toBe(500);
    });

    it('should ignore null decision times', () => {
      const results: RoundResult[] = [
        {
          round: 1,
          survived: true,
          firstDecisionMs: null,
          damageTaken: 0,
          targetsEliminated: 2,
          totalTargets: 2,
        },
        {
          round: 2,
          survived: true,
          firstDecisionMs: 400,
          damageTaken: 0,
          targetsEliminated: 2,
          totalTargets: 2,
        },
      ];
      expect(calculateFirstDecisionTime(results)).toBe(400);
    });

    it('should return 0 for empty results', () => {
      expect(calculateFirstDecisionTime([])).toBe(0);
    });

    it('should return 0 when all decision times are null', () => {
      const results: RoundResult[] = [
        {
          round: 1,
          survived: true,
          firstDecisionMs: null,
          damageTaken: 0,
          targetsEliminated: 2,
          totalTargets: 2,
        },
      ];
      expect(calculateFirstDecisionTime(results)).toBe(0);
    });
  });

  describe('calculateTotalDamage', () => {
    it('should sum damage across all rounds', () => {
      const results: RoundResult[] = [
        {
          round: 1,
          survived: true,
          firstDecisionMs: 400,
          damageTaken: 10,
          targetsEliminated: 2,
          totalTargets: 2,
        },
        {
          round: 2,
          survived: true,
          firstDecisionMs: 500,
          damageTaken: 25,
          targetsEliminated: 2,
          totalTargets: 2,
        },
      ];
      expect(calculateTotalDamage(results)).toBe(35);
    });

    it('should return 0 for empty results', () => {
      expect(calculateTotalDamage([])).toBe(0);
    });
  });

  describe('calculateScore', () => {
    it('zero rounds should return 0', () => {
      expect(calculateScore(0, [])).toBe(0);
    });

    it('survived rounds with fast decisions should score higher', () => {
      const fastResults: RoundResult[] = [
        {
          round: 1,
          survived: true,
          firstDecisionMs: 300,
          damageTaken: 0,
          targetsEliminated: 2,
          totalTargets: 2,
        },
        {
          round: 2,
          survived: true,
          firstDecisionMs: 280,
          damageTaken: 0,
          targetsEliminated: 2,
          totalTargets: 2,
        },
        {
          round: 3,
          survived: true,
          firstDecisionMs: 320,
          damageTaken: 0,
          targetsEliminated: 2,
          totalTargets: 2,
        },
      ];
      const slowResults: RoundResult[] = [
        {
          round: 1,
          survived: true,
          firstDecisionMs: 900,
          damageTaken: 20,
          targetsEliminated: 2,
          totalTargets: 2,
        },
        {
          round: 2,
          survived: true,
          firstDecisionMs: 1000,
          damageTaken: 25,
          targetsEliminated: 2,
          totalTargets: 2,
        },
        {
          round: 3,
          survived: true,
          firstDecisionMs: 850,
          damageTaken: 30,
          targetsEliminated: 2,
          totalTargets: 2,
        },
      ];
      expect(calculateScore(3, fastResults)).toBeGreaterThan(calculateScore(3, slowResults));
    });

    it('should not exceed MAX_SCORE', () => {
      const results: RoundResult[] = Array.from({ length: 20 }, (_, i) => ({
        round: i + 1,
        survived: true,
        firstDecisionMs: 200,
        damageTaken: 0,
        targetsEliminated: 2,
        totalTargets: 2,
      }));
      expect(calculateScore(20, results)).toBeLessThanOrEqual(MAX_SCORE);
    });

    it('should not go below 0', () => {
      const results: RoundResult[] = [
        {
          round: 1,
          survived: true,
          firstDecisionMs: 2000,
          damageTaken: 90,
          targetsEliminated: 2,
          totalTargets: 2,
        },
      ];
      expect(calculateScore(1, results)).toBeGreaterThanOrEqual(0);
    });

    it('more survived rounds should yield higher score', () => {
      const results: RoundResult[] = Array.from({ length: 5 }, (_, i) => ({
        round: i + 1,
        survived: true,
        firstDecisionMs: 500,
        damageTaken: 10,
        targetsEliminated: 2,
        totalTargets: 2,
      }));
      const score5 = calculateScore(5, results);
      const score3 = calculateScore(3, results.slice(0, 3));
      expect(score5).toBeGreaterThan(score3);
    });
  });

  // === Evaluation ===

  describe('evaluateDecisionTime', () => {
    it('should return pro for time under 300ms', () => {
      expect(evaluateDecisionTime(200)).toBe('pro');
      expect(evaluateDecisionTime(300)).toBe('pro');
    });

    it('should return expert for time 300-500ms', () => {
      expect(evaluateDecisionTime(350)).toBe('expert');
      expect(evaluateDecisionTime(500)).toBe('expert');
    });

    it('should return average for time 500-900ms', () => {
      expect(evaluateDecisionTime(600)).toBe('average');
      expect(evaluateDecisionTime(900)).toBe('average');
    });

    it('should return slow for time over 900ms', () => {
      expect(evaluateDecisionTime(1000)).toBe('slow');
      expect(evaluateDecisionTime(2000)).toBe('slow');
    });
  });

  describe('calculateGrade', () => {
    it('score >= 850 should be S', () => {
      expect(calculateGrade(850)).toBe('S');
      expect(calculateGrade(1000)).toBe('S');
    });

    it('score 700-849 should be A', () => {
      expect(calculateGrade(700)).toBe('A');
      expect(calculateGrade(849)).toBe('A');
    });

    it('score 500-699 should be B', () => {
      expect(calculateGrade(500)).toBe('B');
      expect(calculateGrade(699)).toBe('B');
    });

    it('score 300-499 should be C', () => {
      expect(calculateGrade(300)).toBe('C');
      expect(calculateGrade(499)).toBe('C');
    });

    it('score < 300 should be D', () => {
      expect(calculateGrade(299)).toBe('D');
      expect(calculateGrade(0)).toBe('D');
    });
  });

  // === Constants sanity checks ===

  describe('Constants', () => {
    it('PLAYER_MAX_HP should be 100', () => {
      expect(PLAYER_MAX_HP).toBe(100);
    });

    it('MAX_SCORE should be 1000', () => {
      expect(MAX_SCORE).toBe(1000);
    });

    it('high-attack should have higher attack than normal', () => {
      expect(TARGET_SPECS['high-attack'].attack).toBeGreaterThan(TARGET_SPECS.normal.attack);
    });

    it('tank should have higher HP than normal', () => {
      expect(TARGET_SPECS.tank.hp).toBeGreaterThan(TARGET_SPECS.normal.hp);
    });
  });
});
