import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../../lib/supabase';
import { getDeviceFingerprint } from '../../lib/device-fingerprint';
import { checkDeviceRegistration } from '../../lib/auth';
import type { Locale } from '../../i18n/ui';

type Preference = 'fps' | 'moba' | 'all';

interface Props {
  locale: Locale;
  translations: {
    email: string;
    emailPlaceholder: string;
    password: string;
    passwordPlaceholder: string;
    confirmPassword: string;
    registerBtn: string;
    githubLogin: string;
    googleLogin: string;
    orDivider: string;
    hasAccount: string;
    loginLink: string;
    preferenceTitle: string;
    preferenceSubtitle: string;
    prefFps: string;
    prefMoba: string;
    prefAll: string;
    errorEmail: string;
    errorPassword: string;
    errorConfirm: string;
    errorExists: string;
    errorGeneric: string;
    deviceLimitExceeded: string;
    alreadyRegistered: string;
    registeredSuccess: string;
  };
  loginPath: string;
  dashboardPath: string;
}

export default function RegisterForm({ translations: t, loginPath, dashboardPath }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pref, setPref] = useState<Preference>('all');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const sb = getSupabase();
      if (!sb) return;
      try {
        const {
          data: { session },
        } = await sb.auth.getSession();
        if (session) window.location.href = dashboardPath;
      } catch {
        /* ignore */
      }
    };
    checkSession();
  }, [dashboardPath]);

  const handleRegister = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setInfo(null);

      if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        setError(t.errorEmail);
        return;
      }
      if (password.length < 6) {
        setError(t.errorPassword);
        return;
      }
      if (password !== confirm) {
        setError(t.errorConfirm);
        return;
      }

      const sb = getSupabase();
      if (!sb) {
        setError(t.errorGeneric);
        return;
      }

      setLoading(true);
      try {
        const deviceFp = getDeviceFingerprint();
        const deviceCheck = await checkDeviceRegistration(deviceFp);

        if (!deviceCheck.allowed) {
          setError(t.deviceLimitExceeded);
          setLoading(false);
          return;
        }

        const { data, error: signUpError } = await sb.auth.signUp({
          email,
          password,
          options: { data: { preference: pref } },
        });
        if (signUpError) {
          const msg = signUpError.message.toLowerCase();
          if (msg.includes('already') || msg.includes('already registered')) {
            setError(t.alreadyRegistered);
          } else {
            setError(t.errorGeneric);
          }
          return;
        }
        if (data.session) {
          window.location.href = dashboardPath;
        } else {
          window.location.href = `${loginPath}?registered=1`;
        }
      } catch {
        setError(t.errorGeneric);
      } finally {
        setLoading(false);
      }
    },
    [email, password, confirm, pref, t, dashboardPath, loginPath],
  );

  const handleOAuth = useCallback(
    async (provider: 'github' | 'google') => {
      setError(null);
      const sb = getSupabase();
      if (!sb) {
        setError(t.errorGeneric);
        return;
      }
      setLoading(true);
      try {
        const { error: oauthError } = await sb.auth.signInWithOAuth({
          provider,
          options: { redirectTo: `${window.location.origin}${dashboardPath}` },
        });
        if (oauthError) {
          setLoading(false);
          setError(t.errorGeneric);
        }
      } catch {
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

      <form onSubmit={handleRegister}>
        <div className="field">
          <label htmlFor="reg-email">{t.email}</label>
          <input
            id="reg-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.emailPlaceholder}
            disabled={loading}
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label htmlFor="reg-password">{t.password}</label>
          <input
            id="reg-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.passwordPlaceholder}
            disabled={loading}
            autoComplete="new-password"
          />
        </div>
        <div className="field">
          <label htmlFor="reg-confirm">{t.confirmPassword}</label>
          <input
            id="reg-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t.passwordPlaceholder}
            disabled={loading}
            autoComplete="new-password"
          />
        </div>

        <div className="pref-section">
          <div className="pref-title">{t.preferenceTitle}</div>
          <div className="pref-subtitle">{t.preferenceSubtitle}</div>
          <div className="pref-options">
            {(['fps', 'moba', 'all'] as Preference[]).map((p) => (
              <button
                key={p}
                type="button"
                className={`pref-btn ${pref === p ? 'active' : ''}`}
                onClick={() => setPref(p)}
              >
                {p === 'fps' ? t.prefFps : p === 'moba' ? t.prefMoba : t.prefAll}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="error-msg">{error}</p>}
        {info && <p className="form-info">{info}</p>}

        <button type="submit" className="submit-btn" disabled={loading}>
          {loading ? '...' : t.registerBtn}
        </button>
      </form>

      <p className="switch-link">
        {t.hasAccount} <a href={loginPath}>{t.loginLink}</a>
      </p>
    </div>
  );
}
