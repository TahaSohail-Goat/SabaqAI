'use client';

import React, { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Lock, Eye, EyeOff, ShieldCheck, ArrowLeft, RefreshCw } from 'lucide-react';
import AuthField from '@/components/AuthField';
import SabaqLogoBadge from '@/components/SabaqLogoBadge';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';
import Link from 'next/link';

const OTP_LENGTH = 6;
// Matches RESEND_COOLDOWN_MS in /api/auth/forgot-password — keeps the client-side timer
// in sync with what the server will actually accept.
const RESEND_COOLDOWN_S = 60;

type Step = 'otp' | 'password';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';

  const [step, setStep] = useState<Step>('otp');

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const otpRefs = useRef<Array<HTMLInputElement | null>>(Array(OTP_LENGTH).fill(null));
  const [shakeToken, setShakeToken] = useState(0);
  // The code that /api/auth/verify-reset-otp already confirmed is correct — carried over
  // to the password step so the final submit can send it to /api/auth/reset-password,
  // which is what actually spends it (see that route's comment).
  const [verifiedCode, setVerifiedCode] = useState('');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [resending, setResending] = useState(false);

  const startCooldown = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN_S);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
  }, []);

  // A code was already sent right before this page loaded (see /forgot-password) — start
  // the same cooldown the server enforces so "Resend code" doesn't immediately 429.
  useEffect(() => {
    startCooldown();
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, [startCooldown]);

  // ── Resend: re-send the OTP to the same email without leaving this page ───────
  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;

    setResending(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend code.');

      setSuccessMsg('A new code has been sent.');
      setOtp(Array(OTP_LENGTH).fill(''));
      startCooldown();
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setResending(false);
    }
  };

  const rejectCode = (message: string) => {
    setError(message);
    setOtp(Array(OTP_LENGTH).fill(''));
    setShakeToken((t) => t + 1);
    setTimeout(() => otpRefs.current[0]?.focus(), 50);
  };

  // ── Step 1: verify the code (doesn't consume it yet) ──────────────────────────
  const verifyCode = async (codeOverride?: string) => {
    const code = codeOverride ?? otp.join('');
    if (code.length < OTP_LENGTH) {
      setError('Please enter the full 6-digit code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/verify-reset-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid code.');

      setVerifiedCode(code);
      setStep('password');
      setSuccessMsg(null);
    } catch (err: unknown) {
      rejectCode(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyCode();
  };

  // ── Step 2: submit the new password ────────────────────────────────────────────
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: verifiedCode, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password.');

      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err: unknown) {
      // The code could have expired, or been used up, in the gap between step 1 and
      // step 2 — send them back to re-enter it rather than stranding them here.
      setStep('otp');
      rejectCode(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();

    // Auto-verify once every box is filled — pass the code directly to avoid the
    // stale-closure issue where `otp` state hasn't re-rendered yet.
    if (next.every((d) => d !== '') && digit) {
      verifyCode(next.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (otp[index]) {
        const next = [...otp];
        next[index] = '';
        setOtp(next);
      } else if (index > 0) {
        otpRefs.current[index - 1]?.focus();
      }
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = [...otp];
    pasted.split('').forEach((d, i) => { next[i] = d; });
    setOtp(next);
    otpRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
    if (pasted.length === OTP_LENGTH) verifyCode(pasted);
  };

  if (!email) {
    return (
      <div className="text-center py-4">
        <p className="text-[14px] text-text-2">
          This link is missing an email address.{' '}
          <Link href="/forgot-password" className="font-semibold text-brand hover:text-brand-dark">
            Start over
          </Link>
          .
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center py-4">
        <div className="flex items-center justify-center mb-5">
          <span className="flex items-center justify-center w-16 h-16 rounded-2xl bg-brand/10">
            <CheckCircle2 className="w-8 h-8 text-brand" />
          </span>
        </div>
        <h2 className="text-[22px] font-bold text-navy mb-3 tracking-tight">Password updated!</h2>
        <p className="text-[14px] text-text-2 leading-relaxed">
          Your password has been changed successfully. Redirecting you to log in...
        </p>
      </div>
    );
  }

  if (step === 'otp') {
    return (
      <div className="animate-step-in">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand/10">
              <ShieldCheck className="w-5 h-5 text-brand" />
            </span>
            <h2 className="text-[24px] font-bold text-navy tracking-tight">Enter your code</h2>
          </div>
          <p className="text-[14px] text-text-2 leading-relaxed">
            Enter the 6-digit code sent to <span className="font-semibold text-navy">{email}</span>.
          </p>
        </div>

        {error && (
          <div role="alert" aria-live="assertive" className="mb-5 flex items-start gap-2.5 rounded-xl border border-error/30 bg-error-bg p-3.5 text-sm text-error">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div role="status" aria-live="polite" className="mb-5 flex items-start gap-2.5 rounded-xl border border-brand/30 bg-brand-mint p-3.5 text-sm text-brand-dark">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleOtpSubmit} className="space-y-4">
          <div
            key={shakeToken}
            className={`flex gap-2 ${shakeToken > 0 ? 'animate-shake' : ''}`}
            onPaste={handleOtpPaste}
            role="group"
            aria-label="Verification code"
          >
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { otpRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
                className={`w-full aspect-square text-center text-[1.25rem] font-bold rounded-xl border-2 transition-all duration-150 focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 caret-transparent ${
                  digit ? 'bg-accent-subtle border-brand text-navy animate-digit-pop' : 'bg-surface border-border-strong text-navy'
                }`}
                disabled={loading}
              />
            ))}
          </div>

          <button
            type="submit"
            id="verify-reset-otp-btn"
            disabled={loading || otp.some((d) => !d)}
            className="w-full cursor-pointer rounded-2xl bg-[linear-gradient(135deg,#185C43_0%,#237A57_55%,#2A8C82_100%)] px-4 py-3.5 text-[15px] font-bold text-white transition-all duration-300 shadow-[0_4px_14px_rgba(27,181,107,0.3)] hover:shadow-[0_8px_24px_rgba(27,181,107,0.4)] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none disabled:transform-none"
          >
            {loading ? 'Verifying...' : 'Verify code'}
          </button>
        </form>

        <p className="mt-5 text-center text-[12px] text-text-3">
          Code expires in 2 minutes
        </p>

        <div className="mt-3 text-center">
          {resendCooldown > 0 ? (
            <p className="text-[13px] text-text-3">
              Resend code in <span className="font-semibold text-navy">{resendCooldown}s</span>
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:text-brand-dark transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {resending ? 'Sending...' : 'Resend code'}
            </button>
          )}
        </div>

        <div className="mt-4 text-center">
          <Link href="/forgot-password" className="text-[12px] text-text-3 hover:text-brand transition-colors">
            Wrong email? Start over
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-step-in">
      <button
        type="button"
        onClick={() => { setStep('otp'); setError(null); }}
        className="mb-6 flex items-center gap-1.5 text-[13px] text-text-3 hover:text-brand transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </button>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand/10">
            <Lock className="w-5 h-5 text-brand" />
          </span>
          <h2 className="text-[24px] font-bold text-navy tracking-tight">Choose a new password</h2>
        </div>
        <p className="text-[14px] text-text-2 leading-relaxed">
          Code verified. Now set a new password for <span className="font-semibold text-navy">{email}</span>.
        </p>
      </div>

      {error && (
        <div role="alert" aria-live="assertive" className="mb-5 flex items-start gap-2.5 rounded-xl border border-error/30 bg-error-bg p-3.5 text-sm text-error">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handlePasswordSubmit} className="space-y-4">
        <div>
          <AuthField
            icon={Lock}
            id="new-password"
            name="new-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-text-3 hover:text-navy transition-colors focus:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
          <PasswordStrengthMeter password={password} />
        </div>

        <AuthField
          icon={Lock}
          id="confirm-password"
          name="confirm-password"
          type={showConfirm ? 'text' : 'password'}
          autoComplete="new-password"
          required
          error={confirm.length > 0 && confirm !== password}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          trailing={
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="text-text-3 hover:text-navy transition-colors focus:outline-none"
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
        />

        <button
          type="submit"
          id="reset-password-btn"
          disabled={loading}
          className="w-full cursor-pointer rounded-2xl bg-[linear-gradient(135deg,#185C43_0%,#237A57_55%,#2A8C82_100%)] px-4 py-3.5 text-[15px] font-bold text-white transition-all duration-300 shadow-[0_4px_14px_rgba(27,181,107,0.3)] hover:shadow-[0_8px_24px_rgba(27,181,107,0.4)] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none disabled:transform-none"
        >
          {loading ? 'Updating...' : 'Update password'}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-[#0c261e] bg-[url('/Backward_bg.png')] bg-cover bg-center overflow-hidden p-4 sm:p-6 lg:p-10 selection:bg-brand/20 selection:text-brand-dark text-navy">
      <div className="relative z-10 w-full max-w-md bg-surface rounded-[2rem] shadow-2xl shadow-black/40 border border-white/10 overflow-hidden animate-fade-up p-8 sm:p-12">

        <Link href="/" className="flex items-center justify-center gap-3 mb-10 w-full hover:opacity-80 transition-opacity">
          <SabaqLogoBadge size={44} />
          <span className="font-display text-3xl font-semibold tracking-tight text-navy">
            Sabaq<span className="text-brand">AI</span>
          </span>
        </Link>

        <Suspense fallback={<div className="animate-pulse text-center text-sm text-text-3">Loading...</div>}>
          <ResetPasswordForm />
        </Suspense>

      </div>
    </div>
  );
}
