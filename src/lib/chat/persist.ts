// Persistence for /chat's conversations — chat_conversations/chat_messages
// (supabase/migrations/0008_chat_persistence.sql). All access here goes through the
// service-role client and an explicit ownership check; the tables have no RLS policies.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatTurn } from '../types';

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export async function listConversations(admin: SupabaseClient, userId: string): Promise<ConversationSummary[]> {
  const { data, error } = await admin
    .from('chat_conversations')
    .select('id, title, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Chat persist: listConversations failed:', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
}

export interface StoredMessage extends ChatTurn {
  id: string;
}

/** Verifies the conversation belongs to userId before returning anything — the same
 *  ownership-check reasoning as quiz's fetchAnswerKey (src/lib/quiz/persist.ts). */
export async function getConversation(
  admin: SupabaseClient,
  conversationId: string,
  userId: string
): Promise<{ title: string; messages: StoredMessage[] } | null> {
  const { data: conversation, error: convError } = await admin
    .from('chat_conversations')
    .select('id, title, user_id')
    .eq('id', conversationId)
    .maybeSingle();

  if (convError || !conversation || conversation.user_id !== userId) return null;

  const { data: rows, error: rowsError } = await admin
    .from('chat_messages')
    .select('id, role, content, attachment_name, attachment_mime_type')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (rowsError) {
    console.error('Chat persist: getConversation messages query failed:', rowsError.message);
    return null;
  }

  return {
    title: conversation.title,
    messages: (rows ?? []).map((r) => ({
      id: r.id,
      role: r.role as 'user' | 'model',
      text: r.content,
      attachmentName: r.attachment_name ?? undefined,
      attachmentMimeType: r.attachment_mime_type ?? undefined,
    })),
  };
}

/** Creates a new conversation titled from the first ~50 chars of the opening message —
 *  simple and free; asking Gemini to title it would be a reasonable upgrade later but isn't
 *  worth the extra call for v1. */
export async function createConversation(admin: SupabaseClient, userId: string, firstMessage: string): Promise<string | null> {
  const title = firstMessage.trim().slice(0, 50) || 'New chat';
  const { data, error } = await admin
    .from('chat_conversations')
    .insert({ user_id: userId, title })
    .select('id')
    .single();

  if (error || !data) {
    console.error('Chat persist: createConversation failed:', error?.message);
    return null;
  }
  return data.id;
}

export async function deleteConversation(admin: SupabaseClient, conversationId: string, userId: string): Promise<boolean> {
  const { error, count } = await admin
    .from('chat_conversations')
    .delete({ count: 'exact' })
    .eq('id', conversationId)
    .eq('user_id', userId);

  if (error) {
    console.error('Chat persist: deleteConversation failed:', error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

export interface NewMessage {
  role: 'user' | 'model';
  content: string;
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
}

/** Appends messages to a conversation and bumps its updated_at (for the sidebar's most-recent
 *  ordering) in one go. Ownership is the caller's responsibility here — this is only ever
 *  called right after getConversation/createConversation already established it. */
export async function appendMessages(admin: SupabaseClient, conversationId: string, messages: NewMessage[]): Promise<void> {
  const { error: insertError } = await admin.from('chat_messages').insert(
    messages.map((m) => ({
      conversation_id: conversationId,
      role: m.role,
      content: m.content,
      attachment_name: m.attachmentName ?? null,
      attachment_mime_type: m.attachmentMimeType ?? null,
    }))
  );
  if (insertError) {
    console.error('Chat persist: appendMessages failed:', insertError.message);
    return;
  }

  const { error: touchError } = await admin
    .from('chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);
  if (touchError) {
    console.error('Chat persist: updated_at touch failed:', touchError.message);
  }
}
