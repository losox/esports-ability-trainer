import { describe, it, expect } from 'vitest';
import {
  calculateScore,
  calculateEdgeDetectionRate,
  calculateEdgeReactionTime,
  getDifficultyLevel,
  getDifficultyParams,
  shouldGameOver,
  calculateGrade,
  calculateCapacityLevel,
  generateEdgeAngle,
  generateSpawnAngle,
  MAX_MISSES,
  type PeripheralStats,
} from '../logic';

describe('D4 外围视觉训练逻辑', () => {
  describe('calculateScore', () => {
    it('应正确计算基础得分', () => {
      const stats: PeripheralStats = {
        centerHits: 10,
        edgeHits: 5,
        edgeAppearances: 10,
        misses: 0,
        maxSimultaneous: 2,
        edgeReactionTimes: [],
      };
      const score = calculateScore(stats);
      expect(score).toBeGreaterThan(0);
    });

    it('边缘命中越多分数越高', () => {
      const lowEdge: PeripheralStats = {
        centerHits: 10,
        edgeHits: 0,
        edgeAppearances: 10,
        misses: 0,
        maxSimultaneous: 1,
        edgeReactionTimes: [],
      };
      const highEdge: PeripheralStats = {
        centerHits: 10,
        edgeHits: 8,
        edgeAppearances: 10,
        misses: 0,
        maxSimultaneous: 1,
        edgeReactionTimes: [],
      };
      expect(calculateScore(highEdge)).toBeGreaterThan(calculateScore(lowEdge));
    });

    it('同时处理能力越高分数越高', () => {
      const lowSim: PeripheralStats = {
        centerHits: 5,
        edgeHits: 5,
        edgeAppearances: 10,
        misses: 0,
        maxSimultaneous: 1,
        edgeReactionTimes: [],
      };
      const highSim: PeripheralStats = {
        centerHits: 5,
        edgeHits: 5,
        edgeAppearances: 10,
        misses: 0,
        maxSimultaneous: 5,
        edgeReactionTimes: [],
      };
      expect(calculateScore(highSim)).toBeGreaterThan(calculateScore(lowSim));
    });

    it('零命中应返回0分', () => {
      const stats: PeripheralStats = {
        centerHits: 0,
        edgeHits: 0,
        edgeAppearances: 0,
        misses: 0,
        maxSimultaneous: 0,
        edgeReactionTimes: [],
      };
      expect(calculateScore(stats)).toBe(0);
    });
  });

  describe('calculateEdgeDetectionRate', () => {
    it('应正确计算检测率', () => {
      expect(calculateEdgeDetectionRate(5, 10)).toBe(0.5);
    });

    it('全命中应返回1', () => {
      expect(calculateEdgeDetectionRate(10, 10)).toBe(1);
    });

    it('零出现应返回0', () => {
      expect(calculateEdgeDetectionRate(0, 0)).toBe(0);
    });

    it('命中超过出现数应封顶为1', () => {
      expect(calculateEdgeDetectionRate(15, 10)).toBe(1);
    });
  });

  describe('calculateEdgeReactionTime', () => {
    it('应计算平均反应时间', () => {
      expect(calculateEdgeReactionTime([300, 400, 500])).toBe(400);
    });

    it('空数组应返回0', () => {
      expect(calculateEdgeReactionTime([])).toBe(0);
    });

    it('单个反应时间应正确返回', () => {
      expect(calculateEdgeReactionTime([350])).toBe(350);
    });
  });

  describe('getDifficultyLevel', () => {
    it('0次消除应为等级1', () => {
      expect(getDifficultyLevel(0)).toBe(1);
    });

    it('8次消除应为等级2', () => {
      expect(getDifficultyLevel(8)).toBe(2);
    });

    it('16次消除应为等级3', () => {
      expect(getDifficultyLevel(16)).toBe(3);
    });

    it('等级应随消除数递增', () => {
      expect(getDifficultyLevel(20)).toBeGreaterThan(getDifficultyLevel(5));
    });
  });

  describe('getDifficultyParams', () => {
    it('等级越高间隔越短', () => {
      const low = getDifficultyParams(1);
      const high = getDifficultyParams(5);
      expect(high.centerInterval).toBeLessThan(low.centerInterval);
      expect(high.edgeInterval).toBeLessThan(low.edgeInterval);
    });

    it('等级越高边缘存在时间越短', () => {
      const low = getDifficultyParams(1);
      const high = getDifficultyParams(5);
      expect(high.edgeLifetime).toBeLessThan(low.edgeLifetime);
    });

    it('等级1应返回初始参数', () => {
      const params = getDifficultyParams(1);
      expect(params.centerInterval).toBe(2000);
      expect(params.edgeLifetime).toBe(2500);
      expect(params.edgeInterval).toBe(3000);
      expect(params.maxSimultaneous).toBe(1);
    });

    it('超过最大等级应封顶', () => {
      const params = getDifficultyParams(100);
      expect(params.centerInterval).toBeGreaterThanOrEqual(600);
      expect(params.edgeLifetime).toBeGreaterThanOrEqual(700);
    });

    it('低于1的等级应被钳制为1', () => {
      const params = getDifficultyParams(-1);
      expect(params.centerInterval).toBe(2000);
    });
  });

  describe('shouldGameOver', () => {
    it('miss达到上限应返回true', () => {
      expect(shouldGameOver(MAX_MISSES)).toBe(true);
    });

    it('miss未达到上限应返回false', () => {
      expect(shouldGameOver(0)).toBe(false);
      expect(shouldGameOver(1)).toBe(false);
      expect(shouldGameOver(2)).toBe(false);
    });

    it('超过上限应返回true', () => {
      expect(shouldGameOver(5)).toBe(true);
    });
  });

  describe('calculateGrade', () => {
    it('高分应返回S级', () => {
      expect(calculateGrade(900)).toBe('S');
    });

    it('中高分应返回A级', () => {
      expect(calculateGrade(750)).toBe('A');
    });

    it('中分应返回B级', () => {
      expect(calculateGrade(550)).toBe('B');
    });

    it('低分应返回C级', () => {
      expect(calculateGrade(350)).toBe('C');
    });

    it('极低分应返回D级', () => {
      expect(calculateGrade(100)).toBe('D');
    });
  });

  describe('calculateCapacityLevel', () => {
    it('高检测率+高同时处理应返回pro', () => {
      expect(calculateCapacityLevel(0.95, 6)).toBe('pro');
    });

    it('中高检测率+中同时处理应返回expert', () => {
      expect(calculateCapacityLevel(0.8, 4)).toBe('expert');
    });

    it('中等检测率应返回average', () => {
      expect(calculateCapacityLevel(0.55, 2)).toBe('average');
    });

    it('低检测率应返回beginner', () => {
      expect(calculateCapacityLevel(0.2, 1)).toBe('beginner');
    });
  });

  describe('generateEdgeAngle', () => {
    it('应生成0到2pi之间的角度', () => {
      for (let i = 0; i < 100; i++) {
        const angle = generateEdgeAngle();
        expect(angle).toBeGreaterThanOrEqual(0);
        expect(angle).toBeLessThan(Math.PI * 2);
      }
    });
  });

  describe('generateSpawnAngle', () => {
    it('应生成0到2pi之间的角度', () => {
      for (let i = 0; i < 100; i++) {
        const angle = generateSpawnAngle();
        expect(angle).toBeGreaterThanOrEqual(0);
        expect(angle).toBeLessThan(Math.PI * 2);
      }
    });
  });

  describe('MAX_MISSES', () => {
    it('应为3', () => {
      expect(MAX_MISSES).toBe(3);
    });
  });
});
