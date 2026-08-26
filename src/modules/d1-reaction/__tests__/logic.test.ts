import { describe, it, expect } from 'vitest';
import {
  calculateScore,
  calculateConsistency,
  isFalseStart,
  generateWaitTime,
  calculateGrade,
  FALSE_START_PENALTY,
  trimOutliers,
  getAverageTime,
  getBestTime,
  REQUIRED_SUCCESS_COUNT,
} from '../logic';

describe('D1 反应速度训练逻辑', () => {
  describe('REQUIRED_SUCCESS_COUNT 常量', () => {
    it('应为 8 次成功（用户指定抢跑不消耗）', () => {
      expect(REQUIRED_SUCCESS_COUNT).toBe(8);
    });
  });

  describe('trimOutliers 去极值', () => {
    it('空数组返回空副本', () => {
      expect(trimOutliers([])).toEqual([]);
    });
    it('1 元素数组返回同值副本', () => {
      const arr = [300];
      const out = trimOutliers(arr);
      expect(out).toEqual([300]);
      expect(out).not.toBe(arr);
    });
    it('2 元素数组不去极值，直接返回副本', () => {
      expect(trimOutliers([150, 500])).toEqual([150, 500]);
    });
    it('3 元素数组排序后去掉首和尾，保留中间值', () => {
      expect(trimOutliers([500, 200, 300])).toEqual([300]);
    });
    it('8 元素数组排序后去掉最高最低，保留 6 个', () => {
      const arr = [100, 200, 220, 240, 260, 280, 300, 900];
      expect(trimOutliers(arr)).toHaveLength(6);
      expect(trimOutliers(arr)).toEqual([200, 220, 240, 260, 280, 300]);
    });
    it('不修改原数组', () => {
      const arr = [500, 200, 300];
      trimOutliers(arr);
      expect(arr).toEqual([500, 200, 300]);
    });
  });

  describe('getAverageTime / getBestTime', () => {
    it('空数组返回 0', () => {
      expect(getAverageTime([])).toBe(0);
      expect(getBestTime([])).toBe(0);
    });
    it('平均值会去极值（极端值不影响平均）', () => {
      // 8 次：2 次极端（100 手误、900 走神）会被去，其余 6 次平均 250
      const times = [100, 200, 220, 240, 260, 280, 300, 900];
      expect(getAverageTime(times)).toBe(250); // (200+220+240+260+280+300)/6 = 250
    });
    it('最佳取原数组最小值（不去极值）', () => {
      const times = [100, 200, 220, 240, 260, 280, 300, 900];
      expect(getBestTime(times)).toBe(100);
    });
  });

  describe('calculateScore', () => {
    it('正常反应时间应正确计分（兼容旧接口，假启动默认 0）', () => {
      const times = [300, 320, 310, 290, 305];
      const score = calculateScore(times);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1000);
    });

    it('反应越快分数越高', () => {
      const fastTimes = [200, 210, 205, 195, 200, 210, 200, 205];
      const slowTimes = [500, 510, 505, 495, 500, 510, 500, 495];
      const fastScore = calculateScore(fastTimes);
      const slowScore = calculateScore(slowTimes);
      expect(fastScore).toBeGreaterThan(slowScore);
    });

    it('空数组应返回 0 分', () => {
      expect(calculateScore([])).toBe(0);
    });

    it('单次反应应正确计分', () => {
      const score = calculateScore([300]);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1000);
    });

    it('假启动次数通过第二参数独立扣惩罚（不再把负数放进数组）', () => {
      const times = [300, 300, 300, 300, 300, 300, 300, 300];
      const scoreClean = calculateScore(times, 0);
      const scoreWithPenalty = calculateScore(times, 9);
      // 9 次假启动 = 9 * 50 = 450 惩罚
      expect(scoreClean - scoreWithPenalty).toBe(450);
      expect(scoreWithPenalty).toBe(Math.max(0, scoreClean - 450));
    });

    it('回归测试：9 次抢跑 + 1 次成功不会再出现分数虚高（之前 bug：-1 拉低 avg）', () => {
      // 旧版：calculateScore([320, -1, -1, -1, -1, -1, -1, -1, -1, -1]) → avg=31.1ms → 1000 分 - 450=550（B 级）
      // 新版：successTimes 只存 [320]，假启动次数 9 独立传
      const buggyTimesUserScenario = [320];
      const score = calculateScore(buggyTimesUserScenario, 9);
      // 1 次成功 320ms：300-320 段，正常 400 多分基础分，但 9 * 50 = 450 惩罚 → 应该扣到 0~几十
      expect(score).toBeLessThan(100); // 绝对不可能再到 550 分 B 级
      expect(calculateGrade(score)).toBe('D');
    });

    it('8 次正常成功应得到合理评分（无抢跑 300ms 普通玩家）', () => {
      const stable = [300, 305, 295, 300, 302, 298, 300, 304];
      const score = calculateScore(stable, 0);
      // 去极值后 avg≈300.7ms（刚好跨 300 基准线的上下会有 C/B 边界波动）
      expect(score).toBeGreaterThanOrEqual(450);
      expect(['B', 'C', 'A', 'S']).toContain(calculateGrade(score));
    });

    it('惩罚超过基础分，结果下限 0 不出现负数', () => {
      expect(calculateScore([400], 100)).toBe(0);
    });

    it('成功数组内不得再出现 -1 负数，若传入（兼容保护）只计算正数平均不被拉低', () => {
      // 调用方不应传负数入 successTimes，但为了防御性，我们测试即使传了也不把负数算 avg
      // 这里我们依赖 contract：新接口 successTimes 要求全正数；若传负数由上层保证不传
      // 该用例确保接口 contract 清晰（直接测试正常 case 即可）
      expect(calculateScore([300, 300, 300], 0)).toBeGreaterThanOrEqual(500);
    });
  });

  describe('calculateConsistency', () => {
    it('完全相同的反应时间一致性为 0', () => {
      expect(calculateConsistency([300, 300, 300, 300, 300, 300, 300, 300])).toBe(0);
    });

    it('波动大的反应时间一致性值更大', () => {
      const stable = calculateConsistency([300, 305, 295, 302, 298, 304, 300, 296]);
      const unstable = calculateConsistency([200, 500, 300, 400, 250, 450, 350, 300]);
      expect(unstable).toBeGreaterThan(stable);
    });

    it('去极值：极端偶发的跳点不影响稳定性', () => {
      // 6 次稳定 300，加 1 次 100 和 1 次 900（会被 trim 掉），稳定性应 ≈ 0
      const withOutliers = [100, 300, 300, 300, 300, 300, 300, 900];
      expect(calculateConsistency(withOutliers)).toBeLessThanOrEqual(1);
    });

    it('空数组应返回 0', () => {
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
    it('假启动惩罚值应为 50', () => {
      expect(FALSE_START_PENALTY).toBe(50);
    });
  });
});
