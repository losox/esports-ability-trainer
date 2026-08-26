/** 最大逃脱次数，达到则游戏结束 */
export const MAX_ESCAPES = 3;

/** 每个目标的分数 */
const TARGET_SCORE = 15;
/** 无逃脱波次奖励分数 */
const NO_ESCAPE_BONUS = 50;
/** 满分基准 */
export const MAX_SCORE = 1000;

/** 参考分数：职业选手目标切换时间约400-600ms */
const PRO_SWITCH_MS = 500;
/** 参考分数：高手目标切换时间约700-900ms */
const EXPERT_SWITCH_MS = 800;
/** 参考分数：普通玩家目标切换时间约1200-1500ms */
const AVERAGE_SWITCH_MS = 1350;

/** 难度参数接口 */
export interface TrackingDifficultyParams {
  /** 同时目标数 */
  simultaneousTargets: number;
  /** 移动速度 */
  moveSpeed: number;
  /** 运动模式 */
  movePattern: 'straight' | 'curve' | 'random';
  /** 目标存活时间（秒） */
  survivalTime: number;
}

/** 多目标追踪训练统计 */
export interface TrackingStats {
  eliminated: number;
  escapes: number;
  noEscapeWaves: number;
  switchTimes: number[];
}

/** 计算总得分 */
export function calculateScore(stats: TrackingStats): number {
  const base = stats.eliminated * TARGET_SCORE;
  const noEscapeBonus = stats.noEscapeWaves * NO_ESCAPE_BONUS;
  return Math.round(base + noEscapeBonus);
}

/** 计算平均目标切换时间（ms） */
export function calculateSwitchTime(switchTimes: number[]): number {
  if (switchTimes.length === 0) return 0;
  const sum = switchTimes.reduce((acc, t) => acc + t, 0);
  return Math.round(sum / switchTimes.length);
}

/** 根据已消除目标数获取当前难度等级 */
export function getDifficultyLevel(eliminated: number): number {
  return Math.floor(eliminated / 5) + 1;
}

/** 根据难度等级获取参数 */
export function getDifficultyParams(level: number): TrackingDifficultyParams {
  const clampedLevel = Math.max(1, Math.min(10, level));
  const step = clampedLevel - 1;

  const simultaneousTargets = Math.min(12, 3 + Math.floor(step));
  const moveSpeed = 1.0 + step * 0.3;
  const survivalTime = Math.max(4, 10 - step);

  let movePattern: 'straight' | 'curve' | 'random';
  if (step < 2) {
    movePattern = 'straight';
  } else if (step < 5) {
    movePattern = 'curve';
  } else {
    movePattern = 'random';
  }

  return { simultaneousTargets, moveSpeed, movePattern, survivalTime };
}

/** 判断是否游戏结束 */
export function shouldGameOver(escapes: number): boolean {
  return escapes >= MAX_ESCAPES;
}

/** 计算评级 */
export function calculateGrade(score: number): string {
  if (score >= 850) return 'S';
  if (score >= 700) return 'A';
  if (score >= 500) return 'B';
  if (score >= 300) return 'C';
  return 'D';
}

/** 计算追踪能力等级 */
export function calculateTrackingLevel(switchTime: number, noEscapeWaves: number): string {
  if (switchTime > 0 && switchTime <= PRO_SWITCH_MS && noEscapeWaves >= 5) return 'pro';
  if (switchTime > 0 && switchTime <= EXPERT_SWITCH_MS && noEscapeWaves >= 3) return 'expert';
  if (switchTime > 0 && switchTime <= AVERAGE_SWITCH_MS) return 'average';
  return 'beginner';
}

/** 计算追踪容量（同时处理的目标数） */
export function calculateTrackingCapacity(eliminated: number, escapes: number): number {
  if (eliminated + escapes === 0) return 0;
  return Math.round((eliminated / (eliminated + escapes)) * 10) / 10;
}

/** 生成随机移动方向（弧度） */
export function generateMoveAngle(): number {
  return Math.random() * Math.PI * 2;
}

/** 生成曲线运动的角速度 */
export function generateCurveAngularSpeed(): number {
  return (Math.random() - 0.5) * 2.0;
}
