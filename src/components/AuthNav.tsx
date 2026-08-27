import { useState, useEffect, useRef } from 'react';
import { getSupabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Locale } from '../i18n/ui';

interface Props {
  locale: Locale;
  translations: {
    home: string;
    login: string;
    register: string;
    dashboard: string;
    logout: string;
    welcomeUser: string;
  };
  homePath: string;
  loginPath: string;
  registerPath: string;
  dashboardPath: string;
  langSwitchPath: string;
  langSwitchLabel: string;
}

export default function AuthNav({
  translations,
  homePath,
  loginPath,
  registerPath,
  dashboardPath,
  langSwitchPath,
  langSwitchLabel,
}: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(() => getSupabase() === null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;

    const sb = getSupabase();
    if (!sb) {
      return () => {
        mounted.current = false;
      };
    }

    sb.auth.getUser().then(({ data: { user } }) => {
      if (mounted.current) {
        setUser(user);
        setIsReady(true);
      }
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      if (mounted.current) {
        setUser(session?.user ?? null);
        setIsReady(true);
      }
    });

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    const sb = getSupabase();
    if (!sb) return;
    await sb.auth.signOut();
    setUser(null);
    window.location.href = homePath;
  };

  const getUsername = (user: User) => {
    if (user.user_metadata?.username) return user.user_metadata.username;
    if (user.user_metadata?.display_name) return user.user_metadata.display_name;
    return user.email?.split('@')[0] ?? 'User';
  };

  if (!isReady) {
    return (
      <div className="nav-links">
        <a href={homePath} className="nav-link">
          {translations.home}
        </a>
        <span className="nav-link" style={{ color: 'var(--text-dim)' }}>
          ...
        </span>
        <a href={langSwitchPath} className="lang-switch">
          {langSwitchLabel}
        </a>
      </div>
    );
  }

  if (user) {
    const username = getUsername(user);
    const welcomeText = translations.welcomeUser.replace('{username}', username);

    return (
      <div className="nav-links">
        <a href={homePath} className="nav-link">
          {translations.home}
        </a>
        <span className="nav-link" style={{ color: 'var(--accent)', fontWeight: 500 }}>
          {welcomeText}
        </span>
        <span className="nav-separator">|</span>
        <a href={dashboardPath} className="nav-link nav-link-dashboard">
          {translations.dashboard}
        </a>
        <span className="nav-separator">|</span>
        <button onClick={handleLogout} className="nav-link nav-link-logout">
          {translations.logout}
        </button>
        <span className="nav-separator">|</span>
        <a href={langSwitchPath} className="lang-switch">
          {langSwitchLabel}
        </a>
      </div>
    );
  }

  return (
    <div className="nav-links">
      <a href={homePath} className="nav-link">
        {translations.home}
      </a>
      <a href={loginPath} className="nav-link nav-link-login">
        {translations.login}
      </a>
      <a href={registerPath} className="nav-link nav-link-register">
        {translations.register}
      </a>
      <a href={langSwitchPath} className="lang-switch">
        {langSwitchLabel}
      </a>
    </div>
  );
}
