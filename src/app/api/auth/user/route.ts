import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';

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

    // Real board/class/subjects, read with the service-role client — same reasoning as
    // retrieval (src/lib/supabase/admin.ts): a student's own session can hit RLS gaps, and this
    // is what ScopeContext hydrates from, so it needs to be reliable, not best-effort.
    let profile: { board: string; classLevel: number; examDate: string | null; subjects: string[] } | null = null;
    const admin = getServiceRoleClient();
    if (admin) {
      const { data: profileRow } = await admin
        .from('student_profiles')
        .select('board_code, class_level, exam_date')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileRow) {
        const { data: subjectRows } = await admin
          .from('student_subjects')
          .select('subject_code')
          .eq('user_id', user.id);

        profile = {
          board: profileRow.board_code,
          classLevel: profileRow.class_level,
          examDate: profileRow.exam_date,
          subjects: (subjectRows ?? []).map((r) => r.subject_code),
        };
      }
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        metadata: user.user_metadata,
      },
      profile,
      configured: true,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, configured: false }, { status: 500 });
  }
}
