'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, AlertCircle, CheckCircle2, BookOpen } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="relative min-h-screen w-full flex items-center justify-center p-6 selection:bg-brand/30 selection:text-brand-mint">
      
      {/* PNG Background */}
      <div 
        className="absolute inset-0 z-0 bg-[url('/bg.png')] bg-cover bg-center bg-no-repeat"
      >
      </div>

      {/* Centered Signup Form */}
      <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
        
        {/* Logo above the form */}
        <Link href="/" className="flex items-center justify-center gap-3 mb-8 transition-transform hover:scale-105">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-white shadow-lg border border-white/10">
            <BookOpen className="w-6 h-6" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-navy drop-shadow-sm">
            Sabaq<span className="text-brand">AI</span>
          </h1>
        </Link>

        {/* Form Card */}
        <div className="bg-white/60 backdrop-blur-xl border border-white/50 rounded-3xl p-8 shadow-xl relative overflow-hidden">
          {/* Subtle inner reflection */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"></div>
          
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-navy mb-2">Create your account</h2>
            <p className="text-sm text-navy-2">
              Grounded answers from your board syllabus, with page citations.
            </p>
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

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label htmlFor="fullName" className="block text-sm font-medium text-navy">Full Name</label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ali Khan"
                className="block w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-navy placeholder:text-text-3 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand transition-all shadow-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-navy">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                className="block w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-navy placeholder:text-text-3 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand transition-all shadow-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-navy">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="block w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-navy placeholder:text-text-3 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand transition-all shadow-sm"
              />
            </div>

            <button
              type="submit"
              id="signup-btn"
              disabled={loading}
              className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3.5 text-sm font-semibold text-white transition-all hover:bg-brand-dark disabled:bg-border disabled:text-text-3 disabled:hover:shadow-none"
            >
              {loading ? 'Creating account...' : 'Create student account'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-border/50 text-center">
            <p className="text-sm text-navy-2">
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-brand transition-colors hover:text-brand-dark">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
