import { NextResponse } from 'next/server';
import { getCurrentUserAndProfile } from '@/lib/auth/get-current-user';

export async function GET() {
  try {
    const result = await getCurrentUserAndProfile();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message, configured: false }, { status: 500 });
  }
}
