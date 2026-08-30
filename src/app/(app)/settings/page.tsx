'use client';

import React, { useEffect, useState } from 'react';
import {
  AtSign,
  Lock,
  Trash2,
  LogOut,
  Sun,
  Moon,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useScope } from '@/components/app/ScopeContext';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';
import { SUBJECTS } from '@/lib/subjects';

interface CurrentUser {
  id: string;
  email?: string;
  metadata?: { full_name?: string };
}

interface ProfileData {
  username: string;
  classLevel: number;
  examDate: string | null;
}

const CLASS_LEVELS = [9, 10, 11, 12];

// Mirrors the server-side check in /api/auth/profile — client-side copy exists only for
// immediate feedback, the server never trusts it.
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

type Theme = 'light' | 'dark';

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border/60 rounded-2xl p-5 sm:p-6 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-navy">{title}</h3>
        {description && <p className="text-xs text-text-2 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function InlineBanner({ kind, children }: { kind: 'error' | 'success'; children: React.ReactNode }) {
  const isError = kind === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${
        isError ? 'border-error/30 bg-error-bg text-error' : 'border-brand/30 bg-brand-mint text-brand-dark'
      }`}
    >
      {isError ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { subject, language, setSubject, setLanguage } = useScope();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);

  // Profile form
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [classLevel, setClassLevel] = useState<number | null>(null);
  const [examDate, setExamDate] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/auth/user')
      .then((res) => res.json())
      .then((data) => {
        setUser(data.user ?? null);
        const profile: (ProfileData & { subjects?: string[] }) | null = data.profile ?? null;
        if (profile) {
          setUsername(profile.username || '');
          setClassLevel(profile.classLevel ?? null);
          setExamDate(profile.examDate || '');
        }
      })
      .catch(() => setUser(null));

    const stored = window.localStorage.getItem('sabaqai-theme') as Theme | null;
    setTheme(stored ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  }, []);

  const usernameError = usernameTouched && username.trim() && !USERNAME_RE.test(username.trim())
    ? 'Username must be 3-20 characters — letters, numbers and underscores only.'
    : null;

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileError(null);
    setProfileSuccess(false);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), classLevel, examDate: examDate || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save your profile.');
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setProfileSaving(false);
    }
  };

  const applyTheme = (next: Theme) => {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    window.localStorage.setItem('sabaqai-theme', next);
  };

  // Change password
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const resetPasswordForm = () => {
    setShowPasswordForm(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordError(null);
  };

  const changePassword = async () => {
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not change your password.');
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => {
        setShowPasswordForm(false);
        setPasswordSuccess(false);
      }, 2000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setPasswordSaving(false);
    }
  };

  // Delete account — hard delete, immediate, no grace period (confirmed intentional).
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete your account.');
      router.push('/signup');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Something went wrong.');
      setDeleting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Profile */}
      <SectionCard title="Profile" description="Your username, class, and exam date.">
        {user ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-brand-mint text-brand-dark flex items-center justify-center text-sm font-bold flex-shrink-0">
                {(username || user.email || '?').charAt(0).toUpperCase()}
              </div>
              <p className="text-xs text-text-2 truncate">{user.email}</p>
            </div>

            {profileError && <InlineBanner kind="error">{profileError}</InlineBanner>}
            {profileSuccess && <InlineBanner kind="success">Profile saved.</InlineBanner>}

            <div>
              <p className="text-[10px] font-bold text-text-3 uppercase tracking-wide mb-1.5">Username</p>
              <div className="relative">
                <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 pointer-events-none" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={() => setUsernameTouched(true)}
                  className={`w-full rounded-xl border bg-surface-2/60 pl-10 pr-3.5 py-2.5 text-sm text-navy focus:bg-surface focus:outline-none focus:ring-2 transition-all ${
                    usernameError ? 'border-error focus:border-error focus:ring-error/20' : 'border-border focus:border-brand focus:ring-brand/20'
                  }`}
                />
              </div>
              {usernameError && <p className="mt-1.5 text-[11px] text-error">{usernameError}</p>}
            </div>

            <div>
              <p className="text-[10px] font-bold text-text-3 uppercase tracking-wide mb-2">Class</p>
              <div className="flex flex-wrap gap-2">
                {CLASS_LEVELS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setClassLevel(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      classLevel === c ? 'bg-brand text-white border-brand' : 'bg-surface-2 text-navy-2 border-border hover:border-brand/40'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-text-3 uppercase tracking-wide mb-1.5">Exam date (optional)</p>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-2/60 px-3.5 py-2.5 text-sm text-navy focus:bg-surface focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition-all"
              />
            </div>

            <button
              type="button"
              onClick={saveProfile}
              disabled={profileSaving || !!usernameError || !username.trim() || !classLevel}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-brand hover:bg-brand-dark disabled:bg-disabled disabled:text-disabled-text transition-colors"
            >
              {profileSaving ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-text-2">You're not signed in — settings here apply to this device only.</p>
        )}
      </SectionCard>

      {/* Active subject */}
      <SectionCard title="Active subject" description="Which subject Ask and Quiz focus on right now — you're enrolled in all your subjects, this just picks which one is active.">
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((s) => (
            <button
              key={s.code}
              type="button"
              onClick={() => setSubject(s.code)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                subject === s.code
                  ? 'bg-brand text-white border-brand'
                  : 'bg-surface-2 text-navy-2 border-border hover:border-brand/40'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Appearance */}
      <SectionCard title="Appearance">
        <div className="inline-flex rounded-xl border border-border bg-surface-2/60 p-1 gap-1">
          <button
            type="button"
            onClick={() => applyTheme('light')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              theme === 'light' ? 'bg-surface text-navy shadow-sm' : 'text-text-2 hover:text-navy'
            }`}
          >
            <Sun className="w-3.5 h-3.5" /> Light
          </button>
          <button
            type="button"
            onClick={() => applyTheme('dark')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              theme === 'dark' ? 'bg-surface text-navy shadow-sm' : 'text-text-2 hover:text-navy'
            }`}
          >
            <Moon className="w-3.5 h-3.5" /> Dark
          </button>
        </div>
      </SectionCard>

      {/* Language */}
      <SectionCard title="Language" description="Affects Ask input expectations and text direction.">
        <div className="inline-flex rounded-xl border border-border bg-surface-2/60 p-1 gap-1">
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              language === 'en' ? 'bg-surface text-navy shadow-sm' : 'text-text-2 hover:text-navy'
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLanguage('ur')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              language === 'ur' ? 'bg-surface text-navy shadow-sm' : 'text-text-2 hover:text-navy'
            }`}
          >
            اردو
          </button>
        </div>
      </SectionCard>

      {/* Account */}
      <SectionCard title="Account">
        <div className="space-y-2.5">
          {/* Change password */}
          {!showPasswordForm ? (
            <button
              type="button"
              onClick={() => setShowPasswordForm(true)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-surface-2/40 text-navy-2 text-xs font-semibold hover:border-brand/40 hover:bg-surface-hover transition-colors"
            >
              <span className="flex items-center gap-2"><Lock className="w-3.5 h-3.5" /> Change password</span>
            </button>
          ) : (
            <div className="space-y-2.5 rounded-xl border border-border p-4">
              {passwordError && <InlineBanner kind="error">{passwordError}</InlineBanner>}
              {passwordSuccess && <InlineBanner kind="success">Password updated.</InlineBanner>}

              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 pointer-events-none" />
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-2/60 pl-10 pr-10 py-2.5 text-sm text-navy focus:bg-surface focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-navy"
                  aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 pointer-events-none" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-2/60 pl-10 pr-10 py-2.5 text-sm text-navy focus:bg-surface focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-navy"
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <PasswordStrengthMeter password={newPassword} />
              </div>

              <input
                type={showNewPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className={`w-full rounded-xl border bg-surface-2/60 px-3.5 py-2.5 text-sm text-navy focus:bg-surface focus:outline-none focus:ring-2 transition-all ${
                  confirmNewPassword.length > 0 && confirmNewPassword !== newPassword
                    ? 'border-error focus:border-error focus:ring-error/20'
                    : 'border-border focus:border-brand focus:ring-brand/20'
                }`}
              />

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={changePassword}
                  disabled={passwordSaving || !currentPassword || newPassword.length < 6 || newPassword !== confirmNewPassword}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand hover:bg-brand-dark disabled:bg-disabled disabled:text-disabled-text transition-colors"
                >
                  {passwordSaving ? 'Saving...' : 'Update password'}
                </button>
                <button
                  type="button"
                  onClick={resetPasswordForm}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-navy-2 hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Delete account */}
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-surface-2/40 text-error text-xs font-semibold hover:border-error/40 hover:bg-error-bg transition-colors"
            >
              <span className="flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> Delete account &amp; data</span>
            </button>
          ) : (
            <div className="space-y-2.5 rounded-xl border border-error/30 bg-error-bg p-4">
              <p className="text-xs font-semibold text-error leading-relaxed">
                This permanently deletes your account and everything tied to it — profile, quizzes, question history. This cannot be undone.
              </p>
              {deleteError && <InlineBanner kind="error">{deleteError}</InlineBanner>}
              <input
                type="password"
                placeholder="Enter your password to confirm"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full rounded-xl border border-error/40 bg-surface px-3.5 py-2.5 text-sm text-navy focus:border-error focus:ring-2 focus:ring-error/20 focus:outline-none transition-all"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={deleteAccount}
                  disabled={deleting || !deletePassword}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-error hover:bg-error/90 disabled:opacity-50 transition-colors"
                >
                  {deleting ? 'Deleting...' : 'Yes, permanently delete my account'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletePassword('');
                    setDeleteError(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-navy-2 hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {user && (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-error/30 bg-error-bg text-error text-xs font-semibold hover:bg-error/10 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
