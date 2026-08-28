'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, BookOpen, User, Mail, Lock, Eye, EyeOff } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

      setSuccessMsg(data.message || 'Account created successfully! Redirecting...');
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
    <div className="min-h-screen w-full flex bg-[#0f1117] selection:bg-brand/30 selection:text-brand-mint text-white">
      
      {/* Left side: Image */}
      <div className="hidden lg:block lg:w-1/2 relative bg-navy">
        <div className="absolute inset-0 bg-[url('/bg.png')] bg-cover bg-center bg-no-repeat"></div>
        <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#0f1117] to-transparent"></div>
      </div>

      {/* Right side: Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 lg:p-24 relative">
        
        {/* Glowing orb */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-white/5 rounded-full blur-[60px] pointer-events-none"></div>

        <div className="w-full max-w-[400px] animate-in fade-in slide-in-from-bottom-4 duration-700">
          
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 mb-12 transition-transform hover:opacity-80">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-white shadow-[0_0_15px_rgba(27,181,107,0.3)] border border-brand-light/20 relative z-10">
              <BookOpen className="w-5 h-5" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md font-serif relative z-10">
              Sabaq<span className="text-brand-mint">AI</span>
            </h1>
          </Link>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-[28px] font-bold text-white mb-2 tracking-tight">Create an account</h2>
            <p className="text-[15px] text-text-3 font-medium">Join us to continue your studies.</p>
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
            
            {/* Full Name Input */}
            <div className="relative flex items-center group">
              <User className="absolute left-4 w-5 h-5 text-text-4 group-focus-within:text-brand transition-colors" />
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full Name"
                className="w-full rounded-[14px] border border-white/10 bg-[#1a1c23] pl-12 pr-4 py-3.5 text-[15px] text-white placeholder:text-text-4 focus:border-brand focus:bg-[#1f222a] focus:outline-none transition-all shadow-sm"
              />
            </div>

            {/* Email Input */}
            <div className="relative flex items-center group">
              <Mail className="absolute left-4 w-5 h-5 text-text-4 group-focus-within:text-brand transition-colors" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-[14px] border border-white/10 bg-[#1a1c23] pl-12 pr-4 py-3.5 text-[15px] text-white placeholder:text-text-4 focus:border-brand focus:bg-[#1f222a] focus:outline-none transition-all shadow-sm"
              />
            </div>

            {/* Password Input */}
            <div className="relative flex items-center group">
              <Lock className="absolute left-4 w-5 h-5 text-text-4 group-focus-within:text-brand transition-colors" />
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-[14px] border border-white/10 bg-[#1a1c23] pl-12 pr-12 py-3.5 text-[15px] text-white placeholder:text-text-4 focus:border-brand focus:bg-[#1f222a] focus:outline-none transition-all shadow-sm"
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 text-text-4 hover:text-white transition-colors focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Spacer */}
            <div className="pt-2"></div>

            {/* Submit Button */}
            <button
              type="submit"
              id="signup-btn"
              disabled={loading}
              className="w-full cursor-pointer rounded-[14px] bg-gradient-to-r from-brand to-brand-light px-4 py-3.5 text-[15px] font-bold text-white transition-all shadow-[0_0_20px_rgba(27,181,107,0.2)] hover:shadow-[0_0_30px_rgba(27,181,107,0.4)] hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-8 text-center">
            <p className="text-[14px] text-text-3">
              Already have an account?{' '}
              <Link href="/login" className="font-bold text-white hover:text-brand transition-colors">
                Log in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
