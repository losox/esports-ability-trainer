import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
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
  };
  dimensions: DimensionInfo[];
  loginPath: string;
  testPath: string;
  basePath: string;
}

export default function Dashboard({
  translations: t,
  dimensions,
  loginPath,
  testPath,
  basePath,
}: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = loginPath;
        return;
      }
      setUser(session.user);
      setChecking(false);
    };
    checkAuth();
  }, [loginPath]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = basePath;
  }, [basePath]);

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
          Logout
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
        <div className="action-card action-train">
          <div className="action-icon">🎯</div>
          <div className="action-text">
            <div className="action-title">{t.startTraining}</div>
            <div className="action-desc">{t.startTrainingDesc}</div>
          </div>
        </div>
      </div>

      <section className="dash-dimensions">
        <h2 className="section-h">{t.yourDimensions}</h2>
        <div className="dim-grid">
          {dimensions.map((d) => (
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
                  <span className="stat-value">—</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">{t.lastScore}</span>
                  <span className="stat-value">—</span>
                </div>
              </div>
              <div className="dim-item-actions">
                <a className="dim-btn dim-btn-train" href={`${basePath}/train/d${d.id}`}>
                  {t.train}
                </a>
                <a className="dim-btn dim-btn-test" href={`${testPath}?d=${d.id}`}>
                  {t.test}
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="dash-recent">
        <h2 className="section-h">{t.recentSessions}</h2>
        <div className="empty-sessions">
          <p>{t.noSessions}</p>
        </div>
      </section>
    </div>
  );
}
