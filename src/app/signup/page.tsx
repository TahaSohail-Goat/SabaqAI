'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserPlus, ArrowRight, AlertCircle, CheckCircle2, ShieldCheck, GraduationCap } from 'lucide-react';

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

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xl shadow-sm">
            سبق
          </div>
          <span className="text-2xl font-bold tracking-tight text-white">Sabaq AI</span>
        </Link>
        <h2 className="text-xl font-semibold text-slate-100">Create your student account</h2>
        <p className="text-xs text-slate-400">
          Personalized syllabus filter for Punjab Board (PCTB)
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900/90 border border-slate-800 py-8 px-6 shadow-xl rounded-2xl sm:px-10 space-y-6">
          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-lg flex items-start gap-2.5 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-lg flex items-start gap-2.5 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="fullName" className="block text-xs font-medium text-slate-300">
                Full Name
              </label>
              <div className="mt-1">
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ali Khan"
                  className="block w-full rounded-lg bg-slate-950 border border-slate-700/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-medium text-slate-300">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ali.khan@example.com"
                  className="block w-full rounded-lg bg-slate-950 border border-slate-700/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="board" className="block text-xs font-medium text-slate-300">
                  Education Board
                </label>
                <div className="mt-1">
                  <select
                    id="board"
                    name="board"
                    value={board}
                    onChange={(e) => setBoard(e.target.value)}
                    className="block w-full rounded-lg bg-slate-950 border border-slate-700/80 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="PCTB">Punjab (PCTB)</option>
                    <option value="FBISE">Federal (FBISE)</option>
                    <option value="Sindh">Sindh Board</option>
                    <option value="KPK">KPK Board</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="classLevel" className="block text-xs font-medium text-slate-300">
                  Class / Grade
                </label>
                <div className="mt-1">
                  <select
                    id="classLevel"
                    name="classLevel"
                    value={classLevel}
                    onChange={(e) => setClassLevel(Number(e.target.value))}
                    className="block w-full rounded-lg bg-slate-950 border border-slate-700/80 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value={9}>Class 9 (Matric)</option>
                    <option value={10}>Class 10 (Matric)</option>
                    <option value={11}>Class 11 (FSc)</option>
                    <option value={12}>Class 12 (FSc)</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-slate-300">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="block w-full rounded-lg bg-slate-950 border border-slate-700/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                id="signup-btn"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 transition cursor-pointer"
              >
                {loading ? 'Creating account...' : 'Create student account'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>

          <div className="pt-2 border-t border-slate-800 text-center">
            <p className="text-xs text-slate-400">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-emerald-400 hover:text-emerald-300 transition">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
