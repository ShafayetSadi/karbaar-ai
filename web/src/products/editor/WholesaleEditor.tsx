import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { call } from '../../api/call';
import { FormError } from '../../components/ui';
import { formatOptions } from '../options';
import { WholesalePanel } from '../WholesalePanel';
import {
  checkQuantity,
  checkTiers,
  quantityDraftOf,
  sameTiers,
  tierDraftsOf,
  type PriceTier,
  type QuantityDraft,
  type QuantityProblem,
  type TierDraft,
  type TierProblem,
} from '../wholesale';
import type { Product } from '../ProductsPage';
import { DRAFT_ORDER, StaleNote, useDraft, useDraftSection } from './drafts';
import { type Variant, Panel, type OnChange, useMutation } from './shared';

const activeVariants = (product: Product) => product.variants.filter((v) => v.status === 'active');

/** The quantity limits and the tier tables, shared or one per variant, as typed. */
function wholesaleOf(product: Product) {
  const active = activeVariants(product);
  const first: PriceTier[] = active[0]?.price_tiers ?? [];
  return {
    quantity: quantityDraftOf(product) as QuantityDraft,
    perVariant: active.some((v) => !sameTiers(v.price_tiers, first)),
    shared: tierDraftsOf(first) as TierDraft[],
    rows: Object.fromEntries(active.map((v) => [v.id, tierDraftsOf(v.price_tiers)])) as Record<
      string,
      TierDraft[]
    >,
  };
}

export function WholesaleEditor({ product, onChange }: { product: Product; onChange: OnChange }) {
  const { t } = useTranslation();
  const { send, error, busy } = useMutation(onChange);
  const active = activeVariants(product);
  // What the variants have now; the shared table shows the first one's.
  const firstTiers: PriceTier[] = active[0]?.price_tiers ?? [];
  const differ = active.some((v) => !sameTiers(v.price_tiers, firstTiers));
  const { draft, setDraft, dirty, stale, settle, reset } = useDraft(product, wholesaleOf);
  const { quantity, perVariant, shared, rows } = draft;
  const edit = (patch: Partial<typeof draft>) => setDraft({ ...draft, ...patch });
  const [quantityProblem, setQuantityProblem] = useState<QuantityProblem>();
  const [tierProblem, setTierProblem] = useState<TierProblem>();

  /** The draft as the calls it needs, or what is wrong with it. */
  function check() {
    const quantityChecked = checkQuantity(quantity);
    let sharedTiers: PriceTier[] | null = null;
    const perVariantTiers: [Variant, PriceTier[]][] = [];
    let problem: TierProblem | undefined;
    if (perVariant) {
      for (const variant of active) {
        const checked = checkTiers(rows[variant.id] ?? [], variant.price_minor);
        if (!checked.ok) {
          problem = checked.problem;
          break;
        }
        if (!sameTiers(checked.value, variant.price_tiers))
          perVariantTiers.push([variant, checked.value]);
      }
    } else {
      const lowest = active.length ? Math.min(...active.map((v) => v.price_minor)) : null;
      const checked = checkTiers(shared, lowest);
      if (checked.ok) sharedTiers = checked.value;
      else problem = checked.problem;
    }
    return { quantityChecked, sharedTiers, perVariantTiers, problem };
  }

  async function save() {
    const { quantityChecked, sharedTiers, perVariantTiers, problem } = check();
    if (!quantityChecked.ok || problem) return false;
    // Several calls, so stop at the first refusal; the draft is kept to try again.
    const landed: { last?: Product } = {};
    const step = async (request: Parameters<typeof send>[0]) => {
      const next = await send(request);
      if (next) landed.last = next;
      else if (landed.last) settle(landed.last, false);
      return next !== null;
    };
    const quantityChanged =
      quantityChecked.value.min_order_quantity !== product.min_order_quantity ||
      quantityChecked.value.max_order_quantity !== product.max_order_quantity;
    if (quantityChanged) {
      const ok = await step(() =>
        call(() =>
          api.PATCH('/v1/products/{product_id}', {
            params: { path: { product_id: product.id } },
            body: quantityChecked.value,
          }),
        ),
      );
      if (!ok) return false;
    }
    if (sharedTiers !== null && (differ || !sameTiers(sharedTiers, firstTiers))) {
      const tiers = sharedTiers;
      const ok = await step(() =>
        call(() =>
          api.PUT('/v1/products/{product_id}/price-tiers', {
            params: { path: { product_id: product.id } },
            body: { tiers },
          }),
        ),
      );
      if (!ok) return false;
    }
    for (const [variant, tiers] of perVariantTiers) {
      const ok = await step(() =>
        call(() =>
          api.PUT('/v1/products/{product_id}/variants/{variant_id}/price-tiers', {
            params: { path: { product_id: product.id, variant_id: variant.id } },
            body: { tiers },
          }),
        ),
      );
      if (!ok) return false;
    }
    // Nothing to send (say, per-variant tables that all match) still leaves the section clean.
    if (landed.last) settle(landed.last);
    else reset();
    return true;
  }

  useDraftSection({
    id: 'wholesale',
    label: t('wholesale.title'),
    order: DRAFT_ORDER.wholesale,
    dirty,
    validate: () => {
      const { quantityChecked, problem } = check();
      setQuantityProblem(quantityChecked.ok ? undefined : quantityChecked.problem);
      setTierProblem(problem);
      return quantityChecked.ok && !problem;
    },
    save,
    reset: () => {
      setQuantityProblem(undefined);
      setTierProblem(undefined);
      reset();
    },
  });

  return (
    <Panel title={t('wholesale.title')} hint={t('wholesale.hint')} draft="wholesale">
      <FormError error={error} />
      <StaleNote stale={stale} />
      <WholesalePanel
        quantity={quantity}
        onQuantity={(next) => edit({ quantity: next })}
        quantityProblem={quantityProblem}
        tiers={shared}
        onTiers={(next) => edit({ shared: next })}
        tierProblem={tierProblem}
        variants={active.map((v) => ({
          id: v.id,
          label: formatOptions(v.option_values) || t('wholesale.defaultVariant'),
          rows: rows[v.id] ?? [],
        }))}
        perVariant={perVariant}
        onPerVariant={(next) =>
          // Starting per-variant tables from the shared one is what merchants usually want.
          edit({
            perVariant: next,
            ...(next && !differ
              ? {
                  rows: Object.fromEntries(
                    active.map((v) => [v.id, shared.map((r) => ({ ...r }))]),
                  ),
                }
              : {}),
          })
        }
        onVariantRows={(variantId, next) => edit({ rows: { ...rows, [variantId]: next } })}
        disabled={busy}
      />
    </Panel>
  );
}
