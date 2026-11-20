import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import type { components } from '../api/schema';
import { ActionButton, Button, Field, FormError, cx, fieldClass } from '../components/ui';
import { formatDateTime, formatInteger, parseUnitChange } from '../i18n/format';
import { formatOptions } from './options';
import { adjustMany, adjustOne, insufficientMessage } from './stockApi';
import type { Product } from './ProductsPage';

type Variant = Product['variants'][number];
type Movement = components['schemas']['MovementRead'];

const PAGE_SIZE = 10;

/** Stock on hand per variant, a form to change it, and each variant's movement history. */
export function StockPanel({ product }: { product: Product }) {
  const { t } = useTranslation();
  const [levels, setLevels] = useState<Record<string, number> | null>(null);
  const [failed, setFailed] = useState(false);
  const ids = product.variants.map((v) => v.id);
  const key = ids.join(',');

  useEffect(() => {
    let cancelled = false;
    void call(() =>
      api.GET('/v1/inventory/levels', { params: { query: { variant_id: key.split(',') } } }),
    ).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setLevels(Object.fromEntries(result.data.items.map((i) => [i.variant_id, i.on_hand])));
      } else {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return (
    <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-ink">{t('stock.title')}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t('stock.hint')}</p>
      <div className="mt-4 space-y-6">
        {failed && (
          <p role="alert" className="rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
            {t('stock.loadFailed')}
          </p>
        )}
        {product.variants.filter((v) => v.status === 'active').length > 1 && (
          <AdjustAll
            variantIds={product.variants.filter((v) => v.status === 'active').map((v) => v.id)}
            onChange={(next) => setLevels((current) => ({ ...current, ...next }))}
          />
        )}
        {product.variants.map((variant) => (
          <StockRow
            key={variant.id}
            variant={variant}
            onHand={levels?.[variant.id]}
            onChange={(onHand) => setLevels((current) => ({ ...current, [variant.id]: onHand }))}
          />
        ))}
      </div>
    </div>
  );
}

/** One change for every active variant, a movement each with the shared note (all or nothing). */
function AdjustAll({
  variantIds,
  onChange,
}: {
  variantIds: string[];
  onChange: (levels: Record<string, number>) => void;
}) {
  const { t } = useTranslation();
  const [changeError, setChangeError] = useState<string | undefined>();
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const delta = parseUnitChange(String(form.get('delta') ?? ''));
    if (delta === null) return void setChangeError(t('stock.invalidChange'));
    setChangeError(undefined);
    setBusy(true);
    setError(null);
    setDone(false);
    const result = await adjustMany(
      variantIds.map((variant_id) => ({ variant_id, delta })),
      String(form.get('note') ?? '').trim() || null,
    );
    setBusy(false);
    if (result.ok) {
      onChange(Object.fromEntries(result.data.levels.map((l) => [l.variant_id, l.on_hand])));
      setDone(true);
      formElement.reset();
    } else {
      const insufficient = insufficientMessage(result.error, t, true);
      if (insufficient) setChangeError(insufficient);
      else setError(result.error);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label={t('stock.allTitle')}
      className="space-y-3 rounded-md bg-panel-muted p-4"
    >
      <h3 className="font-medium text-ink">{t('stock.allTitle')}</h3>
      <div className="grid gap-3 sm:grid-cols-[minmax(12rem,auto)_minmax(0,1fr)_auto] sm:items-end">
        <Field
          label={t('stock.changeAll')}
          name="delta"
          inputMode="numeric"
          autoComplete="off"
          error={changeError}
        />
        <Field label={t('stock.noteAll')} name="note" maxLength={200} autoComplete="off" />
        <div>
          <Button type="submit" busy={busy}>
            {t('stock.adjustAll')}
          </Button>
        </div>
      </div>
      <p className="text-sm text-ink-faint">{t('stock.allHint')}</p>
      <FormError error={error} />
      {done && !busy && (
        <p role="status" className="text-sm text-ok-ink">
          {t('editor.saved')}
        </p>
      )}
    </form>
  );
}

function StockRow({
  variant,
  onHand,
  onChange,
}: {
  variant: Variant;
  onHand: number | undefined;
  onChange: (onHand: number) => void;
}) {
  const { t } = useTranslation();
  const [changeError, setChangeError] = useState<string | undefined>();
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Bumped after each adjustment so an open history reloads.
  const [version, setVersion] = useState(0);
  const label = formatOptions(variant.option_values) || t('stock.defaultVariant');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const delta = parseUnitChange(String(form.get('delta') ?? ''));
    if (delta === null) return void setChangeError(t('stock.invalidChange'));
    setChangeError(undefined);
    setBusy(true);
    setError(null);
    const result = await adjustOne(variant.id, delta, {
      reason: form.get('reason') === 'initial' ? 'initial' : 'manual_adjust',
      note: String(form.get('note') ?? '').trim() || null,
    });
    setBusy(false);
    if (result.ok) {
      onChange(result.data.level.on_hand);
      setVersion((v) => v + 1);
      formElement.reset();
    } else {
      const insufficient = insufficientMessage(result.error, t);
      if (insufficient) setChangeError(insufficient);
      else setError(result.error);
    }
  }

  return (
    <div
      className={cx(
        'space-y-3 border-t border-line pt-4 first:border-t-0 first:pt-0',
        variant.status === 'archived' && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-ink">
          {label}
          {variant.status === 'archived' && (
            <span className="ml-2 text-sm font-normal text-ink-faint">
              {t('stock.archivedVariant')}
            </span>
          )}
        </h3>
        <p className="text-sm text-ink-muted">
          {t('stock.onHand')}:{' '}
          <span
            data-testid={`on-hand-${variant.id}`}
            className="font-mono text-lg font-semibold text-ink"
          >
            {onHand === undefined ? '…' : formatInteger(onHand)}
          </span>
        </p>
      </div>
      <form
        onSubmit={onSubmit}
        className="grid gap-3 sm:grid-cols-[8rem_9rem_1fr_auto] sm:items-start"
      >
        <Field
          label={t('stock.change')}
          name="delta"
          inputMode="numeric"
          autoComplete="off"
          error={changeError}
        />
        <label className="block text-sm font-medium text-ink-muted">
          {t('stock.reason')}
          <select
            name="reason"
            defaultValue="manual_adjust"
            className={cx('mt-1 block w-full', fieldClass)}
          >
            <option value="manual_adjust">{t('stock.reasonManual')}</option>
            <option value="initial">{t('stock.reasonInitial')}</option>
          </select>
        </label>
        <Field label={t('stock.note')} name="note" maxLength={200} autoComplete="off" />
        <div className="sm:mt-6">
          <Button type="submit" busy={busy}>
            {t('stock.adjust')}
          </Button>
        </div>
      </form>
      <p className="text-sm text-ink-faint">{t('stock.changeHint')}</p>
      <FormError error={error} />
      <ActionButton onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}>
        {t(showHistory ? 'stock.hideHistory' : 'stock.showHistory')}
      </ActionButton>
      {showHistory && <History variantId={variant.id} version={version} />}
    </div>
  );
}

function History({ variantId, version }: { variantId: string; version: number }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Movement[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const fetchPage = useCallback(
    (after: string | null) =>
      call(() =>
        api.GET('/v1/inventory/movements', {
          params: {
            query: { variant_id: variantId, limit: PAGE_SIZE, ...(after ? { cursor: after } : {}) },
          },
        }),
      ),
    [variantId],
  );

  // Reload the first page on mount and after each adjustment (`version`).
  useEffect(() => {
    let cancelled = false;
    void fetchPage(null).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setFailed(false);
        setItems(result.data.items);
        setCursor(result.data.next_cursor ?? null);
      } else {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, version]);

  async function loadMore(after: string) {
    const result = await fetchPage(after);
    if (!result.ok) return void setFailed(true);
    setItems((current) => [...(current ?? []), ...result.data.items]);
    setCursor(result.data.next_cursor ?? null);
  }

  if (failed) {
    return (
      <p role="alert" className="text-sm text-danger-ink">
        {t('stock.loadFailed')}
      </p>
    );
  }
  if (items === null) return <p className="text-sm text-ink-faint">{t('editor.loading')}</p>;
  if (items.length === 0)
    return <p className="text-sm text-ink-faint">{t('stock.historyEmpty')}</p>;
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line text-sm">
        {items.map((m) => (
          <li key={m.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
            <span
              className={cx(
                'w-16 font-mono font-semibold tabular-nums',
                m.delta > 0 ? 'text-ok-ink' : 'text-danger-ink',
              )}
            >
              {m.delta > 0 ? '+' : '−'}
              {formatInteger(Math.abs(m.delta))}
            </span>
            <span className="text-ink">{t(`stock.reasons.${m.reason}`, m.reason)}</span>
            <span className="font-mono text-ink-faint">→ {formatInteger(m.on_hand_after)}</span>
            {m.note && <span className="text-ink-muted">“{m.note}”</span>}
            <span className="ml-auto text-ink-faint">
              {t(`stock.actors.${m.actor_type}`, m.actor_type)} · {formatDateTime(m.created_at)}
            </span>
          </li>
        ))}
      </ul>
      {cursor && (
        <ActionButton onClick={() => void loadMore(cursor)}>{t('stock.loadMore')}</ActionButton>
      )}
    </div>
  );
}
