// POST /api/auth/avatar
// Accepts a multipart/form-data upload with a single "file" field.
// Stores the image in Supabase Storage (avatars/<user_id>/<filename>),
// then writes the public URL back to users.avatar_url.
// Returns { avatarUrl: string } on success.
//
// Invariants:
//  - Only the authenticated user can change their own avatar (service-role write, but
//    we verify the session first — the route never trusts a user_id from the request body).
//  - File is size-capped at 2 MB server-side before any upload happens.
//  - Only image/* MIME types are accepted.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUserAndProfile();
    if (!user) {
      return NextResponse.json({ error: 'You need to be logged in.' }, { status: 401 });
    }

    const admin = getServiceRoleClient();
    if (!admin) {
      return NextResponse.json({ error: 'Server is not configured for storage.' }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are accepted.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Image must be 2 MB or smaller.' }, { status: 413 });
    }

    // Store as avatars/<user_id>/avatar.<ext> — a fixed path per user so re-uploading
    // replaces the file in place (no orphaned objects accumulate in the bucket).
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const storagePath = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await admin.storage
      .from('avatars')
      .upload(storagePath, bytes, {
        contentType: file.type,
        upsert: true, // replace if exists
      });

    if (uploadError) {
      console.error('Avatar upload error:', uploadError.message);
      return NextResponse.json({ error: 'Could not upload image. Please try again.' }, { status: 500 });
    }

    const { data: urlData } = admin.storage.from('avatars').getPublicUrl(storagePath);
    const avatarUrl = urlData.publicUrl;

    // Bust any CDN cache by appending a cache-busting query param — Supabase Storage
    // serves the same path with the same URL even after upsert, so browsers would show
    // the old image until cache expires.
    const avatarUrlWithBust = `${avatarUrl}?t=${Date.now()}`;

    const { error: dbError } = await admin
      .from('users')
      .update({ avatar_url: avatarUrlWithBust })
      .eq('id', user.id);

    if (dbError) {
      console.error('Avatar DB write error:', dbError.message);
      return NextResponse.json({ error: 'Image uploaded but could not save the URL. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ avatarUrl: avatarUrlWithBust });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('Avatar route error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
