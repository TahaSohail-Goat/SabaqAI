// Hard account deletion — confirmed with the user as the intended behavior (immediate,
// permanent, no soft-delete/grace-period). Requires re-entering the password first, same
// verify-via-real-sign-in reasoning as /api/auth/change-password: an idle or hijacked session
// shouldn't be enough on its own to destroy the account.
//
// admin.auth.admin.deleteUser() removes the auth.users row, which cascades through
// users → student_profiles → student_subjects → quizzes → quiz_questions/quiz_attempts →
// everything else keyed off it (all "on delete cascade" — see supabase/migrations/0001_init.sql).
// One call, no manual table-by-table cleanup needed.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUserAndProfile();
    if (!user || !user.email) {
      return NextResponse.json({ error: 'You need to be logged in.' }, { status: 401 });
    }

    const admin = getServiceRoleClient();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!admin || !supabaseUrl || !anonKey) {
      return NextResponse.json({ error: 'Server is not configured for this yet.' }, { status: 500 });
    }

    const { password } = await req.json();
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Your password is required to confirm account deletion.' }, { status: 400 });
    }

    const verifyClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { error: verifyError } = await verifyClient.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (verifyError) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 400 });
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error('Delete account: deleteUser failed:', deleteError.message);
      return NextResponse.json({ error: 'Could not delete your account. Please try again.' }, { status: 500 });
    }

    // Same clearing mechanism /api/auth/logout already uses — the @supabase/ssr cookie
    // adapter, not a manual cookie-name guess. Still clears the browser's session cookies
    // correctly even though the underlying auth user is already gone.
    const supabase = await createServerSupabaseClient();
    if (supabase) await supabase.auth.signOut();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Delete account error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
