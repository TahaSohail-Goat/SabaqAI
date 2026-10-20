import { NextResponse } from 'next/server';
import { notificationContext, notificationErrorResponse, syncNotifications } from '@/lib/notifications/server';

// Explicit POST: opening/refreshing the inbox may create idempotent event receipts.
// GET stays read-only. No scheduled worker or answer-generation call is involved.
export async function POST() {
  try {
    await syncNotifications(await notificationContext());
    return NextResponse.json({ success: true });
  } catch (error) { return notificationErrorResponse(error); }
}
