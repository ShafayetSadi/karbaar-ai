import { parseCount, parseTaka, toTakaInput } from '../i18n/format';
import type { ProductType } from './presets';

/**
 * Quantity rules and quantity (tier) prices (catalog plan C5). Pieces are counted per product,
 * all its variants together, so "minimum 6, sizes mixed" works. The API checks and applies all of
 * it in the quote; the form only helps the merchant type it and see problems early.
 */
export const MAX_PRICE_TIERS = 5;
export const MAX_ORDER_QUANTITY = 10_000;

export interface PriceTier {
  min_quantity: number;
  unit_price_minor: number;
}

/** One row of the tier table, as typed. */
export interface TierDraft {
  quantity: string;
  /** Taka. */
  price: string;
}

export interface QuantityDraft {
  min: string;
  /** Blank means no maximum. */
  max: string;
}

export interface QuantityFields {
  min_order_quantity: number;
  max_order_quantity: number | null;
}

export type QuantityProblem = 'minInvalid' | 'maxInvalid' | 'maxBelowMin';
export type TierProblem =
  | 'tierInvalid'
  | 'tierQuantity'
  | 'tierDuplicate'
  | 'tierNotBelow'
  | 'tierNotDescending'
  | 'tierTooMany';

export const NO_QUANTITY_RULES: QuantityDraft = { min: '1', max: '' };

/** Types often sold wholesale ("paikari"): the form offers "I sell wholesale" for them. */
export function offersWholesale(type: ProductType): boolean {
  return type === 'clothing' || type === 'beauty' || type === 'electronics';
}

export function quantityDraftOf(product: {
  min_order_quantity: number;
  max_order_quantity: number | null;
}): QuantityDraft {
  return {
    min: String(product.min_order_quantity),
    max: product.max_order_quantity === null ? '' : String(product.max_order_quantity),
  };
}

export function checkQuantity(
  draft: QuantityDraft,
): { ok: true; value: QuantityFields } | { ok: false; problem: QuantityProblem } {
  const minText = draft.min.trim();
  const min = minText ? parseCount(minText) : 1;
  if (min === null || min < 1 || min > MAX_ORDER_QUANTITY)
    return { ok: false, problem: 'minInvalid' };
  const maxText = draft.max.trim();
  if (!maxText) return { ok: true, value: { min_order_quantity: min, max_order_quantity: null } };
  const max = parseCount(maxText);
  if (max === null || max < 1 || max > MAX_ORDER_QUANTITY)
    return { ok: false, problem: 'maxInvalid' };
  if (max < min) return { ok: false, problem: 'maxBelowMin' };
  return { ok: true, value: { min_order_quantity: min, max_order_quantity: max } };
}

export function tierDraftsOf(tiers: PriceTier[]): TierDraft[] {
  return tiers.map((tier) => ({
    quantity: String(tier.min_quantity),
    price: toTakaInput(tier.unit_price_minor),
  }));
}

/**
 * Validate a tier table the way the API will. Blank rows are ignored. `priceMinor` is the normal
 * price every tier must be below (the lowest variant price when one table is shared); null skips
 * that check while the price itself is not valid yet.
 */
export function checkTiers(
  rows: TierDraft[],
  priceMinor: number | null,
): { ok: true; value: PriceTier[] } | { ok: false; problem: TierProblem } {
  const filled = rows.filter((row) => row.quantity.trim() || row.price.trim());
  if (filled.length > MAX_PRICE_TIERS) return { ok: false, problem: 'tierTooMany' };
  const tiers: PriceTier[] = [];
  for (const row of filled) {
    const quantity = parseCount(row.quantity);
    const price = parseTaka(row.price);
    if (quantity === null || price === null) return { ok: false, problem: 'tierInvalid' };
    if (quantity < 2 || quantity > MAX_ORDER_QUANTITY)
      return { ok: false, problem: 'tierQuantity' };
    tiers.push({ min_quantity: quantity, unit_price_minor: price });
  }
  tiers.sort((a, b) => a.min_quantity - b.min_quantity);
  for (const [index, tier] of tiers.entries()) {
    const before = tiers[index - 1];
    if (before?.min_quantity === tier.min_quantity) return { ok: false, problem: 'tierDuplicate' };
    if (priceMinor !== null && tier.unit_price_minor >= priceMinor) {
      return { ok: false, problem: 'tierNotBelow' };
    }
    if (before && tier.unit_price_minor >= before.unit_price_minor) {
      return { ok: false, problem: 'tierNotDescending' };
    }
  }
  return { ok: true, value: tiers };
}

/**
 * The live example next to a typed row ("6 pcs = ৳2,280"): what that many pieces cost at that
 * price. An illustration of the merchant's own numbers while they type, null for an incomplete
 * row; every real total comes from the quote.
 */
export function tierExample(row: TierDraft): { quantity: number; totalMinor: number } | null {
  const quantity = parseCount(row.quantity);
  const price = parseTaka(row.price);
  if (quantity === null || price === null || quantity < 2) return null;
  return { quantity, totalMinor: quantity * price };
}

export function sameTiers(a: PriceTier[], b: PriceTier[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (tier, i) =>
        tier.min_quantity === b[i]?.min_quantity &&
        tier.unit_price_minor === b[i]?.unit_price_minor,
    )
  );
}
