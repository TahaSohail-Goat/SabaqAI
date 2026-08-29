'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import AuthField from '@/components/AuthField';
import SabaqLogoBadge from '@/components/SabaqLogoBadge';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
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
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password.');

      setDone(true);
      // Auto-redirect to login after a short pause
      setTimeout(() => router.push('/login'), 2500);
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

        {!done ? (
          <>
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand/10">
                  <ShieldCheck className="w-5 h-5 text-brand" />
                </span>
                <h2 className="text-[24px] font-bold text-navy tracking-tight">Set new password</h2>
              </div>
              <p className="text-[14px] text-text-2 leading-relaxed">
                Choose a strong password for your SabaqAI account.
              </p>
            </div>

            {error && (
              <div role="alert" aria-live="assertive" className="mb-5 flex items-start gap-2.5 rounded-xl border border-error/30 bg-error-bg p-3.5 text-sm text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
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
                <p className="mt-1.5 pl-1 text-[12px] text-text-3">Must be at least 6 characters.</p>
              </div>

              <AuthField
                icon={Lock}
                id="confirm-password"
                name="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                required
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
          </>
        ) : (
          /* ── Success state ── */
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
        )}

      </div>
    </div>
  );
}
