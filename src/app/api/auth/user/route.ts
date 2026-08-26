import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({
        user: null,
        configured: false,
        message: 'Supabase URL and Anon Key are not set in environment variables.',
      });
    }

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ user: null, configured: true });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        metadata: user.user_metadata,
      },
      configured: true,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, configured: false }, { status: 500 });
  }
}
