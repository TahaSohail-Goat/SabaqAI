'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import AuthField from '@/components/AuthField';
import SabaqLogoBadge from '@/components/SabaqLogoBadge';

type Step = 'form' | 'otp';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_S = 60;

export default function SignupPage() {
  const router = useRouter();

  // ── Form fields ─────────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // ── OTP state ────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('form');
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const otpRefs = useRef<Array<HTMLInputElement | null>>(Array(OTP_LENGTH).fill(null));
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    const trimmedName = fullName.trim();

    if (!trimmedEmail || !password || !trimmedName) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password should be at least 6 characters long.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password, full_name: trimmedName }),
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
          full_name: fullName.trim(),
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
    if (pasted.length === OTP_LENGTH) handleVerifyOtp();
  };

  // ── Shared layout wrapper ─────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-[#0c261e] bg-[url('/Backward_bg.png')] bg-cover bg-center overflow-hidden p-4 sm:p-6 lg:p-10 selection:bg-brand/20 selection:text-brand-dark text-navy">

      {/* Floating split card */}
      <div className="relative z-10 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 bg-surface rounded-[2rem] shadow-2xl shadow-black/40 border border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-500">

        {/* Left: form */}
        <div className="w-full order-2 lg:order-1 flex items-center justify-center p-8 sm:p-12 lg:p-16 bg-surface">
          <div className="w-full max-w-[380px]">

            {/* Logo */}
            <Link href="/" className="flex items-center justify-center gap-4 mb-10 w-full transition-transform hover:opacity-80">
              <SabaqLogoBadge size={56} />
              <h1 className="font-display text-4xl font-semibold tracking-tight text-navy">
                Sabaq<span className="text-brand">AI</span>
              </h1>
            </Link>

            {/* ── STEP 1: Registration form ─────────────────────────────────── */}
            {step === 'form' && (
              <>
                <div className="mb-8">
                  <h2 className="text-[28px] font-bold text-navy mb-2 tracking-tight">Create an account</h2>
                  <p className="text-[15px] text-text-2 font-medium">Join us to continue your studies.</p>
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
                  <AuthField
                    icon={User}
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    autoFocus
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full Name"
                  />

                  <AuthField
                    icon={Mail}
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                  />

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
                    <p className="mt-1.5 pl-1 text-[12px] text-text-3">Must be at least 6 characters.</p>
                  </div>

                  <button
                    type="submit"
                    id="signup-btn"
                    disabled={loading}
                    className="w-full cursor-pointer rounded-2xl bg-[linear-gradient(135deg,#185C43_0%,#237A57_55%,#2A8C82_100%)] px-4 py-3.5 text-[15px] font-bold text-white transition-all duration-300 shadow-[0_4px_14px_rgba(27,181,107,0.3)] hover:shadow-[0_8px_24px_rgba(27,181,107,0.4)] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none disabled:transform-none"
                  >
                    {loading ? 'Sending code...' : 'Continue with Email'}
                  </button>
                </form>

                <div className="mt-8 text-center">
                  <p className="text-[14px] text-text-3">
                    Already have an account?{' '}
                    <Link href="/login" className="font-bold text-navy hover:text-brand transition-colors">
                      Log in
                    </Link>
                  </p>
                </div>
              </>
            )}

            {/* ── STEP 2: OTP verification ──────────────────────────────────── */}
            {step === 'otp' && (
              <>
                {/* Back button */}
                <button
                  type="button"
                  onClick={() => { setStep('form'); setError(null); setSuccessMsg(null); }}
                  className="mb-6 flex items-center gap-1.5 text-[13px] text-text-3 hover:text-brand transition-colors"
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
                  <p className="text-[14px] text-text-2 leading-relaxed">
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
                  {/* 6-box OTP input */}
                  <div
                    className="flex gap-2.5 mb-6"
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
                        className="w-full aspect-square text-center font-bold rounded-xl transition-all duration-150 focus:outline-none caret-transparent"
                        style={{
                          fontSize: '1.375rem',
                          background: digit ? '#f0fdf4' : '#ffffff',
                          border: `2px solid ${digit ? '#237A57' : '#c5d3cd'}`,
                          color: '#102A3A',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.border = '2px solid #237A57';
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(35,122,87,0.15)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.border = `2px solid ${e.currentTarget.value ? '#237A57' : '#c5d3cd'}`;
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
                        }}
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
                    <p className="text-[13px] text-text-3">
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

                <p className="mt-6 text-center text-[12px] text-text-3">
                  Code expires in 10 minutes
                </p>
              </>
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
