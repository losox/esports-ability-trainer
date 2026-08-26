/** 训练所需的成功反应次数（抢跑不计入消耗） */
export const REQUIRED_SUCCESS_COUNT = 8;

/** 假启动惩罚：每次假启动扣除的分数 */
export const FALSE_START_PENALTY = 50;

/** 参考分数：职业选手平均反应时间约150ms */
const PRO_REACTION_MS = 150;
/** 参考分数：高手平均反应时间约200ms */
const EXPERT_REACTION_MS = 200;
/** 参考分数：普通玩家平均反应时间约300ms */
const AVERAGE_REACTION_MS = 300;

/** 满分基准（反应时间达到PRO级别） */
const MAX_SCORE = 1000;

/**
 * 去除极端值：升序排序后去掉1个最高和1个最低。
 * 数组长度 <= 2 时直接返回原数组副本（无样本可去）。
 */
export function trimOutliers(times: number[]): number[] {
  if (times.length <= 2) return [...times];
  const sorted = [...times].sort((a, b) => a - b);
  return sorted.slice(1, -1);
}

/**
 * 计算分数。
 * @param successTimes 仅包含成功反应的正数数组（去极值后算平均）
 * @param falseStarts 假启动次数（独立惩罚，不再混入数组）
 */
export function calculateScore(successTimes: number[], falseStarts: number = 0): number {
  if (successTimes.length === 0) return 0;

  const trimmed = trimOutliers(successTimes);
  const avg = trimmed.reduce((sum, t) => sum + t, 0) / trimmed.length;
  const penalty = falseStarts * FALSE_START_PENALTY;

  let score: number;
  if (avg <= PRO_REACTION_MS) {
    score = MAX_SCORE;
  } else if (avg <= EXPERT_REACTION_MS) {
    const ratio = (avg - PRO_REACTION_MS) / (EXPERT_REACTION_MS - PRO_REACTION_MS);
    score = Math.round(MAX_SCORE - ratio * 200);
  } else if (avg <= AVERAGE_REACTION_MS) {
    const ratio = (avg - EXPERT_REACTION_MS) / (AVERAGE_REACTION_MS - EXPERT_REACTION_MS);
    score = Math.round(800 - ratio * 300);
  } else if (avg <= 500) {
    const ratio = (avg - AVERAGE_REACTION_MS) / (500 - AVERAGE_REACTION_MS);
    score = Math.round(500 - ratio * 300);
  } else {
    score = Math.max(0, Math.round(200 - (avg - 500) / 5));
  }

  return Math.max(0, score - penalty);
}

/**
 * 计算稳定性（标准差）。对去极端值后的成功反应数组计算。
 */
export function calculateConsistency(successTimes: number[]): number {
  const trimmed = trimOutliers(successTimes);
  if (trimmed.length < 2) return 0;

  const avg = trimmed.reduce((sum, t) => sum + t, 0) / trimmed.length;
  const variance = trimmed.reduce((sum, t) => sum + (t - avg) ** 2, 0) / trimmed.length;
  return Math.round(Math.sqrt(variance));
}

export function isFalseStart(clickTime: number, activationTime: number): boolean {
  return clickTime < activationTime;
}

export function generateWaitTime(): number {
  return 2000 + Math.random() * 2000;
}

export function calculateGrade(score: number): string {
  if (score >= 850) return 'S';
  if (score >= 700) return 'A';
  if (score >= 500) return 'B';
  if (score >= 300) return 'C';
  return 'D';
}

/**
 * 获取平均值（成功数组去极值后）。展示层用。
 */
export function getAverageTime(successTimes: number[]): number {
  if (successTimes.length === 0) return 0;
  const trimmed = trimOutliers(successTimes);
  if (trimmed.length === 0) return 0;
  return Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
}

/**
 * 获取最佳反应时间（取最小值后四舍五入到整数）。展示层用。
 */
export function getBestTime(successTimes: number[]): number {
  if (successTimes.length === 0) return 0;
  return Math.round(Math.min(...successTimes));
}
