import type { SupabaseClient } from '@supabase/supabase-js';

// auth.users isn't exposed over PostgREST, so "does this email exist" has to scan the
// admin user list rather than query a table directly. Shared by send-otp (reject a
// duplicate signup) and forgot-password (only send a reset code to a real account,
// without ever revealing to the caller whether the account exists).
//
// Fine at this project's scale; the thing to revisit once it stops being fine is a real
// user-count problem, not a hypothetical one — flagged here rather than silently ignored.
export async function findUserByEmail(admin: SupabaseClient, email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    console.error('findUserByEmail: listUsers failed:', error.message);
    return { user: null, error };
  }
  const key = email.toLowerCase();
  const user = data.users.find((u) => u.email?.toLowerCase() === key) ?? null;
  return { user, error: null };
}
