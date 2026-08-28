'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import AuthSidePanel from '@/components/ui/auth-side-panel';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [classLevel, setClassLevel] = useState(10);
  const [board, setBoard] = useState('PCTB');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName) {
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
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
          class_level: classLevel,
          board,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create account.');
      }

      setSuccessMsg(data.message || 'Account created successfully! Redirecting to study app...');
      setTimeout(() => {
        router.push('/');
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'An error occurred during signup.');
    } finally {
      setLoading(false);
    }
  };

  const inputClasses =
    'mt-1.5 block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-navy placeholder:text-text-3 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand transition';

  return (
    <div className="min-h-screen bg-page text-navy flex flex-col lg:flex-row">
      {/* Narrow windows: banner stacked above the form; desktop: full-height side panel */}
      <AuthSidePanel className="h-56 w-full lg:hidden" position="object-top" />
      <AuthSidePanel className="hidden lg:block lg:w-[55%]" />

      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-1 text-center lg:text-left">
            <h2 className="text-2xl font-bold text-navy">Create your account</h2>
            <p className="text-sm text-text-2">
              Answers grounded in your actual board syllabus — with page citations.
            </p>
          </div>

          <div className="space-y-5 rounded-card border border-border bg-surface px-6 py-8 shadow-[0_8px_24px_rgba(16,42,58,0.08)] sm:px-10">
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
                <label htmlFor="fullName" className="block text-sm font-medium text-navy">
                  Full Name
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ali Khan"
                  className={inputClasses}
                />
              </div>

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
                  placeholder="ali.khan@example.com"
                  className={inputClasses}
                />
              </div>

              {/* Board/class options are limited to rows that exist in the boards and
                  class_levels tables — the UI never offers what the schema can't back. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="board" className="block text-sm font-medium text-navy">
                    Education Board
                  </label>
                  <select
                    id="board"
                    name="board"
                    value={board}
                    onChange={(e) => setBoard(e.target.value)}
                    className={inputClasses}
                  >
                    <option value="PCTB">Punjab (PCTB)</option>
                    <option value="FBISE">Federal (FBISE)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="classLevel" className="block text-sm font-medium text-navy">
                    Class / Grade
                  </label>
                  <select
                    id="classLevel"
                    name="classLevel"
                    value={classLevel}
                    onChange={(e) => setClassLevel(Number(e.target.value))}
                    className={inputClasses}
                  >
                    <option value={9}>Class 9 (Matric)</option>
                    <option value={10}>Class 10 (Matric)</option>
                    <option value={11}>Class 11 (FSc)</option>
                    <option value={12}>Class 12 (FSc)</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-navy">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className={inputClasses}
                />
              </div>

              <button
                type="submit"
                id="signup-btn"
                disabled={loading}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:bg-disabled disabled:text-disabled-text"
              >
                {loading ? 'Creating account...' : 'Create student account'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            <div className="border-t border-border pt-4 text-center">
              <p className="text-sm text-text-2">
                Already have an account?{' '}
                <Link href="/login" className="font-semibold text-brand transition hover:text-brand-dark">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
