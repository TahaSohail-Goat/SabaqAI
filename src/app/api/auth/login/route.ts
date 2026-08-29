// POST /api/auth/login
//
// Authenticates a user with email + password via Supabase Auth.
// The @supabase/ssr server client writes the session into HttpOnly cookies
// on the response automatically — the browser stores them and sends them
// on every subsequent request, where middleware refreshes them.
//
// Refusals are HTTP 200 (wrong password, unverified email). Only genuine
// server failures are 4xx/5xx — matching the project convention.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Human-readable overrides for common Supabase Auth error codes so the UI
// doesn't show raw backend messages to students.
const ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Incorrect email or password. Please try again.',
  'Email not confirmed':
    'Please verify your email address before logging in. Check your inbox for a confirmation link.',
  'Too many requests': 'Too many login attempts. Please wait a moment and try again.',
  'User not found': 'No account found with that email address.',
};

function friendlyError(raw: string): string {
  for (const [key, msg] of Object.entries(ERROR_MESSAGES)) {
    if (raw.includes(key)) return msg;
  }
  return raw;
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // Demo mode — Supabase not configured in .env.local yet
    if (!supabase) {
      return NextResponse.json({
        success: true,
        user: {
          id: 'demo-user-101',
          email,
          user_metadata: {
            full_name: 'Pakistani Matric Student',
            class_level: 10,
            board: 'FBISE',
          },
        },
        message:
          'Logged in (Demo Mode — configure Supabase keys in .env.local for real auth)',
        isDemo: true,
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      console.error('Login auth error:', error.code, error.message);
      return NextResponse.json(
        { error: friendlyError(error.message) },
        { status: 400 }
      );
    }

    // Session is set in cookies by the @supabase/ssr client automatically.
    // Return the user so the UI can display a personalised greeting.
    return NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        metadata: data.user.user_metadata,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('Login error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
