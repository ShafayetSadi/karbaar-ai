import type { TFunction } from 'i18next';
import { parseTaka } from '../i18n/format';

export type PriceErrors = { price?: string; regular?: string };

/** A variant's price and regular price, in poisha, ready for the API. */
export type CheckedPrice = { price_minor: number; compare_at_price_minor: number | null };

/**
 * Check a price and an optional regular price typed in taka. The regular price must be above the
 * price; an empty one comes back as null, which also clears one on an existing variant.
 */
export function checkPrice(
  price: string,
  regular: string,
  t: TFunction,
): { value: CheckedPrice } | { errors: PriceErrors } {
  const price_minor = parseTaka(price);
  const regular_minor = regular.trim() ? parseTaka(regular) : undefined;
  const regularBad =
    regular_minor === null ||
    (regular_minor !== undefined && price_minor !== null && regular_minor <= price_minor);
  if (price_minor === null || regularBad) {
    return {
      errors: {
        price: price_minor === null ? t('editor.invalidPrice') : undefined,
        regular: regularBad
          ? regular_minor === null
            ? t('editor.invalidPrice')
            : t('editor.regularNotAbove')
          : undefined,
      },
    };
  }
  return { value: { price_minor, compare_at_price_minor: regular_minor ?? null } };
}
