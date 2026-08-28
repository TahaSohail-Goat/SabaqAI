'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
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
        body: JSON.stringify({ email, password }),
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
    <div className="relative min-h-screen bg-page text-navy">
      {/* Full-page background artwork, shown at full strength — the card anchors left over it */}
      <img
        src="/assets/auth-illustration.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />

      <div className="relative flex min-h-screen items-center justify-start px-4 py-12 sm:px-10 lg:px-20">
        <div className="w-full max-w-md space-y-6">
          <Link href="/" className="block text-center text-3xl font-bold tracking-tight">
            <span className="text-navy">Sabaq</span>
            <span className="text-brand">AI</span>
          </Link>

          <div className="space-y-5 rounded-card border border-border bg-surface px-6 py-8 shadow-[0_8px_24px_rgba(16,42,58,0.08)] sm:px-10">
            <div className="space-y-1 text-center">
              <h2 className="text-xl font-bold text-navy">Welcome back</h2>
              <p className="text-sm text-text-2">Sign in to keep studying from your board syllabus.</p>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-lg border border-error/30 bg-error-bg p-3 text-xs text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="flex items-start gap-2.5 rounded-lg border border-brand/30 bg-brand-mint p-3 text-xs text-brand-dark">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-navy">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@example.com"
                  className="mt-1.5 block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy placeholder:text-text-3 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand transition"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-navy">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1.5 block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy placeholder:text-text-3 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand transition"
                />
              </div>

              <button
                type="submit"
                id="login-btn"
                disabled={loading}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:bg-disabled disabled:text-disabled-text"
              >
                {loading ? 'Signing in...' : 'Sign in'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            <div className="border-t border-border pt-4 text-center">
              <p className="text-sm text-text-2">
                Don&apos;t have an account?{' '}
                <Link href="/signup" className="font-semibold text-brand transition hover:text-brand-dark">
                  Create one
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
