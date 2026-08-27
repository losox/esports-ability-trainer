import { useState, useEffect } from 'react';
import { requestPasswordReset, verifyAndResetPassword, sendResetCodeEmail } from '../../lib/auth';
import type { Locale } from '../../i18n/ui';

interface Props {
  locale: Locale;
  translations: {
    forgotPassword: string;
    forgotDesc: string;
    email: string;
    emailPlaceholder: string;
    sendCodeBtn: string;
    sendingCode: string;
    resetTitle: string;
    resetDesc: string;
    codeLabel: string;
    newPasswordLabel: string;
    newPasswordPlaceholder: string;
    confirmNewPasswordLabel: string;
    confirmNewPasswordPlaceholder: string;
    resetPasswordBtn: string;
    resettingPassword: string;
    resendCode: string;
    resendCountdown: string;
    changeEmail: string;
    resetSuccessTitle: string;
    resetSuccessDesc: string;
    goToLogin: string;
    backToLogin: string;
    invalidCode: string;
    codeExpired: string;
    errorPasswordTooShort: string;
    errorPasswordMismatch: string;
    resetLimitExceeded: string;
    emailNotFound: string;
    resetSent: string;
    errorGeneric: string;
  };
  loginPath: string;
}

type Step = 'email' | 'code' | 'done';

function fill(template: string, params: Record<string, string | number>): string {
  let result = template;
  for (const [k, v] of Object.entries(params)) {
    result = result.replaceAll(`{${k}}`, String(v));
  }
  return result;
}

export default function ForgotPasswordForm({ translations: t, loginPath }: Props) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codeSent, setCodeSent] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);

    const result = await requestPasswordReset(email.trim());

    if (!result.success) {
      if (result.reason === 'rate_limit') {
        setError(fill(t.resetLimitExceeded, { attempts: result.max_attempts ?? 5 }));
      } else if (result.reason === 'email_not_found') {
        setError(t.emailNotFound);
      } else {
        setError(t.errorGeneric);
      }
      setSubmitting(false);
      return;
    }

    if (result.code) {
      const emailResult = await sendResetCodeEmail(email.trim(), result.code);
      setCodeSent(result.code);
      setShowCode(!!emailResult.debugCode);
      setInfo(fill(t.resetSent, { remaining: result.attempts_remaining ?? 0 }));
      setStep('code');
      setCountdown(60);
    }
    setSubmitting(false);
  }

  async function handleResendCode() {
    if (countdown > 0) return;
    setError('');
    setInfo('');

    const result = await requestPasswordReset(email.trim());
    if (!result.success) {
      setError(t.errorGeneric);
      return;
    }

    if (result.code) {
      const emailResult = await sendResetCodeEmail(email.trim(), result.code);
      setCodeSent(result.code);
      setShowCode(!!emailResult.debugCode);
      setInfo(fill(t.resetSent, { remaining: result.attempts_remaining ?? 0 }));
      setCountdown(60);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    if (newPassword.length < 6) {
      setError(t.errorPasswordTooShort);
      setSubmitting(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t.errorPasswordMismatch);
      setSubmitting(false);
      return;
    }

    const result = await verifyAndResetPassword(email.trim(), code.trim(), newPassword);

    if (!result.success) {
      if (result.reason === 'code_mismatch') {
        setError(t.invalidCode);
      } else if (result.reason === 'invalid_code') {
        setError(t.codeExpired);
      } else {
        setError(t.errorGeneric);
      }
      setSubmitting(false);
      return;
    }

    setStep('done');
    setSubmitting(false);
  }

  function goBack() {
    setStep('email');
    setEmail('');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setInfo('');
    setCodeSent('');
    setShowCode(false);
  }

  return (
    <div className="forgot-wrapper">
      {step === 'email' && (
        <form className="forgot-form" onSubmit={handleRequestCode}>
          <h2 className="forgot-title">{t.forgotPassword}</h2>
          <p className="forgot-desc">{t.forgotDesc}</p>

          <div className="form-group">
            <label htmlFor="reset-email">{t.email}</label>
            <input
              id="reset-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.emailPlaceholder}
              required
              autoComplete="email"
            />
          </div>

          {error && <div className="form-error">{error}</div>}
          {info && <div className="form-info">{info}</div>}

          <button type="submit" className="btn-submit" disabled={submitting}>
            {submitting ? t.sendingCode : t.sendCodeBtn}
          </button>

          <div className="forgot-footer">
            <a href={loginPath} className="back-link">
              {t.backToLogin}
            </a>
          </div>
        </form>
      )}

      {step === 'code' && (
        <form className="forgot-form" onSubmit={handleReset}>
          <h2 className="forgot-title">{t.resetTitle}</h2>
          <p className="forgot-desc">{fill(t.resetDesc, { email })}</p>

          {(import.meta.env.DEV || showCode) && codeSent && (
            <div className="dev-code-notice">
              {import.meta.env.DEV ? 'Dev code' : 'Debug code'}: <strong>{codeSent}</strong>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="reset-code">{t.codeLabel}</label>
            <input
              id="reset-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              required
              inputMode="numeric"
              maxLength={6}
              className="code-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="new-password">{t.newPasswordLabel}</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t.newPasswordPlaceholder}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirm-reset-password">{t.confirmNewPasswordLabel}</label>
            <input
              id="confirm-reset-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t.confirmNewPasswordPlaceholder}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          {error && <div className="form-error">{error}</div>}
          {info && <div className="form-info">{info}</div>}

          <button type="submit" className="btn-submit" disabled={submitting}>
            {submitting ? t.resettingPassword : t.resetPasswordBtn}
          </button>

          <div className="resend-row">
            <button
              type="button"
              className="btn-resend"
              onClick={handleResendCode}
              disabled={countdown > 0}
            >
              {countdown > 0 ? fill(t.resendCountdown, { seconds: countdown }) : t.resendCode}
            </button>
          </div>

          <div className="forgot-footer">
            <button type="button" className="back-link-btn" onClick={goBack}>
              {t.changeEmail}
            </button>
          </div>
        </form>
      )}

      {step === 'done' && (
        <div className="forgot-form forgot-done">
          <h2 className="forgot-title">{t.resetSuccessTitle}</h2>
          <p className="forgot-desc">{t.resetSuccessDesc}</p>
          <a href={loginPath} className="btn-submit btn-primary">
            {t.goToLogin}
          </a>
        </div>
      )}
    </div>
  );
}
