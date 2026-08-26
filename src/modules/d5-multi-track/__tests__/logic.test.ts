import { describe, it, expect } from 'vitest';
import {
  calculateScore,
  calculateSwitchTime,
  getDifficultyLevel,
  getDifficultyParams,
  shouldGameOver,
  calculateGrade,
  calculateTrackingLevel,
  calculateTrackingCapacity,
  generateMoveAngle,
  generateCurveAngularSpeed,
  MAX_ESCAPES,
  type TrackingStats,
} from '../logic';

describe('D5 多目标追踪训练逻辑', () => {
  describe('calculateScore', () => {
    it('应正确计算基础得分', () => {
      const stats: TrackingStats = {
        eliminated: 10,
        escapes: 0,
        noEscapeWaves: 2,
        switchTimes: [],
      };
      const score = calculateScore(stats);
      expect(score).toBe(10 * 15 + 2 * 50);
    });

    it('无逃脱波次越多分数越高', () => {
      const lowWaves: TrackingStats = {
        eliminated: 10,
        escapes: 0,
        noEscapeWaves: 0,
        switchTimes: [],
      };
      const highWaves: TrackingStats = {
        eliminated: 10,
        escapes: 0,
        noEscapeWaves: 5,
        switchTimes: [],
      };
      expect(calculateScore(highWaves)).toBeGreaterThan(calculateScore(lowWaves));
    });

    it('零消除应返回0分', () => {
      const stats: TrackingStats = {
        eliminated: 0,
        escapes: 0,
        noEscapeWaves: 0,
        switchTimes: [],
      };
      expect(calculateScore(stats)).toBe(0);
    });
  });

  describe('calculateSwitchTime', () => {
    it('应计算平均切换时间', () => {
      expect(calculateSwitchTime([300, 400, 500])).toBe(400);
    });

    it('空数组应返回0', () => {
      expect(calculateSwitchTime([])).toBe(0);
    });

    it('单个切换时间应正确返回', () => {
      expect(calculateSwitchTime([350])).toBe(350);
    });
  });

  describe('getDifficultyLevel', () => {
    it('0次消除应为等级1', () => {
      expect(getDifficultyLevel(0)).toBe(1);
    });

    it('5次消除应为等级2', () => {
      expect(getDifficultyLevel(5)).toBe(2);
    });

    it('10次消除应为等级3', () => {
      expect(getDifficultyLevel(10)).toBe(3);
    });

    it('等级应随消除数递增', () => {
      expect(getDifficultyLevel(20)).toBeGreaterThan(getDifficultyLevel(5));
    });
  });

  describe('getDifficultyParams', () => {
    it('等级1应返回初始参数', () => {
      const params = getDifficultyParams(1);
      expect(params.simultaneousTargets).toBe(3);
      expect(params.moveSpeed).toBe(1.0);
      expect(params.survivalTime).toBe(10);
      expect(params.movePattern).toBe('straight');
    });

    it('等级越高同时目标数越多', () => {
      const low = getDifficultyParams(1);
      const high = getDifficultyParams(5);
      expect(high.simultaneousTargets).toBeGreaterThan(low.simultaneousTargets);
    });

    it('等级越高移动速度越快', () => {
      const low = getDifficultyParams(1);
      const high = getDifficultyParams(5);
      expect(high.moveSpeed).toBeGreaterThan(low.moveSpeed);
    });

    it('等级越高存活时间越短', () => {
      const low = getDifficultyParams(1);
      const high = getDifficultyParams(5);
      expect(high.survivalTime).toBeLessThan(low.survivalTime);
    });

    it('运动模式应随等级变化', () => {
      expect(getDifficultyParams(1).movePattern).toBe('straight');
      expect(getDifficultyParams(3).movePattern).toBe('curve');
      expect(getDifficultyParams(6).movePattern).toBe('random');
    });

    it('超过最大等级应封顶', () => {
      const params = getDifficultyParams(100);
      expect(params.simultaneousTargets).toBeLessThanOrEqual(12);
      expect(params.survivalTime).toBeGreaterThanOrEqual(4);
    });

    it('低于1的等级应被钳制为1', () => {
      const params = getDifficultyParams(-1);
      expect(params.simultaneousTargets).toBe(3);
    });
  });

  describe('shouldGameOver', () => {
    it('逃脱达到上限应返回true', () => {
      expect(shouldGameOver(MAX_ESCAPES)).toBe(true);
    });

    it('逃脱未达到上限应返回false', () => {
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

  describe('calculateTrackingLevel', () => {
    it('快切换+多无逃脱波次应返回pro', () => {
      expect(calculateTrackingLevel(450, 6)).toBe('pro');
    });

    it('中快切换+中等无逃脱波次应返回expert', () => {
      expect(calculateTrackingLevel(800, 4)).toBe('expert');
    });

    it('中等切换应返回average', () => {
      expect(calculateTrackingLevel(1300, 2)).toBe('average');
    });

    it('慢切换应返回beginner', () => {
      expect(calculateTrackingLevel(2000, 1)).toBe('beginner');
    });

    it('零切换时间应返回beginner', () => {
      expect(calculateTrackingLevel(0, 0)).toBe('beginner');
    });
  });

  describe('calculateTrackingCapacity', () => {
    it('高消除率应返回高容量', () => {
      const high = calculateTrackingCapacity(20, 1);
      const low = calculateTrackingCapacity(10, 10);
      expect(high).toBeGreaterThan(low);
    });

    it('零总目标应返回0', () => {
      expect(calculateTrackingCapacity(0, 0)).toBe(0);
    });

    it('全消除应返回接近1的容量', () => {
      expect(calculateTrackingCapacity(10, 0)).toBe(1.0);
    });

    it('半消除应返回0.5容量', () => {
      expect(calculateTrackingCapacity(5, 5)).toBe(0.5);
    });
  });

  describe('generateMoveAngle', () => {
    it('应生成0到2pi之间的角度', () => {
      for (let i = 0; i < 100; i++) {
        const angle = generateMoveAngle();
        expect(angle).toBeGreaterThanOrEqual(0);
        expect(angle).toBeLessThan(Math.PI * 2);
      }
    });
  });

  describe('generateCurveAngularSpeed', () => {
    it('应生成-1到1之间的角速度', () => {
      for (let i = 0; i < 100; i++) {
        const speed = generateCurveAngularSpeed();
        expect(speed).toBeGreaterThan(-1);
        expect(speed).toBeLessThan(1);
      }
    });
  });

  describe('MAX_ESCAPES', () => {
    it('应为3', () => {
      expect(MAX_ESCAPES).toBe(3);
    });
  });
});
