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

export function calculateScore(reactionTimes: number[]): number {
  if (reactionTimes.length === 0) return 0;

  const avg = reactionTimes.reduce((sum, t) => sum + t, 0) / reactionTimes.length;
  const penalty = reactionTimes.filter((t) => t < 0).length * FALSE_START_PENALTY;

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

export function calculateConsistency(reactionTimes: number[]): number {
  if (reactionTimes.length < 2) return 0;

  const avg = reactionTimes.reduce((sum, t) => sum + t, 0) / reactionTimes.length;
  const variance = reactionTimes.reduce((sum, t) => sum + (t - avg) ** 2, 0) / reactionTimes.length;
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
