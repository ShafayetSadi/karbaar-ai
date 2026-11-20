import type { TFunction } from 'i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';

// The adjust endpoints take no idempotency key: callers disable their form while a call is in
// flight and never retry on their own, so a double submit can't add stock twice.

/** One variant's stock change, recorded as a movement with its reason and note. */
export function adjustOne(
  variantId: string,
  delta: number,
  {
    reason = 'manual_adjust',
    note = null,
  }: { reason?: 'manual_adjust' | 'initial'; note?: string | null } = {},
) {
  return call(() =>
    api.POST('/v1/inventory/variants/{variant_id}/adjust', {
      params: { path: { variant_id: variantId } },
      body: { delta, reason, note },
    }),
  );
}

/** Several variants' changes with one shared note, all or nothing. */
export function adjustMany(items: { variant_id: string; delta: number }[], note: string | null) {
  return call(() => api.POST('/v1/inventory/adjustments', { body: { items, note } }));
}

/**
 * The message for a change that would take stock below zero, or undefined for any other error.
 * `many` is for an all-or-nothing change across several variants.
 */
export function insufficientMessage(error: ApiError, t: TFunction, many = false) {
  if (error.code !== 'INSUFFICIENT_STOCK') return undefined;
  return t(many ? 'stock.insufficientAll' : 'stock.insufficient');
}
