import { DRAFT_ORDER, StaleNote, useDraft, useDraftSection } from './editor/drafts';
import { Panel } from './editor/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import { FormError } from '../components/ui';
import { useGroups } from './groups';
import type { Product } from './ProductsPage';

// Sorted, so ticking a collection off and on again leaves the draft clean.
const organiseOf = (product: Product) => ({
  picked: [...product.collection_ids].sort(),
});

/** The product's collections (many). Its category is edited with the product information. */
export function OrganiseEditor({
  product,
  onChange,
}: {
  product: Product;
  onChange: (product: Product) => void;
}) {
  const { t } = useTranslation();
  const collections = useGroups('collections');
  const { draft, setDraft, dirty, stale, settle, reset } = useDraft(product, organiseOf);
  const { picked } = draft;
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    const product_ids = [product.id];
    const steps: Array<() => Promise<{ ok: boolean; error?: ApiError }>> = [];
    for (const id of picked.filter((c) => !product.collection_ids.includes(c))) {
      steps.push(() =>
        call(() =>
          api.POST('/v1/products/bulk', {
            body: { product_ids, action: 'add_to_collection', collection_id: id },
          }),
        ),
      );
    }
    for (const id of product.collection_ids.filter((c) => !picked.includes(c))) {
      steps.push(() =>
        call(() =>
          api.POST('/v1/products/bulk', {
            body: { product_ids, action: 'remove_from_collection', collection_id: id },
          }),
        ),
      );
    }
    let failed = false;
    for (const step of steps) {
      const result = await step();
      if (!result.ok) {
        failed = true;
        setError(result.error ?? null);
        break;
      }
    }
    // Whatever landed, show what the server has now.
    const fresh = await call(() =>
      api.GET('/v1/products/{product_id}', { params: { path: { product_id: product.id } } }),
    );
    setBusy(false);
    if (fresh.ok) {
      onChange(fresh.data);
      settle(fresh.data, !failed);
    }
    return !failed && fresh.ok;
  }

  useDraftSection({
    id: 'organise',
    label: t('organise.panelTitle'),
    order: DRAFT_ORDER.organise,
    dirty,
    validate: () => true,
    save,
    reset,
  });

  const available = collections.items ?? [];
  return (
    <Panel title={t('organise.panelTitle')} hint={t('organise.panelHint')} draft="organise">
      <FormError error={error} />
      <StaleNote stale={stale} />
      <fieldset>
        <legend className="text-sm font-medium text-ink-muted">
          {t('organise.collections.title')}
        </legend>
        {available.length === 0 ? (
          <p className="mt-1 text-sm text-ink-faint">{t('organise.collections.empty')}</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-3">
            {available.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={picked.includes(c.id)}
                  disabled={busy}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      picked: e.target.checked
                        ? [...picked, c.id].sort()
                        : picked.filter((id) => id !== c.id),
                    })
                  }
                />
                {c.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </Panel>
  );
}
