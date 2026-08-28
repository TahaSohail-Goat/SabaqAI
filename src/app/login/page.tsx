'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, AlertCircle, CheckCircle2, BookOpen } from 'lucide-react';

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
    <div className="relative min-h-screen w-full bg-navy flex items-center justify-center p-6 selection:bg-brand/30 selection:text-brand-mint">
      
      {/* PNG Background */}
      <div 
        className="absolute inset-0 z-0 bg-[url('/bg.png')] bg-cover bg-center bg-no-repeat opacity-80"
      >
        {/* Optional overlay to ensure form readability if the image is too bright */}
        <div className="absolute inset-0 bg-navy/20 backdrop-blur-[2px]"></div>
      </div>

      {/* Centered Login Form */}
      <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
        
        {/* Logo above the form */}
        <Link href="/" className="flex items-center justify-center gap-3 mb-8 transition-transform hover:scale-105">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-white shadow-lg border border-white/10">
            <BookOpen className="w-6 h-6" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-md">
            Sabaq<span className="text-brand-mint">AI</span>
          </h1>
        </Link>

        {/* Form Card */}
        <div className="bg-surface/10 backdrop-blur-2xl border border-white/20 rounded-3xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.5)] relative overflow-hidden">
          {/* Subtle inner reflection */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
          
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Welcome back</h2>
            <p className="text-sm text-text-2">Sign in to keep studying from your board syllabus.</p>
          </div>

          {error && (
            <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-[#e82a47]/30 bg-[#e82a47]/10 p-3.5 text-sm text-[#ff6b81]">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-brand/30 bg-brand/10 p-3.5 text-sm text-brand-mint">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-text-2">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                className="block w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-text-4 focus:border-brand-mint focus:outline-none focus:ring-1 focus:ring-brand-mint transition-all shadow-inner"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-text-2">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="block w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-text-4 focus:border-brand-mint focus:outline-none focus:ring-1 focus:ring-brand-mint transition-all shadow-inner"
              />
            </div>

            <button
              type="submit"
              id="login-btn"
              disabled={loading}
              className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3.5 text-sm font-semibold text-white transition-all hover:bg-brand-light hover:shadow-[0_0_20px_rgba(27,181,107,0.4)] disabled:bg-white/10 disabled:text-text-4 disabled:hover:shadow-none"
            >
              {loading ? 'Signing in...' : 'Sign in'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/10 text-center">
            <p className="text-sm text-text-3">
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="font-semibold text-brand-mint transition-colors hover:text-white">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

