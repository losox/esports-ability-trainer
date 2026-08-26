import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { Locale } from '../../i18n/ui';

interface Props {
  locale: Locale;
  translations: {
    email: string;
    emailPlaceholder: string;
    password: string;
    passwordPlaceholder: string;
    loginBtn: string;
    githubLogin: string;
    googleLogin: string;
    orDivider: string;
    noAccount: string;
    signupLink: string;
    errorEmail: string;
    errorPassword: string;
    errorInvalid: string;
    errorGeneric: string;
  };
  signupPath: string;
  dashboardPath: string;
}

export default function LoginForm({ translations: t, signupPath, dashboardPath }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        window.location.href = dashboardPath;
      }
    };
    checkSession();
  }, [dashboardPath]);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        setError(t.errorEmail);
        return;
      }
      if (password.length < 6) {
        setError(t.errorPassword);
        return;
      }

      setLoading(true);
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);

      if (authError) {
        setError(authError.message.includes('Invalid') ? t.errorInvalid : t.errorGeneric);
        return;
      }

      window.location.href = dashboardPath;
    },
    [email, password, t, dashboardPath],
  );

  const handleOAuth = useCallback(
    async (provider: 'github' | 'google') => {
      setError(null);
      setLoading(true);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}${dashboardPath}` },
      });
      if (oauthError) {
        setLoading(false);
        setError(t.errorGeneric);
      }
    },
    [t, dashboardPath],
  );

  return (
    <div className="auth-form">
      <button
        className="oauth-btn oauth-github"
        onClick={() => handleOAuth('github')}
        disabled={loading}
      >
        {t.githubLogin}
      </button>
      <button
        className="oauth-btn oauth-google"
        onClick={() => handleOAuth('google')}
        disabled={loading}
      >
        {t.googleLogin}
      </button>

      <div className="divider">
        <span>{t.orDivider}</span>
      </div>

      <form onSubmit={handleLogin}>
        <div className="field">
          <label htmlFor="login-email">{t.email}</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.emailPlaceholder}
            disabled={loading}
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">{t.password}</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.passwordPlaceholder}
            disabled={loading}
            autoComplete="current-password"
          />
        </div>

        {error && <p className="error-msg">{error}</p>}

        <button type="submit" className="submit-btn" disabled={loading}>
          {loading ? '...' : t.loginBtn}
        </button>
      </form>

      <p className="switch-link">
        {t.noAccount} <a href={signupPath}>{t.signupLink}</a>
      </p>
    </div>
  );
}
