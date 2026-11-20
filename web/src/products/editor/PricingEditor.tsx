import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { call } from '../../api/call';
import { Field, FormError } from '../../components/ui';
import { parseKg, toTakaInput } from '../../i18n/format';
import { checkPrice } from '../priceDraft';
import type { Product } from '../ProductsPage';
import { PricingFields, type PricingErrors, type PricingValue } from './PricingFields';
import { DRAFT_ORDER, StaleNote, useDraft, useDraftSection } from './drafts';
import { MAX_WEIGHT_GRAMS, Panel, type OnChange, type Variant, useMutation } from './shared';

/** A product with one variant and no options: its price lives here, not in the variants list. */
export function defaultVariantOf(product: Product): Variant | undefined {
  const [only] = product.variants;
  return product.variants.length === 1 &&
    only!.status === 'active' &&
    Object.keys(only!.option_values).length === 0
    ? only
    : undefined;
}

const MAX_SIDE_MM = 10_000;

const pricingOf =
  (variant: Variant) =>
  (product: Product): PricingValue & { sku: string } => {
    const v = product.variants.find((x) => x.id === variant.id) ?? variant;
    const cm = (mm: number | null | undefined) => (mm == null ? '' : String(mm / 10));
    return {
      price: toTakaInput(v.price_minor),
      regular: v.compare_at_price_minor == null ? '' : toTakaInput(v.compare_at_price_minor),
      weight: v.weight_grams == null ? '' : String(v.weight_grams / 1000),
      length: cm(v.length_mm),
      width: cm(v.width_mm),
      height: cm(v.height_mm),
      sku: v.sku ?? '',
    };
  };

/** Price, sale price, weight and size, like the new product page; several variants point below. */
export function PricingPanel({ product, onChange }: { product: Product; onChange: OnChange }) {
  const { t } = useTranslation();
  const variant = defaultVariantOf(product);
  if (!variant) {
    return (
      <Panel id="product-pricing" title={t('editor.pricingShort')}>
        <p className="text-sm text-ink-muted">{t('editor.pricingPerVariant')}</p>
      </Panel>
    );
  }
  return <DefaultPricing product={product} variant={variant} onChange={onChange} />;
}

function DefaultPricing({
  product,
  variant,
  onChange,
}: {
  product: Product;
  variant: Variant;
  onChange: OnChange;
}) {
  const { t } = useTranslation();
  const { send, error, busy } = useMutation(onChange);
  const { draft, setDraft, dirty, stale, settle, reset } = useDraft(product, pricingOf(variant));
  const [errors, setErrors] = useState<PricingErrors>({});

  /** The API body, or the problems found; nothing is sent for a wrong field. */
  function check() {
    const price = checkPrice(draft.price, draft.regular, t);
    const weight = draft.weight.trim() ? parseKg(draft.weight) : undefined;
    const weightBad =
      weight === null || (weight !== undefined && (weight < 1 || weight > MAX_WEIGHT_GRAMS));
    const sides = [draft.length, draft.width, draft.height].map((text) =>
      text.trim() ? Math.round(Number(text) * 10) : undefined,
    );
    const sidesBad = sides.some(
      (mm) => mm !== undefined && (!Number.isFinite(mm) || mm < 1 || mm > MAX_SIDE_MM),
    );
    if ('errors' in price || weightBad || sidesBad) {
      setErrors({
        ...('errors' in price ? price.errors : {}),
        weight: weightBad ? t('editor.invalidWeightKg') : undefined,
        dimensions: sidesBad ? t('editor.invalidDimensions') : undefined,
      });
      return null;
    }
    setErrors({});
    const [length_mm, width_mm, height_mm] = sides;
    return {
      ...price.value,
      sku: draft.sku.trim() || null,
      weight_grams: weight ?? null,
      length_mm: length_mm ?? null,
      width_mm: width_mm ?? null,
      height_mm: height_mm ?? null,
    };
  }

  useDraftSection({
    id: `variant:${variant.id}`,
    label: t('editor.pricingShort'),
    order: DRAFT_ORDER.variant,
    dirty,
    validate: () => check() !== null,
    save: async () => {
      const body = check();
      if (!body) return false;
      const next = await send(() =>
        call(() =>
          api.PATCH('/v1/products/{product_id}/variants/{variant_id}', {
            params: { path: { product_id: product.id, variant_id: variant.id } },
            body,
          }),
        ),
      );
      if (next) settle(next);
      return next !== null;
    },
    reset: () => {
      setErrors({});
      reset();
    },
  });

  return (
    <Panel
      id="product-pricing"
      title={t('editor.pricingShippingSettings')}
      draft={`variant:${variant.id}`}
    >
      <FormError error={error} />
      <StaleNote stale={stale} />
      <PricingFields
        value={draft}
        errors={errors}
        disabled={busy}
        onChange={(next) => setDraft({ ...draft, ...next })}
      />
      <Field
        label={t('editor.sku')}
        value={draft.sku}
        disabled={busy}
        onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
      />
    </Panel>
  );
}
