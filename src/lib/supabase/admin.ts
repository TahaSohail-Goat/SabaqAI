// Service-role Supabase client. SERVER ONLY — this key bypasses Row Level Security.
//
// Never import this into a client component, and never expose the key through a NEXT_PUBLIC_ var.
//
// Why retrieval uses it: the RLS policy on `content_chunks` requires a matching
// `student_profiles` row. With the anon key and no such row, every vector query returns zero rows,
// the guardrail correctly refuses, and the app refuses EVERY question with no error anywhere
// explaining why. Textbook chunks are not sensitive data — the board/class/subject filter in the
// query is what enforces correctness. RLS stays on for qa_log, quizzes and quiz_attempts, where it
// protects actual student records.
//
// See docs/setup.md ("Known traps") and docs/rag-architecture.md.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/** Returns null when credentials are absent, so callers can degrade instead of crashing. */
export function getServiceRoleClient(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Same client, but throws with a clear message. Use in scripts, where failing loudly is right. */
export function requireServiceRoleClient(): SupabaseClient {
  const client = getServiceRoleClient();
  if (!client) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'in .env.local. See docs/setup.md step 2.'
    );
  }
  return client;
}
