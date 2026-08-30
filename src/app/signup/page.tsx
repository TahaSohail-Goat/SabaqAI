'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  AtSign,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  ShieldCheck,
  RefreshCw,
  Check,
} from 'lucide-react';
import AuthField from '@/components/AuthField';
import SabaqLogoBadge from '@/components/SabaqLogoBadge';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';
import SocialAuthButtons from '@/components/SocialAuthButtons';

type Step = 'form' | 'otp';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_S = 60;

// Matches the seeded class_levels the product actually targets (Matric + Intermediate) —
// same set Topbar/Settings/onboarding already offer. class_levels itself is seeded 1-12
// in the schema, but nothing above this range is in scope for the app today.
const CLASS_LEVELS = [9, 10, 11, 12];

// Mirrors the server-side checks in /api/auth/send-otp — client-side copies exist only
// to give immediate feedback; the server never trusts these and re-validates itself.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export default function SignupPage() {
  const router = useRouter();

  // ── Form fields ─────────────────────────────────────────────────────────────
  // "username", not "full name" — usernames are unique handles (see the migration
  // adding a case-insensitive unique index on users.display_name), so the field asks
  // for exactly that rather than a freely-repeatable display name.
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [classLevel, setClassLevel] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const usernameError = usernameTouched && username.trim() && !USERNAME_RE.test(username.trim())
    ? 'Username must be 3-20 characters — letters, numbers and underscores only.'
    : null;
  const emailError = emailTouched && email.trim() && !EMAIL_RE.test(email.trim())
    ? 'Please enter a valid email address.'
    : null;

  // ── OTP state ────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('form');
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const otpRefs = useRef<Array<HTMLInputElement | null>>(Array(OTP_LENGTH).fill(null));
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Bumped on a rejected code — used as a React `key` so the shake animation replays
  // every time (a className toggle alone won't restart an already-applied CSS animation).
  const [shakeToken, setShakeToken] = useState(0);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Cleanup interval on unmount
  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  // ── Cooldown ticker ───────────────────────────────────────────────────────────
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

  // ── Step 1: send OTP ──────────────────────────────────────────────────────────
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();

    if (!trimmedEmail || !password || !trimmedUsername) {
      setUsernameTouched(true);
      setEmailTouched(true);
      setError('Please fill in all required fields.');
      return;
    }
    if (!USERNAME_RE.test(trimmedUsername)) {
      setUsernameTouched(true);
      setError('Username must be 3-20 characters — letters, numbers and underscores only.');
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setEmailTouched(true);
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password should be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!classLevel) {
      setError('Please select your class.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password, full_name: trimmedUsername, class_level: classLevel }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to send verification code.');

      setOtp(Array(OTP_LENGTH).fill(''));
      setStep('otp');
      startCooldown();
      // Focus first OTP box after render
      setTimeout(() => otpRefs.current[0]?.focus(), 100);

      if (!data.emailSent) {
        setSuccessMsg('Demo mode: no SMTP configured. Check server console for the code.');
      } else {
        setSuccessMsg(`Verification code sent to ${trimmedEmail}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: verify OTP ────────────────────────────────────────────────────────
  // codeOverride lets handleOtpChange pass the freshly-built string directly,
  // bypassing the stale-closure problem where otp state hasn't updated yet.
  const handleVerifyOtp = async (e?: React.FormEvent, codeOverride?: string) => {
    if (e) e.preventDefault();

    const code = codeOverride ?? otp.join('');
    if (code.length < OTP_LENGTH) {
      setError('Please enter the full 6-digit code.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          otp: code,
          password,
          full_name: username.trim(),
          class_level: classLevel,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Verification failed.');

      setSuccessMsg('Account created! Please log in to continue.');
      setTimeout(() => {
        router.push('/login');
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
      // Wrong/expired code — clear the boxes and cue a shake rather than leaving the
      // rejected digits sitting there with only the banner above explaining why.
      setOtp(Array(OTP_LENGTH).fill(''));
      setShakeToken((t) => t + 1);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  // ── OTP box key handler ───────────────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1); // only last digit
    const next = [...otp];
    next[index] = digit;
    setOtp(next);

    // Auto-advance
    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all boxes filled — pass code directly to avoid stale state
    if (next.every((d) => d !== '') && digit) {
      handleVerifyOtp(undefined, next.join(''));
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
    // Focus last filled box
    const lastIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    otpRefs.current[lastIdx]?.focus();
    // Pass the freshly-built code directly — same stale-closure reason handleOtpChange
    // does this above: setOtp(next) hasn't re-rendered yet, so `otp` here is still the
    // pre-paste (empty) array. Calling handleVerifyOtp() with no args used exactly that
    // stale value and always failed with "enter the full 6-digit code" on a real paste.
    if (pasted.length === OTP_LENGTH) handleVerifyOtp(undefined, pasted);
  };

  // ── Shared layout wrapper ─────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-[#0c261e] bg-[url('/Backward_bg.png')] bg-cover bg-center overflow-hidden p-4 sm:p-6 lg:p-10 selection:bg-brand/20 selection:text-brand-dark text-navy">

      {/* Floating split card */}
      <div className="relative z-10 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 bg-surface rounded-[2rem] shadow-2xl shadow-black/40 border border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-500">

        {/* Left: form — capped at lg: so a long step (e.g. the full registration form)
            scrolls internally instead of growing the whole card past the viewport. */}
        <div className="w-full order-2 lg:order-1 flex items-center lg:items-start justify-center p-8 sm:p-12 lg:p-16 bg-surface lg:max-h-[90vh] lg:overflow-y-auto">
          <div className="w-full max-w-[380px]">

            {/* Logo — a plain brand mark, not a link: someone mid-form shouldn't be able to
                click it by mistake and lose what they've typed. */}
            <div className="flex items-center justify-center gap-4 mb-10 w-full">
              <SabaqLogoBadge size={56} />
              <h1 className="font-display text-4xl font-semibold tracking-tight text-navy">
                Sabaq<span className="text-brand">AI</span>
              </h1>
            </div>

            {/* ── STEP 1: Registration form ─────────────────────────────────── */}
            {step === 'form' && (
              <div className="animate-step-in">
                <div className="mb-8">
                  <h2 className="text-[28px] font-bold text-navy mb-2 tracking-tight">Create an account</h2>
                  <p className="text-[15px] text-navy-2 font-medium">Join us to continue your studies.</p>
                </div>

                {error && (
                  <div role="alert" aria-live="assertive" className="mb-6 flex items-start gap-2.5 rounded-xl border border-error/30 bg-error-bg p-3.5 text-sm text-error">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {successMsg && (
                  <div role="status" aria-live="polite" className="mb-6 flex items-start gap-2.5 rounded-xl border border-brand/30 bg-brand-mint p-3.5 text-sm text-brand-dark">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                <form className="space-y-4" onSubmit={handleSendOtp}>
                  <div>
                    <AuthField
                      icon={AtSign}
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      autoFocus
                      required
                      error={!!usernameError}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onBlur={() => setUsernameTouched(true)}
                      placeholder="Username"
                    />
                    {usernameError && (
                      <p className="mt-1.5 pl-1 text-[12px] text-error">{usernameError}</p>
                    )}
                  </div>

                  <div>
                    <AuthField
                      icon={Mail}
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      error={!!emailError}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => setEmailTouched(true)}
                      placeholder="Email"
                    />
                    {emailError && <p className="mt-1.5 pl-1 text-[12px] text-error">{emailError}</p>}
                  </div>

                  <div>
                    <AuthField
                      icon={Lock}
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
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

                  <div>
                    <AuthField
                      icon={Lock}
                      id="confirm-password"
                      name="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      error={confirmPassword.length > 0 && confirmPassword !== password}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      trailing={
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="text-text-3 hover:text-navy transition-colors focus:outline-none"
                          aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      }
                    />
                    {confirmPassword.length > 0 && confirmPassword !== password && (
                      <p className="mt-1.5 pl-1 text-[12px] text-error">Passwords do not match.</p>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-[13px] font-semibold text-navy-2">Which class are you in?</p>
                    <div className="grid grid-cols-4 gap-2">
                      {CLASS_LEVELS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setClassLevel(c)}
                          aria-pressed={classLevel === c}
                          className={`relative flex items-center justify-center rounded-xl border py-3 text-[15px] font-bold transition-colors duration-150 ${
                            classLevel === c
                              ? 'border-brand bg-accent-subtle text-brand-dark'
                              : 'border-border text-navy-2 hover:border-border-strong hover:bg-surface-hover'
                          }`}
                        >
                          {c}
                          {classLevel === c && (
                            <Check className="absolute top-1 right-1 w-3 h-3 text-brand" strokeWidth={3} />
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 pl-1 text-[12px] text-text-2">
                      We'll only show you content ingested for your class.
                    </p>
                  </div>

                  <button
                    type="submit"
                    id="signup-btn"
                    disabled={loading}
                    className="w-full cursor-pointer rounded-2xl bg-[linear-gradient(135deg,#185C43_0%,#237A57_55%,#2A8C82_100%)] px-4 py-3.5 text-[15px] font-bold text-white transition-all duration-300 shadow-[0_4px_14px_rgba(27,181,107,0.3)] hover:shadow-[0_8px_24px_rgba(27,181,107,0.4)] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none disabled:transform-none"
                  >
                    {loading ? 'Sending code...' : 'Create Account'}
                  </button>
                </form>

                <div className="mt-6">
                  <SocialAuthButtons providers={['google']} />
                </div>

                <div className="mt-8 text-center">
                  <p className="text-[14px] text-text-2">
                    Already have an account?{' '}
                    <Link href="/login" className="font-bold text-navy hover:text-brand transition-colors">
                      Log in
                    </Link>
                  </p>
                </div>
              </div>
            )}

            {/* ── STEP 2: OTP verification ──────────────────────────────────── */}
            {step === 'otp' && (
              <div className="animate-step-in">
                {/* Back button */}
                <button
                  type="button"
                  onClick={() => { setStep('form'); setError(null); setSuccessMsg(null); }}
                  className="mb-6 flex items-center gap-1.5 text-[13px] text-text-2 hover:text-brand transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>

                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand/10">
                      <ShieldCheck className="w-5 h-5 text-brand" />
                    </span>
                    <h2 className="text-[24px] font-bold text-navy tracking-tight">Check your email</h2>
                  </div>
                  <p className="text-[14px] text-navy-2 leading-relaxed">
                    We sent a 6-digit verification code to{' '}
                    <span className="font-semibold text-navy">{email}</span>
                  </p>
                </div>

                {error && (
                  <div role="alert" aria-live="assertive" className="mb-6 flex items-start gap-2.5 rounded-xl border border-error/30 bg-error-bg p-3.5 text-sm text-error">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {successMsg && (
                  <div role="status" aria-live="polite" className="mb-6 flex items-start gap-2.5 rounded-xl border border-brand/30 bg-brand-mint p-3.5 text-sm text-brand-dark">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                <form onSubmit={handleVerifyOtp}>
                  {/* 6-box OTP input — remounted on each rejected code (key={shakeToken})
                      so the shake animation genuinely replays rather than only firing once. */}
                  <div
                    key={shakeToken}
                    className={`flex gap-2.5 mb-6 ${shakeToken > 0 ? 'animate-shake' : ''}`}
                    onPaste={handleOtpPaste}
                    role="group"
                    aria-label="Verification code"
                  >
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => { otpRefs.current[i] = el; }}
                        id={`otp-${i}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
                        className={`w-full aspect-square text-center text-[1.375rem] font-bold rounded-xl border-2 transition-all duration-150 focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 caret-transparent ${
                          digit
                            ? 'bg-accent-subtle border-brand text-navy animate-digit-pop'
                            : 'bg-surface border-border-strong text-navy'
                        }`}
                        disabled={loading}
                      />
                    ))}
                  </div>

                  <button
                    type="submit"
                    id="verify-otp-btn"
                    disabled={loading || otp.some((d) => !d)}
                    className="w-full cursor-pointer rounded-2xl bg-[linear-gradient(135deg,#185C43_0%,#237A57_55%,#2A8C82_100%)] px-4 py-3.5 text-[15px] font-bold text-white transition-all duration-300 shadow-[0_4px_14px_rgba(27,181,107,0.3)] hover:shadow-[0_8px_24px_rgba(27,181,107,0.4)] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none disabled:transform-none"
                  >
                    {loading ? 'Verifying...' : 'Verify & Create Account'}
                  </button>
                </form>

                {/* Resend */}
                <div className="mt-5 text-center">
                  {resendCooldown > 0 ? (
                    <p className="text-[13px] text-text-2">
                      Resend code in <span className="font-semibold text-navy">{resendCooldown}s</span>
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendOtp()}
                      disabled={loading}
                      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:text-brand-dark transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Resend code
                    </button>
                  )}
                </div>

                <p className="mt-6 text-center text-[12px] text-text-2">
                  Code expires in 2 minutes
                </p>
              </div>
            )}

          </div>
        </div>

        {/* Right: brand panel with illustration */}
        <div className="hidden lg:flex order-1 lg:order-2 relative flex-col items-center justify-center p-10 bg-[linear-gradient(135deg,#185C43_0%,#237A57_55%,#2A8C82_100%)] overflow-hidden">
          {/* Decorative dot grid */}
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage: 'radial-gradient(circle, #FFFFFF 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          />
          {/* Decorative blurred orbs */}
          <div className="pointer-events-none absolute -top-16 -left-16 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-0 w-72 h-72 rounded-full bg-brand-dark/40 blur-3xl" />

          {/* Headline — changes by step */}
          <div className="relative z-10 mb-9 max-w-md text-center px-2">
            <h2 className="font-display text-[2.1rem] leading-[1.2] font-medium text-white tracking-tight">
              {step === 'form' ? (
                <>
                  <span className="block animate-fade-up" style={{ animationDelay: '0ms' }}>Start learning</span>
                  <span className="block animate-fade-up" style={{ animationDelay: '140ms' }}>the smart way.</span>
                </>
              ) : (
                <>
                  <span className="block animate-fade-up" style={{ animationDelay: '0ms' }}>One step</span>
                  <span className="block animate-fade-up" style={{ animationDelay: '140ms' }}>away.</span>
                </>
              )}
            </h2>
            <p
              className="mt-3 text-sm text-white/70 font-medium animate-fade-up"
              style={{ animationDelay: '300ms' }}
            >
              {step === 'form'
                ? 'Verified answers, real citations, zero guesswork.'
                : 'Enter the code we sent to your inbox to get started.'}
            </p>
          </div>

          {/* Floating illustration card */}
          <div
            className="relative z-10 mx-auto w-full max-w-md rounded-3xl bg-surface/95 backdrop-blur-sm shadow-2xl shadow-navy/30 border border-white/60 p-4 rotate-1 hover:rotate-0 transition-transform duration-500 animate-fade-up"
            style={{ animationDelay: '420ms' }}
          >
            <img
              src="/bg.png"
              alt="A student studying Physics, Chemistry and Maths with SabaqAI"
              className="w-full h-auto rounded-2xl"
            />
          </div>
        </div>

      </div>
    </div>
  );
}
