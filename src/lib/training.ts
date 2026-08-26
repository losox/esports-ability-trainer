import { supabase } from './supabase';

export type DimensionVersion = 'fps' | 'moba' | 'universal';

export interface GroupScore {
  groupIndex: number;
  score: number;
  subMetrics: Record<string, number>;
}

export interface SaveSessionInput {
  dimensionId: number;
  version: DimensionVersion;
  totalScore: number;
  groups: GroupScore[];
  durationMs: number;
}

export interface SavedSession {
  id: string;
  dimensionId: number;
  version: DimensionVersion;
  totalScore: number;
  groupCount: number;
  durationMs: number;
  createdAt: string;
  groups: GroupScore[];
}

export interface DimensionStats {
  dimensionId: number;
  bestScore: number | null;
  lastScore: number | null;
  sessionCount: number;
  recentScores: { score: number; createdAt: string }[];
}

// Internal types for Supabase query results
interface ScoreRow {
  id: string;
  group_index: number;
  score: number;
  sub_metrics: Record<string, number>;
  is_personal_best: boolean;
}

interface SessionWithScores {
  id: string;
  dimension_id: number;
  version: string;
  total_score: number;
  group_count: number;
  duration_ms: number;
  created_at: string;
  scores: ScoreRow[] | null;
}

/**
 * Save a complete training session (one session + multiple group scores).
 * Returns the saved session with group data, or null if user is not logged in.
 */
export async function saveTrainingSession(input: SaveSessionInput): Promise<SavedSession | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return null;

  // 1. Insert session
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      dimension_id: input.dimensionId,
      version: input.version,
      total_score: input.totalScore,
      group_count: input.groups.length,
      duration_ms: input.durationMs,
    })
    .select()
    .single();

  if (sessionError) {
    console.error('Failed to save session:', sessionError);
    return null;
  }

  // 2. Insert scores
  const scores = input.groups.map((g) => ({
    session_id: session.id,
    user_id: user.id,
    dimension_id: input.dimensionId,
    group_index: g.groupIndex,
    score: g.score,
    sub_metrics: g.subMetrics,
  }));

  const { data: savedScores, error: scoresError } = await supabase
    .from('scores')
    .insert(scores)
    .select('id, group_index, score, sub_metrics, is_personal_best');

  if (scoresError) {
    console.error('Failed to save scores:', scoresError);
    // Session was already saved; return what we have
    return {
      id: session.id,
      dimensionId: input.dimensionId,
      version: input.version,
      totalScore: input.totalScore,
      groupCount: input.groups.length,
      durationMs: input.durationMs,
      createdAt: session.created_at,
      groups: input.groups,
    };
  }

  return {
    id: session.id,
    dimensionId: input.dimensionId,
    version: input.version,
    totalScore: input.totalScore,
    groupCount: input.groups.length,
    durationMs: input.durationMs,
    createdAt: session.created_at,
    groups: savedScores.map((s) => ({
      groupIndex: s.group_index,
      score: s.score,
      subMetrics: s.sub_metrics as Record<string, number>,
    })),
  };
}

/**
 * Get stats for a specific dimension (best score, last score, session count).
 */
export async function getDimensionStats(dimensionId: number): Promise<DimensionStats> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) {
    return { dimensionId, bestScore: null, lastScore: null, sessionCount: 0, recentScores: [] };
  }

  // Get all scores for this dimension ordered by date
  const { data: scores, error } = await supabase
    .from('scores')
    .select('score, created_at, is_personal_best')
    .eq('user_id', user.id)
    .eq('dimension_id', dimensionId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !scores) {
    console.error('Failed to fetch dimension stats:', error);
    return { dimensionId, bestScore: null, lastScore: null, sessionCount: 0, recentScores: [] };
  }

  const bestScore =
    scores.find((s) => s.is_personal_best)?.score ??
    (scores.length > 0 ? Math.max(...scores.map((s) => s.score)) : null);

  const lastScore = scores.length > 0 ? scores[0].score : null;

  const { count: sessionCount } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('dimension_id', dimensionId);

  return {
    dimensionId,
    bestScore,
    lastScore,
    sessionCount: sessionCount ?? 0,
    recentScores: scores.slice(0, 10).map((s) => ({
      score: s.score,
      createdAt: s.created_at,
    })),
  };
}

/**
 * Get recent training sessions across all dimensions.
 */
export async function getRecentSessions(limit = 10): Promise<SavedSession[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return [];

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select(
      'id, dimension_id, version, total_score, group_count, duration_ms, created_at, scores(id, group_index, score, sub_metrics)',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !sessions) {
    console.error('Failed to fetch recent sessions:', error);
    return [];
  }

  return (sessions as SessionWithScores[]).map((s) => ({
    id: s.id,
    dimensionId: s.dimension_id,
    version: s.version as DimensionVersion,
    totalScore: s.total_score,
    groupCount: s.group_count,
    durationMs: s.duration_ms,
    createdAt: s.created_at,
    groups: (s.scores || []).map((sc) => ({
      groupIndex: sc.group_index,
      score: sc.score,
      subMetrics: sc.sub_metrics,
    })),
  }));
}

/**
 * Check if user is currently logged in.
 */
export async function getCurrentUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}
