import { describe, it, expect } from 'vitest';
import {
  calculateScore,
  calculateConsistency,
  isFalseStart,
  generateWaitTime,
  calculateGrade,
  FALSE_START_PENALTY,
} from '../logic';

describe('D1 反应速度训练逻辑', () => {
  describe('calculateScore', () => {
    it('正常反应时间应正确计分', () => {
      const times = [300, 320, 310, 290, 305];
      const score = calculateScore(times);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1000);
    });

    it('反应越快分数越高', () => {
      const fastTimes = [200, 210, 205, 195, 200];
      const slowTimes = [500, 510, 505, 495, 500];
      const fastScore = calculateScore(fastTimes);
      const slowScore = calculateScore(slowTimes);
      expect(fastScore).toBeGreaterThan(slowScore);
    });

    it('空数组应返回0分', () => {
      expect(calculateScore([])).toBe(0);
    });

    it('单次反应应正确计分', () => {
      const score = calculateScore([300]);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1000);
    });
  });

  describe('calculateConsistency', () => {
    it('完全相同的反应时间一致性为0', () => {
      expect(calculateConsistency([300, 300, 300, 300])).toBe(0);
    });

    it('波动大的反应时间一致性值更大', () => {
      const stable = calculateConsistency([300, 305, 295, 302]);
      const unstable = calculateConsistency([200, 500, 300, 400]);
      expect(unstable).toBeGreaterThan(stable);
    });

    it('空数组应返回0', () => {
      expect(calculateConsistency([])).toBe(0);
    });
  });

  describe('isFalseStart', () => {
    it('在激活前点击应判为假启动', () => {
      expect(isFalseStart(1000, 2000)).toBe(true);
    });

    it('在激活后点击不应该是假启动', () => {
      expect(isFalseStart(2100, 2000)).toBe(false);
    });

    it('恰好在激活时间点击不是假启动', () => {
      expect(isFalseStart(2000, 2000)).toBe(false);
    });
  });

  describe('generateWaitTime', () => {
    it('应生成2000-4000ms之间的等待时间', () => {
      for (let i = 0; i < 100; i++) {
        const wait = generateWaitTime();
        expect(wait).toBeGreaterThanOrEqual(2000);
        expect(wait).toBeLessThanOrEqual(4000);
      }
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

  describe('FALSE_START_PENALTY', () => {
    it('假启动惩罚值应大于0', () => {
      expect(FALSE_START_PENALTY).toBeGreaterThan(0);
    });
  });
});
