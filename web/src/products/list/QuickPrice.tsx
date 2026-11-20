import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { call } from '../../api/call';
import type { ApiError } from '../../api/errors';
import { ActionButton, Field, FormError, Popover, cx, useToast } from '../../components/ui';
import { toTakaInput } from '../../i18n/format';
import { activeVariants } from '../listPrice';
import { formatOptions } from '../options';
import { checkPrice, type PriceErrors } from '../priceDraft';
import type { Product } from '../ProductsPage';
import { PriceText } from './cells';

type Variant = Product['variants'][number];
type Draft = { price: string; regular: string };

/** The popover stays small; a product with more variants is edited in full in the editor. */
export const QUICK_VARIANTS = 8;

const draftOf = (v: Variant): Draft => ({
  price: toTakaInput(v.price_minor),
  regular: v.compare_at_price_minor == null ? '' : toTakaInput(v.compare_at_price_minor),
});

/** A trigger that looks like the cell it replaces, with a dashed underline on hover. */
export const quickTriggerClass =
  'rounded text-left decoration-ink-faint decoration-dashed underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-active';

/** The list's price cell as a button: change each active variant's price in place. */
export function QuickPrice({ product, className }: { product: Product; className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (activeVariants(product).length === 0) return null;
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      className="w-80"
      trigger={
        <button
          type="button"
          aria-label={t('products.editPrice', { name: product.name })}
          className={quickTriggerClass}
        >
          <PriceText product={product} className={className} />
        </button>
      }
    >
      <PriceForm product={product} onSaved={() => setOpen(false)} />
    </Popover>
  );
}

function PriceForm({ product, onSaved }: { product: Product; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const variants = activeVariants(product);
  const shown = variants.slice(0, QUICK_VARIANTS);
  const single = variants.length === 1;
  // What the server holds now: the variants saved by an earlier, partly failed try move here, so
  // a retry doesn't send them again.
  const [saved, setSaved] = useState(() => new Map(shown.map((v) => [v.id, draftOf(v)])));
  const [drafts, setDrafts] = useState(saved);
  const [errors, setErrors] = useState<Record<string, PriceErrors>>({});
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  function edit(id: string, field: keyof Draft, value: string) {
    setDrafts((current) => new Map(current).set(id, { ...current.get(id)!, [field]: value }));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const changes: { id: string; draft: Draft; body: Record<string, number | null> }[] = [];
    const found: Record<string, PriceErrors> = {};
    for (const variant of shown) {
      const draft = drafts.get(variant.id)!;
      const before = saved.get(variant.id)!;
      if (draft.price === before.price && draft.regular === before.regular) continue;
      const checked = checkPrice(draft.price, draft.regular, t);
      if ('errors' in checked) {
        found[variant.id] = checked.errors;
        continue;
      }
      // Only the fields that changed; a cleared regular price is sent as null.
      const body: Record<string, number | null> = {};
      if (draft.price !== before.price) body.price_minor = checked.value.price_minor;
      if (draft.regular !== before.regular) {
        body.compare_at_price_minor = checked.value.compare_at_price_minor;
      }
      changes.push({ id: variant.id, draft, body });
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (changes.length === 0) return onSaved();

    setBusy(true);
    setError(null);
    let failed: ApiError | null = null;
    let any = false;
    // One at a time, stopping at the first refusal (the server checks quantity price tiers).
    for (const change of changes) {
      const result = await call(() =>
        api.PATCH('/v1/products/{product_id}/variants/{variant_id}', {
          params: { path: { product_id: product.id, variant_id: change.id } },
          body: change.body,
        }),
      );
      if (!result.ok) {
        failed = result.error;
        break;
      }
      any = true;
      setSaved((current) => new Map(current).set(change.id, change.draft));
    }
    setBusy(false);
    if (any) void queryClient.invalidateQueries({ queryKey: ['products'] });
    if (failed) return setError(failed);
    toast({ message: t('products.priceSaved'), tone: 'ok' });
    onSaved();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="max-h-[60vh] space-y-3 overflow-y-auto">
        {shown.map((variant) => {
          const draft = drafts.get(variant.id)!;
          const label = formatOptions(variant.option_values) || t('stock.defaultVariant');
          return (
            <fieldset key={variant.id} className="space-y-1">
              <legend className={cx('text-sm font-medium text-ink', single && 'sr-only')}>
                {label}
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label={t('editor.price')}
                  value={draft.price}
                  onChange={(e) => edit(variant.id, 'price', e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  error={errors[variant.id]?.price}
                />
                <Field
                  label={t('products.regularPrice')}
                  value={draft.regular}
                  onChange={(e) => edit(variant.id, 'regular', e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  error={errors[variant.id]?.regular}
                />
              </div>
            </fieldset>
          );
        })}
      </div>
      <FormError error={error} />
      <div className="flex items-center justify-between gap-2">
        {variants.length > QUICK_VARIANTS || error ? (
          <Link
            to={`/products/${product.id}`}
            className="text-sm font-medium text-active hover:underline"
          >
            {t('products.editAllVariants')}
          </Link>
        ) : (
          <span />
        )}
        <ActionButton type="submit" tone="primary" disabled={busy}>
          {t('editor.save')}
        </ActionButton>
      </div>
    </form>
  );
}
