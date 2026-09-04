'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  Camera,
  GraduationCap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useScope } from '@/components/app/ScopeContext';
import type { Profile } from '@/lib/auth/get-current-user';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';

interface CurrentUser {
  id: string;
  email?: string;
  metadata?: { full_name?: string };
}

const CLASS_LEVELS = [9, 10, 11, 12];

// Mirrors the server-side check in /api/auth/profile — client-side copy exists only for
// immediate feedback, the server never trusts it.
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// Only one board exists today (see onboarding/page.tsx's own BOARDS array) — a real picker for
// a single legal value would be fake interactivity, so this is a static label, not a control.
const BOARD_NAME = 'Federal Board of Intermediate and Secondary Education';

type Theme = 'light' | 'dark';

// Downscales an image client-side before upload — keeps avatar files small and consistent
// without a server-side image-processing dependency. Server still enforces its own 2MB cap
// regardless (this can't be trusted as the only limit — a client can always be bypassed).
async function resizeImage(file: File, maxDim = 512, quality = 0.85): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file; // canvas unsupported — fall back to the original file untouched

  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) return file;

  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
}

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

// A labeled field + its own Save button + its own saving/error/success trio — the shape every
// independently-saveable field below uses, so username/class/subjects don't share state (and
// can't silently re-submit each other) the way the old single "Save profile" button did.
function FieldRow({
  label,
  saving,
  error,
  success,
  successMessage,
  onSave,
  saveDisabled,
  children,
}: {
  label: string;
  saving: boolean;
  error: string | null;
  success: boolean;
  successMessage: string;
  onSave: () => void;
  saveDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold text-text-3 uppercase tracking-wide mb-1.5">{label}</p>
      {children}
      {error && <div className="mt-2"><InlineBanner kind="error">{error}</InlineBanner></div>}
      {success && <div className="mt-2"><InlineBanner kind="success">{successMessage}</InlineBanner></div>}
      <button
        type="button"
        onClick={onSave}
        disabled={saving || saveDisabled}
        className="mt-2.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand hover:bg-brand-dark disabled:bg-disabled disabled:text-disabled-text transition-colors"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  // Renamed on import — this file already has its own local `classLevel`/`setClassLevel` for
  // the form input, distinct from ScopeContext's "active scope" class level that Ask/Quiz/
  // Syllabus/Chat/Dashboard actually read from (see setScopeClassLevel's use in saveClass).
  const { updateProfile, setClassLevel: setScopeClassLevel } = useScope();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [board, setBoard] = useState('');

  // Username
  const [username, setUsername] = useState('');
  // What was actually loaded from the server — lets the validation error below distinguish
  // "you edited this into something invalid" from "this is old data you haven't touched yet."
  // Real accounts can have a pre-existing display_name that doesn't satisfy today's stricter
  // username format (e.g. a full name with a space, saved before this format was enforced
  // everywhere) — showing a scary red error the instant that field is merely clicked into and
  // blurred, with zero edits, was a real reported bug.
  const [originalUsername, setOriginalUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameSaveError, setUsernameSaveError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState(false);

  // Class level
  const [classLevel, setClassLevel] = useState<number | null>(null);
  const [classSaving, setClassSaving] = useState(false);
  const [classError, setClassError] = useState<string | null>(null);
  const [classSuccess, setClassSuccess] = useState(false);

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/auth/user')
      .then((res) => res.json())
      .then((data) => {
        setUser(data.user ?? null);
        const profile: Profile | null = data.profile ?? null;
        if (profile) {
          setUsername(profile.username || '');
          setOriginalUsername(profile.username || '');
          setClassLevel(profile.classLevel ?? null);
          setBoard(profile.board || '');
          setAvatarUrl(profile.avatarUrl ?? null);
        }
      })
      .catch(() => setUser(null));

    const stored = window.localStorage.getItem('sabaqai-theme') as Theme | null;
    setTheme(stored ?? 'light');
  }, []);

  const usernameChanged = username.trim() !== originalUsername.trim();
  const usernameInvalid = username.trim().length > 0 && !USERNAME_RE.test(username.trim());
  // Only surfaced once they've actually edited the field into something invalid — a
  // pre-existing value that already violates today's format (see originalUsername's comment)
  // stays quiet until they touch it, instead of greeting them with an error for data they
  // never typed.
  const usernameError = usernameTouched && usernameChanged && usernameInvalid
    ? 'Username must be 3-20 characters — letters, numbers and underscores only.'
    : null;

  const uploadAvatar = async (file: File) => {
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const resized = await resizeImage(file);
      const form = new FormData();
      form.append('file', resized);
      const res = await fetch('/api/auth/avatar', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      setAvatarUrl(data.avatarUrl);
      updateProfile({ avatarUrl: data.avatarUrl });
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not upload image.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const saveUsername = async () => {
    setUsernameSaving(true);
    setUsernameSaveError(null);
    setUsernameSuccess(false);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save your username.');
      setOriginalUsername(username.trim());
      updateProfile({ username: username.trim() });
      setUsernameSuccess(true);
      setTimeout(() => setUsernameSuccess(false), 3000);
    } catch (err) {
      setUsernameSaveError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setUsernameSaving(false);
    }
  };

  const saveClass = async () => {
    setClassSaving(true);
    setClassError(null);
    setClassSuccess(false);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classLevel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save your class.');
      if (classLevel) {
        updateProfile({ classLevel });
        // This is the value Ask/Quiz/Syllabus/Chat/Dashboard actually query and display —
        // updateProfile alone only updates the "your account says class X" display value, not
        // the active scope everything else in the app is filtered by. Saving a new class here
        // should mean "browse as this class" immediately, not just after a reload.
        setScopeClassLevel(classLevel);
      }
      setClassSuccess(true);
      setTimeout(() => setClassSuccess(false), 3000);
    } catch (err) {
      setClassError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setClassSaving(false);
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
      <SectionCard title="Profile" description="Your photo, username, class, and board.">
        {user ? (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              {/* Clickable avatar — triggers hidden file input */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                aria-label="Change profile picture"
                className="relative h-14 w-14 rounded-full flex-shrink-0 group focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt="Profile picture"
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-brand-mint text-brand-dark flex items-center justify-center text-base font-bold">
                    {(username || user.email || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
                  {avatarUploading ? (
                    <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 text-white" />
                  )}
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadAvatar(file);
                  e.target.value = ''; // allow re-selecting same file
                }}
              />
              <div className="min-w-0">
                <p className="text-xs text-text-2 truncate">{user.email}</p>
                <p className="text-[11px] text-text-3 mt-0.5">Click photo to change</p>
              </div>
            </div>
            {avatarError && <InlineBanner kind="error">{avatarError}</InlineBanner>}

            <FieldRow
              label="Username"
              saving={usernameSaving}
              error={usernameSaveError}
              success={usernameSuccess}
              successMessage="Username saved."
              onSave={saveUsername}
              saveDisabled={usernameInvalid || !username.trim() || !usernameChanged}
            >
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
            </FieldRow>

            <FieldRow
              label="Class"
              saving={classSaving}
              error={classError}
              success={classSuccess}
              successMessage="Class saved."
              onSave={saveClass}
              saveDisabled={!classLevel}
            >
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
            </FieldRow>

            <div>
              <p className="text-[10px] font-bold text-text-3 uppercase tracking-wide mb-1.5">Board</p>
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/40 px-3.5 py-2.5">
                <GraduationCap className="w-4 h-4 text-text-3 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy">{board || 'FBISE'}</p>
                  <p className="text-[11px] text-text-3 truncate">{BOARD_NAME} — more boards coming soon</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-2">You're not signed in — settings here apply to this device only.</p>
        )}
      </SectionCard>


      {/* Appearance */}
      <SectionCard title="Appearance">
        <div className="inline-flex rounded-xl border border-border bg-surface-2/60 p-1 gap-1">
          <button
            type="button"
            onClick={() => applyTheme('light')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              theme === 'light' ? 'bg-brand text-white' : 'text-text-2 hover:text-navy'
            }`}
          >
            <Sun className="w-3.5 h-3.5" /> Light
          </button>
          <button
            type="button"
            onClick={() => applyTheme('dark')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              theme === 'dark' ? 'bg-brand text-white' : 'text-text-2 hover:text-navy'
            }`}
          >
            <Moon className="w-3.5 h-3.5" /> Dark
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
                  disabled={passwordSaving || !currentPassword || newPassword.length < 8 || newPassword !== confirmNewPassword}
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
