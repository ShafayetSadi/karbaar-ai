import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { call } from '../../api/call';
import { Chip, Field, FormError, cx, fieldClass } from '../../components/ui';
import { parseAliases } from '../options';
import { DescriptionEditor } from '../DescriptionEditor';
import { useGroups } from '../groups';
import { PRODUCT_TYPES, type ProductType } from '../presets';
import type { Product } from '../ProductsPage';
import { DRAFT_ORDER, StaleNote, useDraft, useDraftSection } from './drafts';
import { Panel, type OnChange, useMutation } from './shared';

/** The API's limit on a description (`ProductUpdate`). */
const DESCRIPTION_MAX = 5000;

const detailsOf = (product: Product) => ({
  name: product.name,
  description: product.description ?? '',
  categoryId: product.category_id ?? '',
  type: product.product_type as ProductType,
});

/** Name, category, type and description: the same fields as the new product page. */
export function DetailsPanel({ product, onChange }: { product: Product; onChange: OnChange }) {
  const { t } = useTranslation();
  const { send, error, busy } = useMutation(onChange);
  const categories = useGroups('categories');
  const { draft, setDraft, dirty, stale, settle, reset } = useDraft(product, detailsOf);
  const [nameError, setNameError] = useState<string>();
  const edit = (patch: Partial<typeof draft>) => setDraft({ ...draft, ...patch });

  const productWebUrl: string | null = null;

  useDraftSection({
    id: 'details',
    label: t('editor.productInformation'),
    order: DRAFT_ORDER.details,
    dirty,
    validate: () => {
      const ok = draft.name.trim() !== '';
      setNameError(ok ? undefined : t('editor.nameRequired'));
      return ok;
    },
    save: async () => {
      const next = await send(() =>
        call(() =>
          api.PATCH('/v1/products/{product_id}', {
            params: { path: { product_id: product.id } },
            body: {
              name: draft.name.trim(),
              description: draft.description.trim() || null,
              // Only what changed, so a product keeps its type and category untouched.
              ...(draft.categoryId !== (product.category_id ?? '') && {
                category_id: draft.categoryId || null,
              }),
              ...(draft.type !== product.product_type && { product_type: draft.type }),
            },
          }),
        ),
      );
      if (next) settle(next);
      return next !== null;
    },
    reset,
  });

  return (
    <Panel id="product-info" title={t('editor.productInformation')} draft="details">
      <FormError error={error} />
      <StaleNote stale={stale} />
      <Field
        label={`${t('editor.productName')} *`}
        aria-label={t('editor.name')}
        required
        maxLength={200}
        value={draft.name}
        error={nameError}
        disabled={busy}
        placeholder={t('editor.namePlaceholder')}
        onChange={(e) => {
          setNameError(undefined);
          edit({ name: e.target.value });
        }}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink-muted">
          {t('editor.category')}
          <select
            value={draft.categoryId}
            disabled={busy}
            onChange={(e) => edit({ categoryId: e.target.value })}
            className={cx('mt-1 block w-full', fieldClass)}
          >
            <option value="">{t('editor.selectCategory')}</option>
            {(categories.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <label className="block text-sm font-medium text-ink-muted">
            {t('editor.type')}
            <select
              value={draft.type}
              disabled={busy}
              onChange={(e) => edit({ type: e.target.value as ProductType })}
              className={cx('mt-1 block w-full', fieldClass)}
            >
              {PRODUCT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`productType.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1 text-xs text-ink-faint">{t('editor.typeHint')}</p>
        </div>
      </div>
      <div className="space-y-1">
        {productWebUrl && (
          <div className="pl-6 text-xs">
            <a
              href={productWebUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-active hover:underline"
            >
              <span>{t('editor.viewOnWebsite', { defaultValue: 'View on website' })}</span>
              <ExternalLink className="size-3" />
            </a>
          </div>
        )}
      </div>
      <DescriptionEditor
        value={draft.description}
        onChange={(description) => edit({ description })}
        disabled={busy}
        maxLength={DESCRIPTION_MAX}
      />
    </Panel>
  );
}

const aliasesOf = (product: Product) => product.aliases.join(', ');

/** The other names customers use for the product, shown as they split. Lives in More options. */
export function AliasesEditor({ product, onChange }: { product: Product; onChange: OnChange }) {
  const { t } = useTranslation();
  const { send, error, busy } = useMutation(onChange);
  const { draft: aliasText, setDraft, dirty, stale, settle, reset } = useDraft(product, aliasesOf);

  useDraftSection({
    id: 'aliases',
    label: t('editor.aliases'),
    order: DRAFT_ORDER.aliases,
    dirty,
    validate: () => true,
    save: async () => {
      const next = await send(() =>
        call(() =>
          api.PATCH('/v1/products/{product_id}', {
            params: { path: { product_id: product.id } },
            body: { aliases: parseAliases(aliasText) },
          }),
        ),
      );
      if (next) settle(next);
      return next !== null;
    },
    reset,
  });

  const aliases = parseAliases(aliasText);
  return (
    <Panel title={t('editor.aliases')} draft="aliases">
      <FormError error={error} />
      <StaleNote stale={stale} />
      <Field
        label={t('editor.aliases')}
        value={aliasText}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
      />
      {aliases.length > 0 && (
        <ul aria-label={t('editor.aliasList')} className="flex flex-wrap gap-1.5">
          {aliases.map((alias, i) => (
            <li key={`${alias}-${i}`}>
              <Chip>{alias}</Chip>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-ink-faint">{t('editor.aliasesHint')}</p>
    </Panel>
  );
}

export function VisualTerms({ product, onChange }: { product: Product; onChange: OnChange }) {
  const { t } = useTranslation();
  const { run, error, busy } = useMutation(onChange);
  if (!product.visual_terms?.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-muted">{t('editor.foundInPhotos')}</p>
      <FormError error={error} />
      <ul className="flex flex-wrap gap-2" aria-label={t('editor.foundInPhotos')}>
        {product.visual_terms.map((term) => (
          <li key={term}>
            <button
              type="button"
              disabled={busy}
              className="rounded-full border border-line px-2 py-1 text-sm text-ink"
              aria-label={t('editor.removeVisualTerm', { term })}
              onClick={() =>
                void run(() =>
                  call(() =>
                    api.POST('/v1/products/{product_id}/visual-terms/hide', {
                      params: { path: { product_id: product.id } },
                      body: { term },
                    }),
                  ),
                )
              }
            >
              {term} ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
