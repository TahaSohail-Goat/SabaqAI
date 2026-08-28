import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    if (!supabase) {
      // Demo / simulated mode if Supabase credentials are not yet entered in .env
      return NextResponse.json({
        success: true,
        user: {
          id: 'demo-user-101',
          email,
          user_metadata: { full_name: 'Pakistani Matric Student', class_level: 10, board: 'FBISE' },
        },
        message: 'Logged in (Demo Mode - configure Supabase keys in .env for production database auth)',
        isDemo: true,
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      user: data.user,
      session: data.session,
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
