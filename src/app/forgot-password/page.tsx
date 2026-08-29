'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Mail, ArrowLeft } from 'lucide-react';
import AuthField from '@/components/AuthField';
import SabaqLogoBadge from '@/components/SabaqLogoBadge';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) { setError('Please enter your email address.'); return; }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-[#0c261e] bg-[url('/Backward_bg.png')] bg-cover bg-center overflow-hidden p-4 sm:p-6 lg:p-10 selection:bg-brand/20 selection:text-brand-dark text-navy">
      <div className="relative z-10 w-full max-w-md bg-surface rounded-[2rem] shadow-2xl shadow-black/40 border border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-500 p-8 sm:p-12">

        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-3 mb-10 w-full hover:opacity-80 transition-opacity">
          <SabaqLogoBadge size={44} />
          <span className="font-display text-3xl font-semibold tracking-tight text-navy">
            Sabaq<span className="text-brand">AI</span>
          </span>
        </Link>

        {!sent ? (
          <>
            <div className="mb-8">
              <h2 className="text-[26px] font-bold text-navy mb-2 tracking-tight">Reset your password</h2>
              <p className="text-[14px] text-text-2 leading-relaxed">
                Enter the email address you signed up with. We&apos;ll send you a link to reset your password.
              </p>
            </div>

            {error && (
              <div role="alert" aria-live="assertive" className="mb-5 flex items-start gap-2.5 rounded-xl border border-error/30 bg-error-bg p-3.5 text-sm text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="Email address"
              />

              <button
                type="submit"
                id="send-reset-btn"
                disabled={loading}
                className="w-full cursor-pointer rounded-2xl bg-[linear-gradient(135deg,#185C43_0%,#237A57_55%,#2A8C82_100%)] px-4 py-3.5 text-[15px] font-bold text-white transition-all duration-300 shadow-[0_4px_14px_rgba(27,181,107,0.3)] hover:shadow-[0_8px_24px_rgba(27,181,107,0.4)] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none disabled:transform-none"
              >
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>
          </>
        ) : (
          /* ── Success state ── */
          <div className="text-center py-4">
            <div className="flex items-center justify-center mb-5">
              <span className="flex items-center justify-center w-16 h-16 rounded-2xl bg-brand/10">
                <CheckCircle2 className="w-8 h-8 text-brand" />
              </span>
            </div>
            <h2 className="text-[22px] font-bold text-navy mb-3 tracking-tight">Check your inbox</h2>
            <p className="text-[14px] text-text-2 leading-relaxed mb-2">
              If <span className="font-semibold text-navy">{email}</span> is registered, we&apos;ve sent a password reset link to it.
            </p>
            <p className="text-[13px] text-text-3">
              The link expires in 1 hour. Check your spam folder if you don&apos;t see it.
            </p>
          </div>
        )}

        {/* Back to login */}
        <div className="mt-8 flex justify-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-text-3 hover:text-brand transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to log in
          </Link>
        </div>

      </div>
    </div>
  );
}
