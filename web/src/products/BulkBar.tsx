import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  FolderTree,
  Layers,
  PackageCheck,
  Tag,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import type { components } from '../api/schema';
import {
  ActionButton,
  FilterTabs,
  FormError,
  Menu,
  MenuItem,
  Popover,
  cx,
  fieldClass,
  useToast,
} from '../components/ui';
import { useMediaQuery } from '../components/useMediaQuery';
import { formatBDT, parseCount } from '../i18n/format';
import { priceChange, type Direction, type PriceMode } from './bulkPrice';
import { useGroups } from './groups';

type Body = components['schemas']['ProductBulkUpdate'];
type PriceLine = components['schemas']['PriceLineRead'];
type Panel = 'category' | 'collection' | 'availability';

/**
 * A floating pill over the list while products are selected: one button per action, each one
 * all-or-nothing call. Success toasts and clears the selection; errors stay in the bar.
 */
export function BulkBar({
  productIds,
  shownCount,
  status,
  onSelectAll,
  onDone,
  onClear,
}: {
  productIds: string[];
  /** How many rows are loaded, for "Select all N shown". */
  shownCount: number;
  /** The status tab: Archive on Active, Restore on Archived. */
  status: 'active' | 'archived';
  onSelectAll: () => void;
  onDone: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  // Below `sm` the actions fold into one menu, and a chosen panel opens inside the pill.
  const wide = useMediaQuery('(min-width: 40rem)');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [pricing, setPricing] = useState(false);
  const priceButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  /** Sends one bulk change; true when it went through. */
  async function run(body: Omit<Body, 'product_ids'>, message: (count: number) => string) {
    const ids = productIds;
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.POST('/v1/products/bulk', { body: { ...body, product_ids: ids } }),
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setPanel(null);
    const archiving = body.action === 'archive' || body.action === 'unarchive';
    toast({
      message: message(result.data.updated),
      tone: 'ok',
      // Archiving and restoring are undone by the opposite action on the same products.
      action: archiving
        ? {
            label: t('products.undo'),
            onClick: () => void undo(ids, body.action === 'archive' ? 'unarchive' : 'archive'),
          }
        : undefined,
    });
    onDone();
    onClear();
    return true;
  }

  // Runs after the bar has gone (the selection is cleared), so it reports by toast.
  async function undo(ids: string[], action: 'archive' | 'unarchive') {
    const result = await call(() =>
      api.POST('/v1/products/bulk', { body: { product_ids: ids, action } }),
    );
    if (!result.ok) return toast({ message: result.error.message, tone: 'danger' });
    onDone();
    toast({ message: t('bulk.done', { count: result.data.updated }), tone: 'ok' });
  }

  const archive = () =>
    void (status === 'archived'
      ? run({ action: 'unarchive' }, (count) => t('bulk.restored', { count }))
      : run({ action: 'archive' }, (count) => t('bulk.archived', { count })));

  const forms: Record<Panel, ReactNode> = {
    category: <CategoryForm busy={busy} onApply={run} />,
    collection: <CollectionForm busy={busy} onApply={run} />,
    availability: <AvailabilityForm busy={busy} onApply={run} />,
  };
  const labels: Record<Panel, string> = {
    category: t('bulk.category'),
    collection: t('bulk.collection'),
    availability: t('bulk.availability'),
  };
  const icons = { category: FolderTree, collection: Layers, availability: PackageCheck };
  const panels: Panel[] = ['category', 'collection', 'availability'];
  const ArchiveIcon = status === 'archived' ? ArchiveRestore : Archive;
  const archiveLabel = t(status === 'archived' ? 'bulk.restore' : 'bulk.archive');

  return (
    <div
      role="toolbar"
      aria-label={t('bulk.toolbar')}
      className="sticky bottom-4 z-20 mx-auto mt-4 w-fit max-w-[calc(100%-2rem)] rounded-xl border border-line bg-panel px-3 py-2 shadow-lg motion-safe:transition motion-safe:duration-150 motion-safe:starting:translate-y-4 motion-safe:starting:opacity-0"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span className="tabular-nums text-xs whitespace-nowrap text-ink-muted">
          {t('bulk.selected', { count: productIds.length })}
        </span>
        {productIds.length < shownCount && (
          <ActionButton tone="ghost" size="sm" onClick={onSelectAll}>
            {t('bulk.selectAllShown', { count: shownCount })}
          </ActionButton>
        )}
        <ActionButton tone="ghost" size="sm" onClick={onClear}>
          {t('bulk.clear')}
        </ActionButton>
        <span aria-hidden className="mx-1 h-5 w-px bg-line max-sm:hidden" />
        {wide ? (
          <>
            <ActionButton
              ref={priceButton}
              size="sm"
              icon={Tag}
              disabled={busy}
              onClick={() => setPricing(true)}
            >
              {t('bulk.openPrice')}
            </ActionButton>
            {panels.map((key) => (
              <Popover
                key={key}
                open={panel === key}
                onOpenChange={(open) => {
                  setPanel(open ? key : null);
                  setError(null);
                }}
                align="center"
                className="w-72"
                trigger={
                  <ActionButton size="sm" icon={icons[key]} disabled={busy}>
                    {labels[key]}
                  </ActionButton>
                }
              >
                {forms[key]}
              </Popover>
            ))}
            <ActionButton size="sm" icon={ArchiveIcon} disabled={busy} onClick={archive}>
              {archiveLabel}
            </ActionButton>
          </>
        ) : (
          <Menu
            align="center"
            trigger={
              <ActionButton ref={menuButton} size="sm" disabled={busy}>
                {t('bulk.actionsMenu')}
                <ChevronDown aria-hidden className="size-3.5" />
              </ActionButton>
            }
          >
            <MenuItem icon={Tag} onSelect={() => setPricing(true)}>
              {t('bulk.openPrice')}
            </MenuItem>
            {panels.map((key) => (
              <MenuItem key={key} icon={icons[key]} onSelect={() => setPanel(key)}>
                {labels[key]}
              </MenuItem>
            ))}
            <MenuItem icon={ArchiveIcon} onSelect={archive}>
              {archiveLabel}
            </MenuItem>
          </Menu>
        )}
      </div>
      {!wide && panel && (
        <div className="mt-2 border-t border-line pt-3">
          <p className="mb-2 text-sm font-medium text-ink">{labels[panel]}</p>
          {forms[panel]}
        </div>
      )}
      <div className="mt-2 empty:hidden">
        <FormError error={error} />
      </div>
      {pricing && (
        <BulkPriceDialog
          productIds={productIds}
          onClose={() => {
            setPricing(false);
            (priceButton.current ?? menuButton.current)?.focus();
          }}
          onApplied={(count) => {
            setPricing(false);
            toast({ message: t('bulk.priceDone', { count }), tone: 'ok' });
            onDone();
            onClear();
          }}
        />
      )}
    </div>
  );
}

type Apply = (
  body: Omit<Body, 'product_ids'>,
  message: (count: number) => string,
) => Promise<boolean>;

function Problem({ text }: { text: string | undefined }) {
  if (!text) return null;
  return (
    <p role="alert" className="text-sm text-danger-ink">
      {text}
    </p>
  );
}

function CategoryForm({ busy, onApply }: { busy: boolean; onApply: Apply }) {
  const { t } = useTranslation();
  const categories = useGroups('categories');
  const [target, setTarget] = useState('');

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void onApply({ action: 'set_category', category_id: target || null }, (count) =>
      t('bulk.done', { count }),
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block text-sm font-medium text-ink-muted">
        {t('organise.category')}
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className={cx('mt-1 block w-full', fieldClass)}
        >
          <option value="">{t('organise.noCategory')}</option>
          {(categories.items ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <ActionButton type="submit" tone="primary" disabled={busy} className="w-full">
        {t('bulk.apply')}
      </ActionButton>
    </form>
  );
}

function CollectionForm({ busy, onApply }: { busy: boolean; onApply: Apply }) {
  const { t } = useTranslation();
  const collections = useGroups('collections');
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [problem, setProblem] = useState<string | undefined>();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) return setProblem(t('bulk.chooseCollection'));
    setProblem(undefined);
    void onApply(
      {
        action: mode === 'add' ? 'add_to_collection' : 'remove_from_collection',
        collection_id: target,
      },
      (count) => t('bulk.done', { count }),
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FilterTabs
        fill
        label={`${t('bulk.add')} / ${t('bulk.remove')}`}
        value={mode}
        onChange={setMode}
        tabs={[
          { value: 'add', label: t('bulk.add') },
          { value: 'remove', label: t('bulk.remove') },
        ]}
      />
      <label className="block text-sm font-medium text-ink-muted">
        {t('bulk.collection')}
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className={cx('mt-1 block w-full', fieldClass)}
        >
          <option value="">{t('bulk.pick')}</option>
          {(collections.items ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <Problem text={problem} />
      <ActionButton type="submit" tone="primary" disabled={busy} className="w-full">
        {t('bulk.apply')}
      </ActionButton>
    </form>
  );
}

function AvailabilityForm({ busy, onApply }: { busy: boolean; onApply: Apply }) {
  const { t } = useTranslation();
  const [availability, setAvailability] = useState<'in_stock' | 'pre_order' | 'made_to_order'>(
    'pre_order',
  );
  const [leadMin, setLeadMin] = useState('');
  const [leadMax, setLeadMax] = useState('');
  const [problem, setProblem] = useState<string | undefined>();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body: Omit<Body, 'product_ids'> = { action: 'set_availability', availability };
    if (availability !== 'in_stock') {
      const low = parseCount(leadMin);
      const high = parseCount(leadMax);
      if (low === null || high === null || low > high) {
        return setProblem(t('bulk.leadTimeNeeded'));
      }
      body.lead_time_days_min = low;
      body.lead_time_days_max = high;
    }
    setProblem(undefined);
    void onApply(body, (count) => t('bulk.done', { count }));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block text-sm font-medium text-ink-muted">
        {t('availability.title')}
        <select
          value={availability}
          onChange={(e) => setAvailability(e.target.value as typeof availability)}
          className={cx('mt-1 block w-full', fieldClass)}
        >
          {(['in_stock', 'pre_order', 'made_to_order'] as const).map((value) => (
            <option key={value} value={value}>
              {t(`availability.mode.${value}`)}
            </option>
          ))}
        </select>
      </label>
      {availability !== 'in_stock' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-medium text-ink-muted">
            {t('bulk.leadMin')}
            <input
              value={leadMin}
              onChange={(e) => setLeadMin(e.target.value)}
              inputMode="numeric"
              className={cx('mt-1 block w-full', fieldClass)}
            />
          </label>
          <label className="text-sm font-medium text-ink-muted">
            {t('bulk.leadMax')}
            <input
              value={leadMax}
              onChange={(e) => setLeadMax(e.target.value)}
              inputMode="numeric"
              className={cx('mt-1 block w-full', fieldClass)}
            />
          </label>
        </div>
      )}
      <Problem text={problem} />
      <ActionButton type="submit" tone="primary" disabled={busy} className="w-full">
        {t('bulk.apply')}
      </ActionButton>
    </form>
  );
}

function BulkPriceDialog({
  productIds,
  onClose,
  onApplied,
}: {
  productIds: string[];
  onClose: () => void;
  onApplied: (variants: number) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<PriceMode>('percent');
  const [direction, setDirection] = useState<Direction>('down');
  const [value, setValue] = useState('');
  const [sale, setSale] = useState(true);
  const [lines, setLines] = useState<PriceLine[] | null>(null);
  const [problem, setProblem] = useState<string | undefined>();
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const firstField = useRef<HTMLSelectElement>(null);

  useEffect(() => firstField.current?.focus(), []);

  async function send(preview: boolean) {
    const change = priceChange(mode, direction, value);
    if (!change) return void setProblem(t('bulk.price.invalid'));
    setProblem(undefined);
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.POST('/v1/products/bulk-price', {
        body: { product_ids: productIds, change, keep_old_as_regular: sale, preview },
      }),
    );
    setBusy(false);
    if (!result.ok) return void setError(result.error);
    if (preview) setLines(result.data.lines);
    else onApplied(result.data.lines.length);
  }

  function edited<T>(set: (value: T) => void) {
    return (next: T) => {
      setLines(null);
      set(next);
    };
  }

  const blocked = lines?.some((line) => line.problem) ?? false;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          // Handled here, so the list's own Escape doesn't also drop the selection.
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-price-title"
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-lg border border-line bg-panel p-4 sm:p-6"
      >
        <h2 id="bulk-price-title" className="text-lg font-semibold text-ink">
          {t('bulk.price.title')}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {t('bulk.price.hint', { count: productIds.length })}
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(true);
          }}
        >
          <label className="text-sm font-medium text-ink-muted">
            {t('bulk.price.mode')}
            <select
              ref={firstField}
              value={mode}
              onChange={(e) => edited(setMode)(e.target.value as PriceMode)}
              className={cx('mt-1 block', fieldClass)}
            >
              {(['percent', 'amount', 'set'] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`bulk.price.modes.${m}`)}
                </option>
              ))}
            </select>
          </label>
          {mode !== 'set' && (
            <label className="text-sm font-medium text-ink-muted">
              {t('bulk.price.direction')}
              <select
                value={direction}
                onChange={(e) => edited(setDirection)(e.target.value as Direction)}
                className={cx('mt-1 block', fieldClass)}
              >
                <option value="down">{t('bulk.price.down')}</option>
                <option value="up">{t('bulk.price.up')}</option>
              </select>
            </label>
          )}
          <label className="text-sm font-medium text-ink-muted">
            {mode === 'percent' ? t('bulk.price.percent') : t('bulk.price.taka')}
            <input
              value={value}
              onChange={(e) => edited(setValue)(e.target.value)}
              inputMode="decimal"
              className={cx('mt-1 block w-28', fieldClass)}
            />
          </label>
          <ActionButton type="submit" disabled={busy}>
            {t('bulk.price.preview')}
          </ActionButton>
        </form>
        <label className="mt-3 flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={sale}
            onChange={(e) => edited(setSale)(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="font-medium">{t('bulk.price.sale')}</span>
            <span className="block text-ink-muted">{t('bulk.price.saleHint')}</span>
          </span>
        </label>
        <p className="mt-2 text-sm text-ink-faint">{t('bulk.price.rounding')}</p>
        {problem && (
          <p role="alert" className="mt-2 text-sm text-danger-ink">
            {problem}
          </p>
        )}
        <div className="mt-2 empty:hidden">
          <FormError error={error} />
        </div>
        {lines && (
          <table className="mt-4 w-full text-sm">
            <caption className="sr-only">{t('bulk.price.previewTable')}</caption>
            <thead>
              <tr className="text-left text-ink-muted">
                <th className="py-1 font-medium">{t('bulk.price.product')}</th>
                <th className="py-1 font-medium">{t('bulk.price.old')}</th>
                <th className="py-1 font-medium">{t('bulk.price.new')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((line) => (
                <tr key={line.variant_id}>
                  <td className="py-2 text-ink">
                    {line.product_name}
                    {line.label && <span className="text-ink-faint"> · {line.label}</span>}
                    {line.problem && <span className="block text-danger-ink">{line.problem}</span>}
                  </td>
                  <td className="py-2 font-mono text-ink-muted">
                    {formatBDT(line.old_price_minor)}
                  </td>
                  <td className="py-2 font-mono text-ink">
                    {line.new_regular_minor !== null &&
                      line.new_regular_minor > line.new_price_minor && (
                        <s className="mr-2 text-ink-faint">{formatBDT(line.new_regular_minor)}</s>
                      )}
                    {formatBDT(line.new_price_minor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <ActionButton tone="ghost" onClick={onClose}>
            {t('bulk.price.cancel')}
          </ActionButton>
          <ActionButton
            tone="primary"
            disabled={busy || !lines || lines.length === 0 || blocked}
            onClick={() => void send(false)}
          >
            {t('bulk.price.apply', { count: lines?.length ?? 0 })}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
