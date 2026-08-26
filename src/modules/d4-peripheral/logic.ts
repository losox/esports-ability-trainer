/** 最大miss次数，达到则游戏结束 */
export const MAX_MISSES = 3;

/** 中央目标分数 */
const CENTER_TARGET_SCORE = 10;
/** 边缘目标分数 */
const EDGE_TARGET_SCORE = 30;
/** 满分基准 */
export const MAX_SCORE = 1000;

/** 参考分数：职业选手边缘检测率约90% */
const PRO_EDGE_RATE = 0.9;
/** 参考分数：高手边缘检测率约75% */
const EXPERT_EDGE_RATE = 0.75;
/** 参考分数：普通玩家边缘检测率约50% */
const AVERAGE_EDGE_RATE = 0.5;

/** 难度参数接口 */
export interface DifficultyParams {
  /** 中央目标间隔（ms） */
  centerInterval: number;
  /** 边缘目标存在时间（ms） */
  edgeLifetime: number;
  /** 边缘目标间隔（ms） */
  edgeInterval: number;
  /** 最大同时目标数 */
  maxSimultaneous: number;
}

/** 外围视觉训练统计 */
export interface PeripheralStats {
  centerHits: number;
  edgeHits: number;
  edgeAppearances: number;
  misses: number;
  maxSimultaneous: number;
  edgeReactionTimes: number[];
}

/** 计算总得分 */
export function calculateScore(stats: PeripheralStats): number {
  const base = stats.centerHits * CENTER_TARGET_SCORE + stats.edgeHits * EDGE_TARGET_SCORE;
  const edgeBonus = calculateEdgeDetectionRate(stats.edgeHits, stats.edgeAppearances) * 200;
  const simultaneousBonus = stats.maxSimultaneous * 25;
  return Math.round(base + edgeBonus + simultaneousBonus);
}

/** 计算边缘检测率（0-1） */
export function calculateEdgeDetectionRate(edgeHits: number, edgeAppearances: number): number {
  if (edgeAppearances === 0) return 0;
  return Math.min(1, edgeHits / edgeAppearances);
}

/** 计算边缘平均反应时间（ms） */
export function calculateEdgeReactionTime(reactionTimes: number[]): number {
  if (reactionTimes.length === 0) return 0;
  const sum = reactionTimes.reduce((acc, t) => acc + t, 0);
  return Math.round(sum / reactionTimes.length);
}

/** 根据已消除目标数获取当前难度等级 */
export function getDifficultyLevel(eliminated: number): number {
  return Math.floor(eliminated / 8) + 1;
}

/** 根据难度等级获取参数 */
export function getDifficultyParams(level: number): DifficultyParams {
  const clampedLevel = Math.max(1, Math.min(10, level));
  return {
    centerInterval: Math.max(600, 2000 - (clampedLevel - 1) * 160),
    edgeLifetime: Math.max(700, 2500 - (clampedLevel - 1) * 200),
    edgeInterval: Math.max(800, 3000 - (clampedLevel - 1) * 250),
    maxSimultaneous: Math.min(6, 1 + Math.floor((clampedLevel - 1) / 2)),
  };
}

/** 判断是否游戏结束 */
export function shouldGameOver(misses: number): boolean {
  return misses >= MAX_MISSES;
}

/** 计算评级 */
export function calculateGrade(score: number): string {
  if (score >= 850) return 'S';
  if (score >= 700) return 'A';
  if (score >= 500) return 'B';
  if (score >= 300) return 'C';
  return 'D';
}

/** 计算能力等级（基于边缘检测率） */
export function calculateCapacityLevel(edgeRate: number, maxSimultaneous: number): string {
  if (edgeRate >= PRO_EDGE_RATE && maxSimultaneous >= 5) return 'pro';
  if (edgeRate >= EXPERT_EDGE_RATE && maxSimultaneous >= 3) return 'expert';
  if (edgeRate >= AVERAGE_EDGE_RATE) return 'average';
  return 'beginner';
}

/** 生成边缘目标角度（弧度，远离中心视野） */
export function generateEdgeAngle(): number {
  return Math.random() * Math.PI * 2;
}

/** 生成MOBA怪物路径角度 */
export function generateSpawnAngle(): number {
  return Math.random() * Math.PI * 2;
}
