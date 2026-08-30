import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ACTIVITY_COOKIE_NAME, activityCookieOptions } from '@/lib/auth/session-activity';

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    (await cookies()).set(ACTIVITY_COOKIE_NAME, '', { ...activityCookieOptions(), maxAge: 0 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
