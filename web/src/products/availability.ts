import { parseCount } from '../i18n/format';
import type { ProductType } from './presets';

/**
 * How a product is sold (ADR 0022). `pre_order` and `made_to_order` differ only in the wording the
 * customer hears; the lead time is the days until the item is ready to hand to delivery.
 */
export const AVAILABILITIES = ['in_stock', 'pre_order', 'made_to_order'] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const MAX_LEAD_TIME_DAYS = 120;

export interface AvailabilityDraft {
  availability: Availability;
  /** Lead time as typed; both blank means none. */
  min: string;
  max: string;
  /** Limit how many can be ordered (only offered when not in stock). */
  track: boolean;
}

export const IN_STOCK_DRAFT: AvailabilityDraft = {
  availability: 'in_stock',
  min: '',
  max: '',
  track: true,
};

export interface AvailabilityFields {
  availability: Availability;
  lead_time_days_min: number | null;
  lead_time_days_max: number | null;
  track_inventory: boolean;
}

export type AvailabilityProblem = 'leadRequired' | 'leadBoth' | 'leadInvalid' | 'leadOrder';

type Checked =
  | { ok: true; value: AvailabilityFields }
  | { ok: false; problem: AvailabilityProblem };

/** Types whose merchants usually sell before the goods exist: the section starts open for them. */
export function opensAvailability(type: ProductType): boolean {
  return type === 'food' || type === 'pre_order_import';
}

/** Pick a mode for a new product's draft; never overwrites a mode the merchant chose. */
export function chooseAvailability(
  draft: AvailabilityDraft,
  availability: Availability,
): AvailabilityDraft {
  // Stock products always track; pre-order and made-to-order default to untracked (no fake stock).
  return {
    ...draft,
    availability,
    track:
      availability === 'in_stock' ? true : draft.availability === 'in_stock' ? false : draft.track,
  };
}

export function draftOfProduct(product: {
  availability: string;
  lead_time_days_min: number | null;
  lead_time_days_max: number | null;
  track_inventory: boolean;
}): AvailabilityDraft {
  return {
    availability: (AVAILABILITIES as readonly string[]).includes(product.availability)
      ? (product.availability as Availability)
      : 'in_stock',
    min: product.lead_time_days_min?.toString() ?? '',
    max: product.lead_time_days_max?.toString() ?? '',
    track: product.track_inventory,
  };
}

/** Validate the draft the way the API will, so a merchant sees the problem next to the field. */
export function checkAvailability(draft: AvailabilityDraft): Checked {
  const minText = draft.min.trim();
  const maxText = draft.max.trim();
  const notStock = draft.availability !== 'in_stock';
  if (!minText && !maxText) {
    if (notStock) return { ok: false, problem: 'leadRequired' };
    return {
      ok: true,
      value: { ...fields(draft), lead_time_days_min: null, lead_time_days_max: null },
    };
  }
  if (!minText || !maxText) return { ok: false, problem: 'leadBoth' };
  const min = parseCount(minText);
  const max = parseCount(maxText);
  if (min === null || max === null || max > MAX_LEAD_TIME_DAYS) {
    return { ok: false, problem: 'leadInvalid' };
  }
  if (min > max) return { ok: false, problem: 'leadOrder' };
  return {
    ok: true,
    value: { ...fields(draft), lead_time_days_min: min, lead_time_days_max: max },
  };
}

function fields(draft: AvailabilityDraft) {
  return {
    availability: draft.availability,
    track_inventory: draft.availability === 'in_stock' ? true : draft.track,
  };
}

/** "15–20" or "2" for a lead time; null without one. */
export function leadTimeRange(min: number | null, max: number | null): string | null {
  if (min === null || max === null) return null;
  return min === max ? String(min) : `${min}–${max}`;
}
