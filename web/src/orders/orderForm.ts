import type { ApiError } from '../api/errors';
import type { components } from '../api/schema';

export type Order = components['schemas']['OrderRead'];
/** An order as a row of the list: the order plus its first-line photo and other-line count. */
export type OrderRow = components['schemas']['OrderListItem'];
export type OrderQuote = components['schemas']['OrderQuoteRead'];
export type OrderProposal = components['schemas']['OrderProposalRead'];
export type OrderStatus = Order['status'];

/**
 * The fresh quote a `QUOTE_CHANGED` refusal carries in `details.quote`: the price the order would
 * be taken at now, in the shape of `POST /v1/orders/quote`. Null when the error carries none.
 */
export function quoteFromChange(error: ApiError): OrderQuote | null {
  if (error.code !== 'QUOTE_CHANGED') return null;
  const quote = error.details?.quote as Partial<OrderQuote> | undefined;
  if (
    typeof quote?.total_minor !== 'number' ||
    typeof quote.advance_required_minor !== 'number' ||
    !Array.isArray(quote.lines)
  ) {
    return null;
  }
  return quote as OrderQuote;
}

/** One line of the order being typed. The price is never kept here: the server quotes it. */
export interface FormLine {
  variantId: string;
  productId?: string;
  label: string;
  quantity: string;
}

export interface FormValues {
  lines: FormLine[];
  name: string;
  phone: string;
  /** What the customer wrote. */
  address: string;
  /** Canonical district name, or empty to let the server read it from `address`. */
  district: string;
  /** A listed thana/upazila of the district, or the area as typed. */
  area: string;
  /** The merchant chose "Other" and types the area. */
  areaCustom: boolean;
  line: string;
  deliveryOptionId: string;
  notes: string;
  couponCode: string;
}

/** What the customer's profile already knows: details saved earlier, used to pre-fill. */
export interface Profile {
  name: string | null;
  phone: string | null;
  address: string | null;
  district: string | null;
  area: string | null;
  line: string | null;
}

export const EMPTY_VALUES: FormValues = {
  lines: [],
  name: '',
  phone: '',
  address: '',
  district: '',
  area: '',
  areaCustom: false,
  line: '',
  deliveryOptionId: '',
  notes: '',
  couponCode: '',
};

/** The form's values from the profile alone: a saved address comes with its district and area. */
export function valuesFromProfile(profile: Profile): Partial<FormValues> {
  return {
    name: profile.name ?? '',
    phone: profile.phone ?? '',
    address: profile.address ?? '',
    district: profile.district ?? '',
    area: profile.area ?? '',
    line: profile.line ?? '',
  };
}

export const MAX_QUANTITY = 10_000;

/** "Cotton Panjabi (XL / Black)": the product with its option values, as the merchant knows it. */
export function variantLabel(productName: string, options: Record<string, unknown>): string {
  const values = Object.values(options).map(String).filter(Boolean);
  return values.length > 0 ? `${productName} (${values.join(' / ')})` : productName;
}

export function parseQuantity(input: string): number | null {
  if (!/^\d{1,5}$/.test(input.trim())) return null;
  const value = Number(input);
  return value >= 1 && value <= MAX_QUANTITY ? value : null;
}

/** The lines as the API wants them, or null while any line has no valid quantity. */
export function quoteItems(lines: FormLine[]): { variant_id: string; quantity: number }[] | null {
  if (lines.length === 0) return null;
  const items: { variant_id: string; quantity: number }[] = [];
  for (const line of lines) {
    const quantity = parseQuantity(line.quantity);
    if (quantity === null) return null;
    items.push({ variant_id: line.variantId, quantity });
  }
  return items;
}

/**
 * Pre-fill the form from the AI's proposal. What the customer has not given is taken from the
 * customer's profile (a phone or address saved earlier); nothing is invented. The proposal's
 * prices are not used: the form asks the server for a fresh quote.
 */
export function valuesFromProposal(proposal: OrderProposal, profile: Profile): FormValues {
  // An address the customer gave in the conversation replaces the saved one as a whole: the saved
  // area or line would belong to another address.
  const given = proposal.customer.address_raw;
  return {
    lines: proposal.items.map((item) => ({
      variantId: item.variant_id,
      productId: item.product_id,
      label: variantLabel(item.product_name, item.options),
      quantity: String(item.quantity),
    })),
    name: proposal.customer.name ?? profile.name ?? '',
    phone: proposal.customer.phone_e164 ?? proposal.customer.phone_input ?? profile.phone ?? '',
    address: given ?? profile.address ?? '',
    district: (given ? proposal.customer.district : profile.district) ?? '',
    area: (given ? proposal.customer.area : profile.area) ?? '',
    areaCustom: false,
    line: (given ? proposal.customer.address_line : profile.line) ?? '',
    deliveryOptionId: proposal.delivery_option_id,
    notes: '',
    couponCode: proposal.coupon_code ?? '',
  };
}
