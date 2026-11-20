import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { call } from '../../api/call';
import { ActionButton, Field, FormError, fieldClass, cx } from '../../components/ui';
import { formatOptions } from '../options';
import type { Product } from '../ProductsPage';
import {
  type Variant,
  type VariantDraft,
  EMPTY_DRAFT,
  draftOf,
  type DraftErrors,
  validate,
  Panel,
  VariantFields,
  type OnChange,
  useMutation,
} from './shared';
import { defaultVariantOf } from './PricingEditor';
import { DRAFT_ORDER, StaleNote, useDraft, useDraftSection } from './drafts';

export function VariantsPanel({ product, onChange }: { product: Product; onChange: OnChange }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState<VariantDraft | null>(null);
  const [addErrors, setAddErrors] = useState<DraftErrors>({});
  const { run, error, busy } = useMutation(onChange);
  // A product with one variant and no options edits its price in the pricing panel.
  const hidden = defaultVariantOf(product)?.id;

  async function add() {
    if (!adding) return;
    const checked = validate(adding, t);
    if ('errors' in checked) return setAddErrors(checked.errors);
    setAddErrors({});
    if (
      await run(() =>
        call(() =>
          api.POST('/v1/products/{product_id}/variants', {
            params: { path: { product_id: product.id } },
            body: checked.value,
          }),
        ),
      )
    ) {
      setAdding(null);
    }
  }

  return (
    <Panel
      id="product-variants"
      title={t('editor.variants')}
      hint={t('editor.optionsHint')}
      draft="variant"
    >
      <RenameOption product={product} onChange={onChange} />
      <FormError error={error} />
      {product.variants.map((variant, index) =>
        variant.id === hidden ? null : (
          <VariantRow
            key={variant.id}
            product={product}
            variant={variant}
            index={index}
            onChange={onChange}
          />
        ),
      )}
      {adding ? (
        <div className="space-y-2 border-t border-line pt-4">
          <VariantFields draft={adding} onChange={setAdding} errors={addErrors} />
          <div className="flex gap-2">
            <ActionButton tone="primary" disabled={busy} onClick={() => void add()}>
              {t('editor.addVariant')}
            </ActionButton>
            <ActionButton onClick={() => setAdding(null)}>{t('editor.removeRow')}</ActionButton>
          </div>
        </div>
      ) : (
        <ActionButton onClick={() => setAdding(EMPTY_DRAFT)}>{t('editor.addVariant')}</ActionButton>
      )}
    </Panel>
  );
}

function VariantRow({
  product,
  variant,
  index,
  onChange,
}: {
  product: Product;
  variant: Variant;
  index: number;
  onChange: OnChange;
}) {
  const { t } = useTranslation();
  const { draft, setDraft, dirty, stale, settle, reset } = useDraft(product, (p) =>
    draftOf(p.variants.find((v) => v.id === variant.id) ?? variant),
  );
  const [errors, setErrors] = useState<DraftErrors>({});
  const { send, error, busy } = useMutation(onChange);
  const archived = variant.status === 'archived';

  const patch = (body: Record<string, unknown>) =>
    send(() =>
      call(() =>
        api.PATCH('/v1/products/{product_id}/variants/{variant_id}', {
          params: { path: { product_id: product.id, variant_id: variant.id } },
          body,
        }),
      ),
    );

  useDraftSection({
    id: `variant:${variant.id}`,
    label: t('editor.variantLabel', {
      name: formatOptions(variant.option_values) || t('wholesale.defaultVariant'),
    }),
    order: DRAFT_ORDER.variant + index,
    dirty,
    validate: () => {
      const checked = validate(draft, t);
      setErrors('errors' in checked ? checked.errors : {});
      return !('errors' in checked);
    },
    save: async () => {
      const checked = validate(draft, t);
      if ('errors' in checked) return false;
      const next = await patch(checked.value);
      if (next) settle(next);
      return next !== null;
    },
    reset: () => {
      setErrors({});
      reset();
    },
  });

  return (
    <div
      data-draft={`variant:${variant.id}`}
      className={cx(
        'space-y-2 border-t border-line pt-4 first:border-t-0 first:pt-0',
        archived && 'opacity-60',
      )}
    >
      {/* An archived variant is read-only until restored. */}
      <VariantFields
        draft={draft}
        onChange={setDraft}
        errors={errors}
        disabled={archived || busy}
      />
      <FormError error={error} />
      <StaleNote stale={stale} />
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          disabled={busy}
          onClick={() => void patch({ status: archived ? 'active' : 'archived' })}
        >
          {t(archived ? 'editor.restoreVariant' : 'editor.archiveVariant')}
        </ActionButton>
        {archived && <span className="text-sm text-ink-faint">{t('editor.archivedVariant')}</span>}
      </div>
    </div>
  );
}

function RenameOption({ product, onChange }: { product: Product; onChange: OnChange }) {
  const { t } = useTranslation();
  const names = [...new Set(product.variants.flatMap((v) => Object.keys(v.option_values)))];
  const [open, setOpen] = useState(false);
  const [oldName, setOldName] = useState(names[0] ?? '');
  const [newName, setNewName] = useState('');
  const selectedName = names.includes(oldName) ? oldName : (names[0] ?? '');
  const { run, error, busy } = useMutation(onChange);
  if (!names.length) return null;
  if (!open)
    return <ActionButton onClick={() => setOpen(true)}>{t('editor.renameOption')}</ActionButton>;
  return (
    <form
      className="space-y-3 rounded-md border border-line p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!newName.trim() || busy) return;
        if (
          await run(() =>
            call(() =>
              api.POST('/v1/products/{product_id}/rename-option', {
                params: { path: { product_id: product.id } },
                body: { old_name: selectedName, new_name: newName.trim() },
              }),
            ),
          )
        ) {
          setOpen(false);
          setNewName('');
          setOldName(newName.trim());
        }
      }}
    >
      <p className="text-sm text-ink-muted">{t('editor.renameOptionHint')}</p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-sm text-ink">
          {t('editor.currentOptionName')}
          <select
            className={cx(fieldClass, 'mt-1 block w-full')}
            value={selectedName}
            disabled={busy}
            onChange={(e) => setOldName(e.target.value)}
          >
            {names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <Field
          label={t('editor.newOptionName')}
          value={newName}
          required
          disabled={busy}
          onChange={(e) => setNewName(e.target.value)}
        />
      </div>
      <FormError
        error={
          error?.code === 'VALIDATION_ERROR'
            ? { ...error, fields: {}, message: t('editor.renameOptionClash') }
            : error
        }
      />
      <div className="flex flex-wrap gap-2">
        <ActionButton type="submit" disabled={busy || !newName.trim()}>
          {t('editor.renameAllVariants')}
        </ActionButton>
        <ActionButton disabled={busy} onClick={() => setOpen(false)}>
          {t('editor.cancel')}
        </ActionButton>
      </div>
    </form>
  );
}
