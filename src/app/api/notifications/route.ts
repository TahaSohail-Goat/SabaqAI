import { NextRequest, NextResponse } from 'next/server';
import {
  applyNotificationAction, notificationActionSchema, notificationContext,
  notificationErrorResponse, NotificationError, readNotificationInbox, notificationQuerySchema,
} from '@/lib/notifications/server';

export async function GET(req: NextRequest) {
  try {
    const context = await notificationContext();
    const parsed = notificationQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) throw new NotificationError('Choose a valid view, category, search (up to 100 characters) and non-negative offset below 100000.', 400);
    return NextResponse.json(await readNotificationInbox(context, parsed.data), { headers: { 'Cache-Control': 'private, no-store' } });
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
