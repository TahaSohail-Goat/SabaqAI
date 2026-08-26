import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { email, password, full_name, class_level = 10, board = 'PCTB' } = await req.json();

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
          user_metadata: { full_name: full_name || 'Student', class_level, board },
        },
        message: 'Signed up in Demo Mode (Supabase keys not yet configured in .env)',
        isDemo: true,
      });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          class_level,
          board,
        },
      },
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
    console.error('Signup error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
