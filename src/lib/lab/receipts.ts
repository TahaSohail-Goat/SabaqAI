import { getServiceRoleClient } from '../supabase/admin';
import type { LabResponse } from '../types';
import { LabFailure } from './contracts';

export interface LabReceiptStore {
  claim(owner: string, id: string, hash: string, signal: AbortSignal): Promise<LabResponse | null>;
  finish(owner: string, id: string, hash: string, response: LabResponse): Promise<void>;
}
export function labReceiptStore(): LabReceiptStore {
  const db = getServiceRoleClient();
  if (!db) throw new LabFailure('Concept Lab needs Supabase configuration.');
  return {
    async claim(owner, id, hash, signal) {
      const { data, error } = await db.rpc('claim_lab_request', { p_owner: owner, p_request: id, p_hash: hash }).abortSignal(signal);
      if (error || !Array.isArray(data) || data.length !== 1) throw new LabFailure('Concept Lab needs migration 0025 and a running database. See PHYSICS_LAB_DEMO.md.');
      const entry = data[0] as { outcome: string; cached_response: LabResponse | null };
      if (entry.outcome === 'cached' && entry.cached_response) return entry.cached_response;
      if (entry.outcome === 'claimed') return null;
      if (entry.outcome === 'limited') throw new LabFailure('Please wait before starting another lab request.', 429, true);
      throw new LabFailure(entry.outcome === 'conflict' ? 'This request ID was already used with different settings.' : 'This request is already being processed. Wait for it to finish.', 409, true);
    },
    async finish(owner, id, hash, response) {
      const { error } = await db.from('lab_request_receipts').update({ response, active_until: new Date().toISOString() })
        .eq('owner_id', owner).eq('request_id', id).eq('input_hash', hash).is('response', null).abortSignal(AbortSignal.timeout(5000));
      if (error) throw new LabFailure('The request receipt could not be saved. Restart this request after checking the local database.', 503, true);
    },
  };
}
