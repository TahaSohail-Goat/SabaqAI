'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Provider = 'google' | 'facebook';

function GoogleMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function FacebookMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
      />
    </svg>
  );
}

export default function SocialAuthButtons({
  providers = ['google', 'facebook'],
}: {
  providers?: Provider[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);

  const handleOAuth = async (provider: Provider) => {
    setError(null);
    const supabase = createClient();

    if (!supabase) {
      setError('Social sign-in needs Supabase configured in .env.local.');
      return;
    }

    setLoadingProvider(provider);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Without this, Google's default behavior is inconsistent about whether it shows the
        // account picker or silently reuses whatever session is already active — this makes it
        // always show the chooser when the browser has any signed-in Google account, matching
        // what most "Sign in with Google" buttons do. It still can't show a picker with nothing
        // in it: if no Google account is signed into the browser at all, Google falls back to
        // its manual sign-in form regardless of this setting — that part isn't ours to control.
        ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setLoadingProvider(null);
    }
    // On success Supabase navigates the browser away to the provider — nothing left to do here.
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-3">or continue with</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        {providers.includes('google') && (
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            disabled={loadingProvider !== null}
            aria-label="Continue with Google"
            className="h-12 w-12 rounded-full bg-white border border-border/60 flex items-center justify-center shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-60 disabled:pointer-events-none"
          >
            {loadingProvider === 'google' ? (
              <span className="h-4 w-4 rounded-full border-2 border-border-strong border-t-brand animate-spin" />
            ) : (
              <GoogleMark className="w-5 h-5" />
            )}
          </button>
        )}

        {providers.includes('facebook') && (
          <button
            type="button"
            onClick={() => handleOAuth('facebook')}
            disabled={loadingProvider !== null}
            aria-label="Continue with Facebook"
            className="h-12 w-12 rounded-full bg-white border border-border/60 flex items-center justify-center shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-60 disabled:pointer-events-none"
          >
            {loadingProvider === 'facebook' ? (
              <span className="h-4 w-4 rounded-full border-2 border-border-strong border-t-brand animate-spin" />
            ) : (
              <FacebookMark className="w-5 h-5" />
            )}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-center text-[12px] text-error">
          {error}
        </p>
      )}
    </div>
  );
}
