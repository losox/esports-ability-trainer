import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../../lib/supabase';
import {
  getDimensionStats,
  getRecentSessions,
  type DimensionStats,
  type SavedSession,
} from '../../lib/training';
import type { User } from '@supabase/supabase-js';
import type { Locale } from '../../i18n/ui';

interface DimensionInfo {
  key: string;
  id: number;
  icon: string;
  name: string;
  type: string;
  desc: string;
}

interface Props {
  locale: Locale;
  translations: {
    welcome: string;
    subtitle: string;
    quickTest: string;
    quickTestDesc: string;
    startTraining: string;
    startTrainingDesc: string;
    yourDimensions: string;
    recentSessions: string;
    noSessions: string;
    streak: string;
    bestScore: string;
    lastScore: string;
    train: string;
    test: string;
    loading: string;
    today: string;
    yesterday: string;
    daysAgo: string;
  };
  dimensions: DimensionInfo[];
  loginPath: string;
  logoutLabel: string;
  testPath: string;
  trainEntryPath: string;
  homePath: string;
  // Link factory: given a dimension id, return the train/test page URL (already locale-prefixed)
  getDimensionPath: (dimensionId: number) => string;
}

function formatDateAgo(dateStr: string, locale: Locale): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return locale === 'en' ? 'Today' : '今天';
  if (diffDays === 1) return locale === 'en' ? 'Yesterday' : '昨天';
  if (diffDays < 7) return locale === 'en' ? `${diffDays} days ago` : `${diffDays}天前`;
  return date.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US');
}

function getDimensionName(dimensions: DimensionInfo[], id: number): string {
  const d = dimensions.find((dim) => dim.id === id);
  return d ? d.name : `D${id}`;
}

function getDimensionIcon(dimensions: DimensionInfo[], id: number): string {
  const d = dimensions.find((dim) => dim.id === id);
  return d?.icon ?? '🎯';
}

export default function Dashboard({
  translations: t,
  dimensions,
  loginPath,
  logoutLabel,
  testPath,
  trainEntryPath,
  homePath,
  getDimensionPath,
  locale,
}: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [statsByDimension, setStatsByDimension] = useState<Record<number, DimensionStats>>({});
  const [recentSessions, setRecentSessions] = useState<SavedSession[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const sb = getSupabase();
      if (!sb) {
        // Supabase 未配置：直接展示仪表盘（无登录、无数据，UI 显示占位值）
        setChecking(false);
        setLoadingStats(false);
        return;
      }
      try {
        const {
          data: { session },
        } = await sb.auth.getSession();
        if (!session) {
          window.location.href = loginPath;
          return;
        }
        setUser(session.user);
        setChecking(false);

        // Load stats for all dimensions
        const statsPromises = dimensions.map((d) => getDimensionStats(d.id));
        const [statsResults, sessions] = await Promise.all([
          Promise.all(statsPromises),
          getRecentSessions(8),
        ]);

        const statsMap: Record<number, DimensionStats> = {};
        statsResults.forEach((s) => {
          statsMap[s.dimensionId] = s;
        });
        setStatsByDimension(statsMap);
        setRecentSessions(sessions);
      } catch (err) {
        console.error('Dashboard auth/load error:', err);
        setLoadingStats(false);
      }
    };
    checkAuth();
  }, [loginPath, dimensions]);

  const handleLogout = useCallback(async () => {
    try {
      const sb = getSupabase();
      if (sb) await sb.auth.signOut();
    } catch {
      /* ignore sign-out errors */
    }
    window.location.href = homePath;
  }, [homePath]);

  if (checking) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
      </div>
    );
  }

  const userName = user?.email?.split('@')[0] ?? '';

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div>
          <h1 className="dash-welcome">
            {t.welcome}, <span className="user-name">{userName}</span>
          </h1>
          <p className="dash-subtitle">{t.subtitle}</p>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          {logoutLabel}
        </button>
      </header>

      <div className="dash-actions">
        <a className="action-card action-test" href={testPath}>
          <div className="action-icon">⚡</div>
          <div className="action-text">
            <div className="action-title">{t.quickTest}</div>
            <div className="action-desc">{t.quickTestDesc}</div>
          </div>
        </a>
        <a className="action-card action-train" href={trainEntryPath}>
          <div className="action-icon">🎯</div>
          <div className="action-text">
            <div className="action-title">{t.startTraining}</div>
            <div className="action-desc">{t.startTrainingDesc}</div>
          </div>
        </a>
      </div>

      <section className="dash-dimensions">
        <h2 className="section-h">{t.yourDimensions}</h2>
        <div className="dim-grid">
          {dimensions.map((d) => {
            const stats = statsByDimension[d.id];
            const bestScore = stats?.bestScore;
            const lastScore = stats?.lastScore;
            return (
              <div key={d.key} className="dim-item">
                <div className="dim-item-top">
                  <span className="dim-item-icon">{d.icon}</span>
                  <span className="dim-item-id">D{d.id}</span>
                </div>
                <div className="dim-item-name">{d.name}</div>
                <div className="dim-item-type">{d.type}</div>
                <div className="dim-item-stats">
                  <div className="stat-item">
                    <span className="stat-label">{t.bestScore}</span>
                    <span className="stat-value stat-best">
                      {loadingStats ? '...' : bestScore !== null ? bestScore : '—'}
                    </span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">{t.lastScore}</span>
                    <span className="stat-value">
                      {loadingStats ? '...' : lastScore !== null ? lastScore : '—'}
                    </span>
                  </div>
                </div>
                <div className="dim-item-actions">
                  <a className="dim-btn dim-btn-train" href={getDimensionPath(d.id)}>
                    {t.train}
                  </a>
                  <a className="dim-btn dim-btn-test" href={getDimensionPath(d.id)}>
                    {t.test}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="dash-recent">
        <h2 className="section-h">{t.recentSessions}</h2>
        {loadingStats ? (
          <div className="empty-sessions">
            <div className="loading-spinner small" />
          </div>
        ) : recentSessions.length === 0 ? (
          <div className="empty-sessions">
            <p>{t.noSessions}</p>
          </div>
        ) : (
          <div className="session-list">
            {recentSessions.map((session) => (
              <div key={session.id} className="session-item">
                <div className="session-icon">
                  {getDimensionIcon(dimensions, session.dimensionId)}
                </div>
                <div className="session-info">
                  <div className="session-name">
                    D{session.dimensionId} {getDimensionName(dimensions, session.dimensionId)}
                  </div>
                  <div className="session-meta">
                    {formatDateAgo(session.createdAt, locale)} · {session.groupCount}{' '}
                    {locale === 'en' ? 'groups' : '组'}
                  </div>
                </div>
                <div className="session-score">
                  <div className="session-score-value">{session.totalScore}</div>
                  <div className="session-score-label">{t.bestScore}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <style>{`
        .dashboard {
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 24px 80px;
          color: #E8E8E8;
        }
        .dashboard-loading {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #2a2a2e;
          border-top-color: #FF4500;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        .loading-spinner.small {
          width: 24px;
          height: 24px;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .dash-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
        }
        .dash-welcome {
          font-size: 2rem;
          font-weight: 800;
          margin: 0;
          letter-spacing: -0.02em;
        }
        .user-name {
          color: #FF4500;
        }
        .dash-subtitle {
          color: #7A7A82;
          margin: 6px 0 0;
          font-size: 0.95rem;
        }
        .logout-btn {
          padding: 10px 20px;
          background: transparent;
          border: 1px solid #3a3a3e;
          color: #7A7A82;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: all 0.2s;
        }
        .logout-btn:hover {
          border-color: #FF4500;
          color: #FF4500;
        }
        .dash-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 40px;
        }
        .action-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 24px;
          border-radius: 12px;
          background: #1e1e22;
          border: 1px solid #2a2a2e;
          text-decoration: none;
          color: inherit;
          transition: all 0.2s;
          cursor: pointer;
        }
        .action-card:hover {
          border-color: #FF4500;
          transform: translateY(-2px);
        }
        .action-icon {
          font-size: 2rem;
        }
        .action-title {
          font-weight: 700;
          font-size: 1.1rem;
          margin-bottom: 4px;
        }
        .action-desc {
          color: #7A7A82;
          font-size: 0.85rem;
        }
        .action-test {
          border-left: 3px solid #FF4500;
        }
        .action-train {
          border-left: 3px solid #FFD700;
        }
        .section-h {
          font-size: 1.3rem;
          font-weight: 700;
          margin: 0 0 20px;
          letter-spacing: -0.01em;
        }
        .dim-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 16px;
          margin-bottom: 40px;
        }
        .dim-item {
          background: #1e1e22;
          border: 1px solid #2a2a2e;
          border-radius: 12px;
          padding: 20px;
          transition: all 0.2s;
        }
        .dim-item:hover {
          border-color: #3a3a3e;
          transform: translateY(-2px);
        }
        .dim-item-top {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }
        .dim-item-icon {
          font-size: 1.4rem;
        }
        .dim-item-id {
          font-size: 0.75rem;
          font-weight: 700;
          color: #FF4500;
          background: rgba(255,69,0,0.1);
          padding: 3px 8px;
          border-radius: 4px;
          letter-spacing: 0.05em;
        }
        .dim-item-name {
          font-weight: 700;
          font-size: 1rem;
          margin-bottom: 4px;
        }
        .dim-item-type {
          font-size: 0.75rem;
          color: #7A7A82;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 16px;
        }
        .dim-item-stats {
          display: flex;
          gap: 16px;
          margin-bottom: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid #2a2a2e;
        }
        .stat-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .stat-label {
          font-size: 0.7rem;
          color: #7A7A82;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .stat-value {
          font-size: 1.2rem;
          font-weight: 700;
          color: #E8E8E8;
        }
        .stat-best {
          color: #FFD700;
        }
        .dim-item-actions {
          display: flex;
          gap: 8px;
        }
        .dim-btn {
          flex: 1;
          text-align: center;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          text-decoration: none;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          transition: all 0.2s;
        }
        .dim-btn-train {
          background: #FF4500;
          color: #fff;
        }
        .dim-btn-train:hover {
          box-shadow: 0 0 12px rgba(255,69,0,0.4);
        }
        .dim-btn-test {
          background: transparent;
          border: 1px solid #3a3a3e;
          color: #E8E8E8;
        }
        .dim-btn-test:hover {
          border-color: #FF4500;
          color: #FF4500;
        }
        .dash-recent {
          margin-top: 8px;
        }
        .empty-sessions {
          text-align: center;
          padding: 48px 20px;
          color: #7A7A82;
          background: #1e1e22;
          border: 1px dashed #2a2a2e;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .session-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .session-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 14px 20px;
          background: #1e1e22;
          border: 1px solid #2a2a2e;
          border-radius: 10px;
          transition: all 0.2s;
        }
        .session-item:hover {
          border-color: #3a3a3e;
        }
        .session-icon {
          font-size: 1.5rem;
          width: 40px;
          text-align: center;
        }
        .session-info {
          flex: 1;
        }
        .session-name {
          font-weight: 600;
          font-size: 0.95rem;
          margin-bottom: 2px;
        }
        .session-meta {
          font-size: 0.8rem;
          color: #7A7A82;
        }
        .session-score {
          text-align: right;
        }
        .session-score-value {
          font-size: 1.4rem;
          font-weight: 700;
          color: #FFD700;
        }
        .session-score-label {
          font-size: 0.7rem;
          color: #7A7A82;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        @media (max-width: 768px) {
          .dash-actions { grid-template-columns: 1fr; }
          .dim-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 480px) {
          .dim-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
