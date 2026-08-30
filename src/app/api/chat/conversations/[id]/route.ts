import { NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { getConversation, deleteConversation } from '@/lib/chat/persist';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const { user } = await getCurrentUserAndProfile();
  const admin = getServiceRoleClient();
  if (!user || !admin) {
    return NextResponse.json({ error: 'You need to be logged in.' }, { status: 401 });
  }

  const conversation = await getConversation(admin, id, user.id);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }
  return NextResponse.json(conversation);
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const { user } = await getCurrentUserAndProfile();
  const admin = getServiceRoleClient();
  if (!user || !admin) {
    return NextResponse.json({ error: 'You need to be logged in.' }, { status: 401 });
  }

  const deleted = await deleteConversation(admin, id, user.id);
  if (!deleted) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
