import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { call } from '../../api/call';
import type { ApiError } from '../../api/errors';
import { unwrap } from '../../api/query';
import {
  ActionButton,
  Field,
  FormError,
  IconButton,
  Popover,
  Skeleton,
  cx,
  fieldClass,
  useToast,
} from '../../components/ui';
import { formatInteger, parseUnitChange } from '../../i18n/format';
import { activeVariants } from '../listPrice';
import { formatOptions } from '../options';
import type { Product } from '../ProductsPage';
import { adjustMany, adjustOne, insufficientMessage } from '../stockApi';
import { StockLine } from './cells';
import { QUICK_VARIANTS, quickTriggerClass } from './QuickPrice';

/** How long the server's new levels stay on screen before the popover closes. */
const SHOW_RESULT_MS = 1200;

/**
 * The list's stock cell as a button: add or remove units per active variant. Only for products
 * whose stock is tracked; otherwise the cell stays plain text.
 */
export function QuickStock({ product, className }: { product: Product; className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Stable, so re-renders while the result shows don't restart the closing timer.
  const close = useCallback(() => setOpen(false), []);
  if (!product.track_inventory || !product.stock) {
    return <StockLine product={product} className={className} />;
  }
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      className="w-80"
      trigger={
        <button
          type="button"
          aria-label={t('products.editStock', { name: product.name })}
          className={quickTriggerClass}
        >
          <StockLine product={product} className={className} />
        </button>
      }
    >
      <StockForm product={product} onDone={close} />
    </Popover>
  );
}

/** "+3", "-2" or "" for no change, from a stepper press on what's typed. */
function stepped(text: string, by: number) {
  const next = (text.trim() ? (parseUnitChange(text) ?? 0) : 0) + by;
  return next === 0 ? '' : next > 0 ? `+${next}` : String(next);
}

function StockForm({ product, onDone }: { product: Product; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const variants = activeVariants(product);
  const shown = variants.slice(0, QUICK_VARIANTS);
  const ids = shown.map((v) => v.id);
  const levels = useQuery({
    queryKey: ['inventory', 'levels', ids],
    queryFn: async () =>
      unwrap(
        await call(() =>
          api.GET('/v1/inventory/levels', { params: { query: { variant_id: ids } } }),
        ),
      ),
  });
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [problem, setProblem] = useState<string | undefined>();
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  // The levels the server returned after the change, shown for a moment before closing.
  const [result, setResult] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(onDone, SHOW_RESULT_MS);
    return () => clearTimeout(timer);
  }, [result, onDone]);

  const onHand =
    result ?? Object.fromEntries((levels.data?.items ?? []).map((l) => [l.variant_id, l.on_hand]));
  const locked = busy || result !== null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked) return;
    const items: { variant_id: string; delta: number }[] = [];
    const bad: Record<string, boolean> = {};
    for (const id of ids) {
      const text = changes[id]?.trim() ?? '';
      if (!text) continue;
      const delta = parseUnitChange(text);
      if (delta === null) bad[id] = true;
      else items.push({ variant_id: id, delta });
    }
    setInvalid(bad);
    setProblem(undefined);
    setError(null);
    if (Object.keys(bad).length > 0 || items.length === 0) return;

    setBusy(true);
    const trimmed = note.trim() || null;
    // One variant is a plain correction; several go in one all-or-nothing call.
    const outcome =
      items.length === 1
        ? await adjustOne(items[0]!.variant_id, items[0]!.delta, { note: trimmed }).then((r) =>
            r.ok ? { ok: true as const, levels: [r.data.level] } : r,
          )
        : await adjustMany(items, trimmed).then((r) =>
            r.ok ? { ok: true as const, levels: r.data.levels } : r,
          );
    setBusy(false);
    if (!outcome.ok) {
      const message = insufficientMessage(outcome.error, t, items.length > 1);
      if (message) setProblem(message);
      else setError(outcome.error);
      return;
    }
    setResult({
      ...onHand,
      ...Object.fromEntries(outcome.levels.map((l) => [l.variant_id, l.on_hand])),
    });
    setChanges({});
    // Totals, stock chips and the Low and Out counts all come from the products queries.
    void queryClient.invalidateQueries({ queryKey: ['products'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    toast({ message: t('products.stockUpdated'), tone: 'ok' });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {levels.isPending && <span className="sr-only">{t('products.loading')}</span>}
      {levels.isError && (
        <p role="alert" className="text-sm text-danger-ink">
          {t('stock.loadFailed')}
        </p>
      )}
      <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
        {shown.map((variant) => {
          const label = formatOptions(variant.option_values) || t('stock.defaultVariant');
          const value = changes[variant.id] ?? '';
          const level = onHand[variant.id];
          return (
            <li key={variant.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{label}</p>
                <p className="text-xs text-ink-muted">
                  {t('stock.onHand')}:{' '}
                  {levels.isPending && !result ? (
                    <Skeleton className="inline-block h-3 w-8 align-middle" />
                  ) : (
                    <span
                      className={cx(
                        'font-mono font-semibold tabular-nums',
                        result ? 'text-ok-ink' : 'text-ink',
                      )}
                    >
                      {level === undefined ? '—' : formatInteger(level)}
                    </span>
                  )}
                </p>
              </div>
              <IconButton
                icon={Minus}
                label={t('products.stockLess', { name: label })}
                disabled={locked}
                onClick={() => setChanges((c) => ({ ...c, [variant.id]: stepped(value, -1) }))}
              />
              <input
                aria-label={t('products.stockChange', { name: label })}
                aria-invalid={invalid[variant.id] ? true : undefined}
                value={value}
                onChange={(e) => setChanges((c) => ({ ...c, [variant.id]: e.target.value }))}
                disabled={locked}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                className={cx('w-16 py-1 text-center font-mono', fieldClass)}
              />
              <IconButton
                icon={Plus}
                label={t('products.stockMore', { name: label })}
                disabled={locked}
                onClick={() => setChanges((c) => ({ ...c, [variant.id]: stepped(value, 1) }))}
              />
            </li>
          );
        })}
      </ul>
      {Object.keys(invalid).length > 0 && (
        <p role="alert" className="text-sm text-danger-ink">
          {t('stock.invalidChange')}
        </p>
      )}
      <Field
        label={t('stock.note')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={locked}
        maxLength={200}
        autoComplete="off"
      />
      {problem && (
        <p role="alert" className="text-sm text-danger-ink">
          {problem}
        </p>
      )}
      <FormError error={error} />
      <div className="flex items-center justify-between gap-2">
        {variants.length > QUICK_VARIANTS ? (
          <Link
            to={`/products/${product.id}`}
            className="text-sm font-medium text-active hover:underline"
          >
            {t('products.editAllVariants')}
          </Link>
        ) : (
          <span />
        )}
        <ActionButton type="submit" tone="primary" disabled={locked}>
          {t('stock.adjust')}
        </ActionButton>
      </div>
    </form>
  );
}
