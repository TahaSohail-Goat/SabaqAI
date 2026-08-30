// Real password change. Requires the current password, verified via a real sign-in attempt
// (not just trusting the active session) before the admin API is used to set the new one —
// the same defense-in-depth reasoning as requiring it on any other "change my credentials"
// flow: a hijacked or left-open session shouldn't be enough on its own.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';

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

    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || typeof currentPassword !== 'string') {
      return NextResponse.json({ error: 'Your current password is required.' }, { status: 400 });
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json({ error: 'New password must be at least 6 characters.' }, { status: 400 });
    }

    // A throwaway anon client, used only to verify the current password — its own session is
    // discarded immediately, this never touches the browser's actual logged-in session.
    const verifyClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { error: verifyError } = await verifyClient.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (verifyError) {
      return NextResponse.json({ error: 'Your current password is incorrect.' }, { status: 400 });
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password: newPassword });
    if (updateError) {
      console.error('Change password: updateUserById failed:', updateError.message);
      return NextResponse.json({ error: 'Could not update your password. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Change password error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
