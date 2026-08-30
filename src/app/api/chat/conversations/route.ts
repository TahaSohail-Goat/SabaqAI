import { NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { listConversations } from '@/lib/chat/persist';

export async function GET() {
  const { user } = await getCurrentUserAndProfile();
  const admin = getServiceRoleClient();
  if (!user || !admin) {
    return NextResponse.json({ error: 'You need to be logged in.' }, { status: 401 });
  }

  const conversations = await listConversations(admin, user.id);
  return NextResponse.json({ conversations });
}
