import { ArrowLeft, ChevronDown } from 'lucide-react';
import { createContext, useCallback, useContext, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Outcome } from '../../api/call';
import type { ApiError } from '../../api/errors';
import type { components } from '../../api/schema';
import { Field } from '../../components/ui';
import { toTakaInput } from '../../i18n/format';
import { formatOptions, parseOptions } from '../options';
import { UnsavedDot, useAnyDraftStatus, useDraftStatus } from './drafts';
import type { QuantityDraft } from '../wholesale';
import { checkPrice } from '../priceDraft';
import type { Product } from '../ProductsPage';

export type Variant = Product['variants'][number];

export interface VariantDraft {
  options: string;
  price: string;
  regular: string;
  sku: string;
}

export const EMPTY_DRAFT: VariantDraft = { options: '', price: '', regular: '', sku: '' };

export const draftOf = (v: Variant): VariantDraft => ({
  options: formatOptions(v.option_values),
  price: toTakaInput(v.price_minor),
  regular: v.compare_at_price_minor == null ? '' : toTakaInput(v.compare_at_price_minor),
  sku: v.sku ?? '',
});

export type DraftErrors = { options?: string; price?: string; regular?: string };

/** Validate a draft into the API shape, or say which fields are wrong. */
type Validated = { value: components['schemas']['VariantInput'] } | { errors: DraftErrors };

export function validate(draft: VariantDraft, t: TFunction): Validated {
  const option_values = parseOptions(draft.options);
  const price = checkPrice(draft.price, draft.regular, t);
  if (option_values === null || 'errors' in price) {
    const errors: DraftErrors = {
      options: option_values === null ? t('editor.invalidOptions') : undefined,
      ...('errors' in price ? price.errors : {}),
    };
    return { errors };
  }
  return {
    value: { option_values, ...price.value, sku: draft.sku.trim() || null },
  };
}

export function BackLink() {
  const { t } = useTranslation();
  return (
    <Link
      to="/products"
      className="inline-flex items-center gap-1 text-sm font-medium text-active hover:underline"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {t('editor.back')}
    </Link>
  );
}

/** True inside an `OptionRow`, whose header already carries the title. */
export const InSettings = createContext(false);

export function Panel({
  id,
  title,
  hint,
  draft,
  children,
}: {
  id?: string;
  title: string;
  hint?: string;
  /** The draft section inside, for the save bar's "go to" and the title's unsaved dot. */
  draft?: string;
  children: React.ReactNode;
}) {
  const { dirty } = useDraftStatus(draft ?? '');
  if (useContext(InSettings)) {
    return (
      <div id={id} data-draft={draft} className="space-y-4">
        {hint && <p className="text-sm text-ink-muted">{hint}</p>}
        {children}
      </div>
    );
  }
  return (
    <div
      id={id}
      data-draft={draft}
      className="scroll-mt-36 rounded-lg border border-line bg-panel p-4 sm:p-6"
    >
      <h2 className="text-lg font-semibold text-ink">
        {title}
        <UnsavedDot show={draft !== undefined && dirty} />
      </h2>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

/** "Minimum 6 · 2 quantity prices", or "No limits" when nothing is set. */
export function wholesaleSummary(t: TFunction, quantity: QuantityDraft, tierCount: number): string {
  const parts: string[] = [];
  const min = quantity.min.trim();
  if (min && min !== '1') parts.push(t('wholesale.summaryMin', { count: Number(min) || 0 }));
  if (quantity.max.trim())
    parts.push(t('wholesale.summaryMax', { count: Number(quantity.max) || 0 }));
  if (tierCount > 0) parts.push(t('wholesale.summaryTiers', { count: tierCount }));
  return parts.length ? parts.join(' · ') : t('wholesale.summaryNone');
}

/**
 * One row of the "More options" card on both product pages (a native <details>). It shows its
 * current setting while closed, so the merchant sees what is there without opening it. The
 * fields stay mounted while it is closed, so drafts inside survive; `areas` names the drafts whose
 * unsaved changes put a dot on the title, and the `Panel`s inside drop their own card.
 */
export function OptionRow({
  title,
  summary,
  hint,
  areas,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  hint?: string;
  areas?: readonly string[];
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const { dirty } = useAnyDraftStatus(areas ?? []);
  return (
    <details
      open={open}
      onToggle={onToggle && ((e) => onToggle(e.currentTarget.open))}
      className="group"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-6 py-4 select-none hover:bg-panel-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-active [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-ink">
          {title}
          <UnsavedDot show={dirty} />
        </span>
        <span className="ml-auto truncate text-sm text-ink-muted">{summary}</span>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-ink-faint transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="space-y-4 px-6 pt-1 pb-6">
        {hint && <p className="text-sm text-ink-muted">{hint}</p>}
        <InSettings.Provider value>{children}</InSettings.Provider>
      </div>
    </details>
  );
}

export function VariantFields({
  draft,
  onChange,
  errors,
  disabled,
}: {
  draft: VariantDraft;
  onChange: (draft: VariantDraft) => void;
  errors?: DraftErrors;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
      <Field
        disabled={disabled}
        label={t('editor.options')}
        value={draft.options}
        placeholder="Size: M, Color: Black"
        error={errors?.options}
        onChange={(e) => onChange({ ...draft, options: e.target.value })}
      />
      <Field
        disabled={disabled}
        label={t('editor.price')}
        value={draft.price}
        inputMode="decimal"
        error={errors?.price}
        onChange={(e) => onChange({ ...draft, price: e.target.value })}
      />
      <Field
        disabled={disabled}
        label={t('editor.regularPrice')}
        value={draft.regular}
        inputMode="decimal"
        error={errors?.regular}
        onChange={(e) => onChange({ ...draft, regular: e.target.value })}
      />
      <Field
        disabled={disabled}
        label={t('editor.sku')}
        value={draft.sku}
        onChange={(e) => onChange({ ...draft, sku: e.target.value })}
      />
    </div>
  );
}

export const MAX_STOCK = 1_000_000;

export const MAX_WEIGHT_GRAMS = 10_000_000;

export type OnChange = (product: Product) => void;

/** Run a call that returns the updated product; surface the API's message on failure. */
export function useMutation(onChange: OnChange) {
  const { t } = useTranslation();
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  /** Answers with the updated product, or null when the call failed. */
  const send = useCallback(
    async (request: () => Promise<Outcome<Product>>) => {
      setBusy(true);
      setError(null);
      const result = await request();
      setBusy(false);
      if (result.ok) onChange(result.data);
      else
        setError(
          result.error.code === 'OPTION_NAMES_MISMATCH'
            ? { ...result.error, message: t('editor.optionNamesMismatch') }
            : result.error,
        );
      return result.ok ? result.data : null;
    },
    [onChange, t],
  );
  const run = useCallback(
    async (request: () => Promise<Outcome<Product>>) => (await send(request)) !== null,
    [send],
  );
  return { run, send, error, busy };
}
