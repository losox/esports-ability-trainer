export type CameraType = 'first-person' | 'isometric' | 'fixed-front';

export type Preference = 'fps' | 'moba' | 'all';

export interface DifficultyConfig {
  level: number;
  params: Record<string, number | string>;
}

export interface TrainingResult {
  dimensionId: number;
  score: number;
  subMetrics: Record<string, number>;
  durationMs: number;
  timestamp: string;
}

export interface SessionResult {
  groups: TrainingResult[];
  totalScore: number;
  personalBest: number;
  isNewBest: boolean;
}

export interface TrainingCallbacks {
  onScoreUpdate?: (score: number) => void;
  onGroupComplete?: (result: TrainingResult) => void;
  onSessionComplete?: (result: SessionResult) => void;
  onDifficultyChange?: (level: number) => void;
  onError?: (message: string) => void;
}

export interface MouseSensitivity {
  value: number;
}

export const DEFAULT_SENSITIVITY: MouseSensitivity = { value: 1.0 };
