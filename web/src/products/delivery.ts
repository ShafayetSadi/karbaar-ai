import { parseTaka, toTakaInput } from '../i18n/format';

/**
 * Where a product can be delivered and how much advance it asks for (ADR 0025). Both are
 * bookkeeping the API enforces: the form only helps the merchant say it and see problems early.
 */
export const ADVANCE_POLICIES = ['inherit', 'none', 'delivery_fee', 'fixed', 'full'] as const;
export type AdvancePolicy = (typeof ADVANCE_POLICIES)[number];

export interface DeliveryDraft {
  /** Delivery option ids that are ticked. All active options ticked means "no limit". */
  allowed: string[];
  advance: AdvancePolicy;
  /** The fixed advance as typed, in taka. */
  fixed: string;
}

export interface OptionRef {
  id: string;
  is_active: boolean;
}

export type DeliveryProblem = 'chooseOne' | 'fixedInvalid';

export interface DeliveryFields {
  advance_policy: AdvancePolicy;
  advance_fixed_minor: number | null;
  /** Empty means every active option. */
  delivery_option_ids: string[];
}

type Checked = { ok: true; value: DeliveryFields } | { ok: false; problem: DeliveryProblem };

export function newDraft(options: OptionRef[]): DeliveryDraft {
  return {
    allowed: options.filter((o) => o.is_active).map((o) => o.id),
    advance: 'inherit',
    fixed: '',
  };
}

export function draftOfProduct(
  product: {
    advance_policy: string;
    advance_fixed_minor: number | null;
    delivery_option_ids: string[];
  },
  options: OptionRef[],
): DeliveryDraft {
  const active = options.filter((o) => o.is_active).map((o) => o.id);
  return {
    allowed:
      product.delivery_option_ids.length === 0
        ? active
        : product.delivery_option_ids.filter((id) => active.includes(id)),
    advance: (ADVANCE_POLICIES as readonly string[]).includes(product.advance_policy)
      ? (product.advance_policy as AdvancePolicy)
      : 'inherit',
    fixed: product.advance_fixed_minor === null ? '' : toTakaInput(product.advance_fixed_minor),
  };
}

/**
 * True when the product is limited to options that are all switched off, so no order can be taken
 * for it until the merchant edits the limit.
 */
export function hasNoUsableOption(
  product: { delivery_option_ids: string[] },
  options: OptionRef[],
): boolean {
  if (product.delivery_option_ids.length === 0) return false;
  const active = new Set(options.filter((o) => o.is_active).map((o) => o.id));
  return !product.delivery_option_ids.some((id) => active.has(id));
}

export function checkDelivery(draft: DeliveryDraft, options: OptionRef[]): Checked {
  const active = options.filter((o) => o.is_active).map((o) => o.id);
  // With no options at all there is nothing to limit; otherwise at least one must stay ticked.
  const ticked = draft.allowed.filter((id) => active.includes(id));
  if (active.length > 0 && ticked.length === 0) return { ok: false, problem: 'chooseOne' };
  const limited = active.length > 0 && ticked.length < active.length;

  let fixed: number | null = null;
  if (draft.advance === 'fixed') {
    fixed = parseTaka(draft.fixed);
    if (fixed === null || fixed <= 0) return { ok: false, problem: 'fixedInvalid' };
  }
  return {
    ok: true,
    value: {
      advance_policy: draft.advance,
      advance_fixed_minor: fixed,
      delivery_option_ids: limited ? ticked : [],
    },
  };
}
