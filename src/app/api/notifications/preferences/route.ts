import { NextRequest, NextResponse } from 'next/server';
import {
  notificationContext, notificationErrorResponse, NotificationError,
  notificationPreferencesSchema, saveNotificationPreferences,
} from '@/lib/notifications/server';

export async function PATCH(req: NextRequest) {
  try {
    const context = await notificationContext();
    const parsed = notificationPreferencesSchema.safeParse(await req.json());
    if (!parsed.success) throw new NotificationError('Send all three notification preferences as true or false.', 400);
    await saveNotificationPreferences(context, parsed.data);
    return NextResponse.json({ preferences: parsed.data });
  } catch (error) { return notificationErrorResponse(error); }
}
