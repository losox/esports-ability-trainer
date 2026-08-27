import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../../lib/supabase';
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
    errorNotConfirmed: string;
    errorRateLimit: string;
    resendConfirm: string;
    confirmSent: string;
    verifiedNotice: string;
  };
  signupPath: string;
  dashboardPath: string;
}

type ErrorKind = 'invalid' | 'not_confirmed' | 'rate_limit' | 'generic';

function categorizeError(message: string): ErrorKind {
  const lower = message.toLowerCase();
  if (lower.includes('not confirmed')) return 'not_confirmed';
  if (lower.includes('rate') || lower.includes('too many')) return 'rate_limit';
  if (lower.includes('invalid')) return 'invalid';
  return 'generic';
}

export default function LoginForm({ translations: t, signupPath, dashboardPath }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [loading, setLoading] = useState(false);
  const [verified] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = window.location.search;
    return params.includes('verified=1');
  });
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const sb = getSupabase();
      if (!sb) return;
      try {
        const {
          data: { session },
        } = await sb.auth.getSession();
        if (session) window.location.href = dashboardPath;
      } catch (err) {
        console.debug('[login] session check failed:', err);
      }
    };
    checkSession();
  }, [dashboardPath]);

  const handleResend = useCallback(async () => {
    if (!email) return;
    setResending(true);
    try {
      const sb = getSupabase();
      if (!sb) return;
      const { error } = await sb.auth.resend({
        type: 'signup',
        email,
      });
      if (!error) {
        setResent(true);
      }
    } catch (err) {
      console.error('[login] resend failed:', err);
    } finally {
      setResending(false);
    }
  }, [email]);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setErrorKind(null);
      setResent(false);

      if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        setError(t.errorEmail);
        return;
      }
      if (password.length < 6) {
        setError(t.errorPassword);
        return;
      }

      const sb = getSupabase();
      if (!sb) {
        setError(t.errorGeneric);
        setErrorKind('generic');
        return;
      }

      setLoading(true);
      try {
        const { error: authError } = await sb.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) {
          const kind = categorizeError(authError.message);
          console.warn('[login] auth error:', kind, authError.message);
          setErrorKind(kind);
          switch (kind) {
            case 'invalid':
              setError(t.errorInvalid);
              break;
            case 'not_confirmed':
              setError(t.errorNotConfirmed);
              break;
            case 'rate_limit':
              setError(t.errorRateLimit);
              break;
            default:
              setError(t.errorGeneric);
          }
          return;
        }
        window.location.href = dashboardPath;
      } catch (err) {
        console.error('[login] signInWithPassword threw:', err);
        setError(t.errorGeneric);
        setErrorKind('generic');
      } finally {
        setLoading(false);
      }
    },
    [email, password, t, dashboardPath],
  );

  const handleOAuth = useCallback(
    async (provider: 'github' | 'google') => {
      setError(null);
      setErrorKind(null);
      const sb = getSupabase();
      if (!sb) {
        setError(t.errorGeneric);
        setErrorKind('generic');
        return;
      }
      setLoading(true);
      try {
        const { error: oauthError } = await sb.auth.signInWithOAuth({
          provider,
          options: { redirectTo: `${window.location.origin}${dashboardPath}` },
        });
        if (oauthError) {
          console.error('[login] OAuth error:', oauthError);
          setLoading(false);
          setError(t.errorGeneric);
          setErrorKind('generic');
        }
      } catch (err) {
        console.error('[login] OAuth threw:', err);
        setLoading(false);
        setError(t.errorGeneric);
        setErrorKind('generic');
      }
    },
    [t, dashboardPath],
  );

  return (
    <div className="auth-form">
      {verified && !error && <p className="verified-notice">{t.verifiedNotice}</p>}

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

        {error && (
          <p className={`error-msg error-${errorKind ?? 'generic'}`}>
            {error}
            {errorKind === 'not_confirmed' && !resent && (
              <button
                type="button"
                className="resend-btn"
                onClick={handleResend}
                disabled={resending || !email}
              >
                {resending ? '...' : t.resendConfirm}
              </button>
            )}
            {errorKind === 'not_confirmed' && resent && (
              <span className="confirm-sent">{t.confirmSent}</span>
            )}
          </p>
        )}

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
