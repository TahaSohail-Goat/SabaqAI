import { NextRequest, NextResponse } from 'next/server';
import {
  applyNotificationAction, notificationActionSchema, notificationContext,
  notificationErrorResponse, NotificationError, readNotificationInbox,
} from '@/lib/notifications/server';

export async function GET(req: NextRequest) {
  try {
    const context = await notificationContext();
    const rawOffset = req.nextUrl.searchParams.get('offset') ?? '0';
    if (!/^\d{1,5}$/.test(rawOffset)) throw new NotificationError('Offset must be a non-negative integer below 100000.', 400);
    const unread = req.nextUrl.searchParams.get('unread');
    if (unread !== null && unread !== 'true' && unread !== 'false') throw new NotificationError('Unread must be true or false.', 400);
    return NextResponse.json(await readNotificationInbox(context, Number(rawOffset), unread === 'true'), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return notificationErrorResponse(error); }
}

export async function PATCH(req: NextRequest) {
  try {
    const context = await notificationContext();
    const parsed = notificationActionSchema.safeParse(await req.json());
    if (!parsed.success) throw new NotificationError('Choose a valid notification action and notification id.', 400);
    await applyNotificationAction(context, parsed.data);
    return NextResponse.json({ success: true });
  } catch (error) { return notificationErrorResponse(error); }
}
