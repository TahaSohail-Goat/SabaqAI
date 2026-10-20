'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useScope } from './ScopeContext';
import type { NotificationActionRequest, NotificationInboxResponse, NotificationPreferences } from '@/lib/types';

interface NotificationState {
  data: NotificationInboxResponse | null;
  loading: boolean;
  refreshing: boolean;
  busy: boolean;
  error: string | null;
  refresh: (sync?: boolean) => Promise<void>;
  act: (action: NotificationActionRequest) => Promise<boolean>;
  savePreferences: (preferences: NotificationPreferences) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationState | null>(null);

export async function fetchNotificationJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: 'no-store' });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('Could not reach notifications. Check your connection and try again.');
  }
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error('Notifications returned an unreadable response. Please try again.'); }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error : 'Could not load notifications. Try again.';
    throw new Error(message);
  }
  return payload as T;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useScope();
  const identity = `${user?.id ?? ''}:${profile?.board ?? ''}:${profile?.classLevel ?? ''}:${profile?.subjects.join(',') ?? ''}`;
  const identityRef = useRef(identity);
  const dataIdentity = useRef(identity);
  identityRef.current = identity;
  const pathname = usePathname();
  const [data, setData] = useState<NotificationInboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  const refresh = useCallback(async (sync = false) => {
    if (!user || busyRef.current) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setRefreshing(true);
    try {
      if (sync) await fetchNotificationJson('/api/notifications/sync', { method: 'POST', signal: controller.signal });
      const result = await fetchNotificationJson<NotificationInboxResponse>('/api/notifications', { signal: controller.signal });
      if (identityRef.current === identity && !controller.signal.aborted) { dataIdentity.current = identity; setData(result); setError(null); }
    } catch (err) {
      if (identityRef.current === identity && !controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Could not load notifications. Check your connection.');
      }
    } finally {
      if (identityRef.current === identity && requestRef.current === controller) { setLoading(false); setRefreshing(false); }
    }
  }, [identity, user]);

  useEffect(() => {
    dataIdentity.current = identity;
    setData(null); setError(null); setLoading(Boolean(user));
    return () => { requestRef.current?.abort(); };
  }, [identity, user]);

  useEffect(() => {
    if (!user) return;
    void refresh(true);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(true); };
    const interval = window.setInterval(onVisible, 60_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      requestRef.current?.abort();
    };
  }, [pathname, refresh, user]);

  const mutate = useCallback(async (url: string, body: NotificationActionRequest | NotificationPreferences, sync: boolean) => {
    if (!user || busyRef.current) return false;
    busyRef.current = true; setBusy(true); requestRef.current?.abort();
    try {
      const result = await fetchNotificationJson<{ preferences?: NotificationPreferences }>(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (identityRef.current !== identity) return false;
      const preferences = result.preferences;
      if (preferences) setData(value => value ? { ...value, preferences } : value);
      busyRef.current = false;
      await refresh(sync);
      return true;
    } catch (err) {
      if (identityRef.current === identity) setError(err instanceof Error ? err.message : 'Could not update notifications.');
      return false;
    } finally {
      busyRef.current = false;
      if (identityRef.current === identity) setBusy(false);
    }
  }, [identity, refresh, user]);

  return <NotificationContext.Provider value={{ data: dataIdentity.current === identity ? data : null,
    loading: loading || Boolean(user && dataIdentity.current !== identity), refreshing, busy, error, refresh,
    act: action => mutate('/api/notifications', action, false),
    savePreferences: preferences => mutate('/api/notifications/preferences', preferences, true),
  }}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('Notifications must be used inside NotificationProvider.');
  return context;
}
