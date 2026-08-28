'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Mail,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import AuthField from '@/components/AuthField';
import SabaqLogoBadge from '@/components/SabaqLogoBadge';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to sign in.');
      }

      setSuccessMsg(data.message || 'Successfully signed in! Redirecting...');
      setTimeout(() => {
        router.push('/');
      }, 800);
    } catch (err: any) {
      setError(err.message || 'An error occurred during sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center bg-[#0c261e] bg-[url('/Backward_bg.png')] bg-cover bg-center overflow-hidden p-4 sm:p-6 lg:p-10 selection:bg-brand/20 selection:text-brand-dark text-navy"
    >

      {/* Floating split card */}
      <div className="relative z-10 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 bg-surface rounded-[2rem] shadow-2xl shadow-black/40 border border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-500">

        {/* Left: brand panel with illustration */}
        <div className="hidden lg:flex relative flex-col items-center justify-center p-10 bg-[linear-gradient(135deg,#185C43_0%,#237A57_55%,#2A8C82_100%)] overflow-hidden">
          {/* Decorative dot grid */}
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage: 'radial-gradient(circle, #FFFFFF 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          />
          {/* Decorative blurred orbs */}
          <div className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-0 w-72 h-72 rounded-full bg-brand-dark/40 blur-3xl" />

          {/* Headline */}
          <div className="relative z-10 mb-9 max-w-md text-center px-2">
            <h2 className="font-display text-[2.1rem] leading-[1.2] font-medium text-white tracking-tight">
              <span className="block animate-fade-up" style={{ animationDelay: '0ms' }}>
                Pick up right where
              </span>
              <span className="block animate-fade-up" style={{ animationDelay: '140ms' }}>
                you left off.
              </span>
            </h2>
            <p
              className="mt-3 text-sm text-white/70 font-medium animate-fade-up"
              style={{ animationDelay: '300ms' }}
            >
              Ask, revise and practice — grounded in your exact textbook.
            </p>
          </div>

          {/* Floating illustration card */}
          <div
            className="relative z-10 mx-auto w-full max-w-md rounded-3xl bg-surface/95 backdrop-blur-sm shadow-2xl shadow-navy/30 border border-white/60 p-4 -rotate-1 hover:rotate-0 transition-transform duration-500 animate-fade-up"
            style={{ animationDelay: '420ms' }}
          >
            <img
              src="/bg.png"
              alt="A student studying Physics, Chemistry and Maths with SabaqAI"
              className="w-full h-auto rounded-2xl"
            />
          </div>
        </div>

        {/* Right: form */}
        <div className="w-full flex items-center justify-center p-8 sm:p-12 lg:p-16 bg-surface">
          <div className="w-full max-w-[380px]">

            {/* Logo */}
            <Link href="/" className="flex items-center justify-center gap-4 mb-10 w-full transition-transform hover:opacity-80">
              <SabaqLogoBadge size={56} />
              <h1 className="font-display text-4xl font-semibold tracking-tight text-navy">
                Sabaq<span className="text-brand">AI</span>
              </h1>
            </Link>

            {/* Header */}
            <div className="mb-8">
              <h2 className="text-[28px] font-bold text-navy mb-2 tracking-tight">Welcome back</h2>
              <p className="text-[15px] text-text-2 font-medium">Log in to continue your studies.</p>
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

            <form className="space-y-4" onSubmit={handleSubmit}>

              <AuthField
                icon={Mail}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
              />

              <AuthField
                icon={Lock}
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
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

              {/* Forgot Password */}
              <div className="flex justify-end pt-1 pb-2">
                <a href="#" className="text-[13px] font-semibold text-text-3 hover:text-brand transition-colors">
                  Forgot password?
                </a>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                id="login-btn"
                disabled={loading}
                className="w-full cursor-pointer rounded-2xl bg-[linear-gradient(135deg,#185C43_0%,#237A57_55%,#2A8C82_100%)] px-4 py-3.5 text-[15px] font-bold text-white transition-all duration-300 shadow-[0_4px_14px_rgba(27,181,107,0.3)] hover:shadow-[0_8px_24px_rgba(27,181,107,0.4)] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none disabled:transform-none"
              >
                {loading ? 'Logging in...' : 'Log in'}
              </button>
            </form>

            {/* Create Account Link */}
            <div className="mt-8 text-center">
              <p className="text-[14px] text-text-3">
                New here?{' '}
                <Link href="/signup" className="font-bold text-navy hover:text-brand transition-colors">
                  Create an account
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
