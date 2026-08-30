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
//  - Only real JPEG/PNG/WEBP images are accepted, verified by magic bytes — not just the
//    client-supplied Content-Type string, which is trivially spoofable (e.g. an SVG carrying
//    an embedded <script>, mislabeled as image/png, previously would have passed and been
//    served publicly from this bucket).

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';
import { getServiceRoleClient } from '@/lib/supabase/admin';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

interface ImageFormat {
  ext: string;
  /** True if `bytes`' magic number matches this format. */
  matches: (bytes: Uint8Array) => boolean;
}

const ALLOWED_FORMATS: Record<string, ImageFormat> = {
  'image/jpeg': { ext: 'jpg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', matches: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/webp': {
    ext: 'webp',
    // RIFF....WEBP — bytes 0-3 are "RIFF", bytes 8-11 are "WEBP" (4-7 are a file-size field).
    matches: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
};

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

    const format = ALLOWED_FORMATS[file.type];
    if (!format) {
      return NextResponse.json({ error: 'Only JPEG, PNG, or WEBP images are accepted.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Image must be 2 MB or smaller.' }, { status: 413 });
    }

    const bytes = new Uint8Array(arrayBuffer);
    if (!format.matches(bytes)) {
      return NextResponse.json(
        { error: 'That file does not look like a valid image. Please try a different file.' },
        { status: 400 }
      );
    }

    // Store as avatars/<user_id>/avatar.<ext> — a fixed path per user so re-uploading
    // replaces the file in place (no orphaned objects accumulate in the bucket). Extension
    // comes from the validated format, never the client-supplied filename.
    const storagePath = `${user.id}/avatar.${format.ext}`;

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
