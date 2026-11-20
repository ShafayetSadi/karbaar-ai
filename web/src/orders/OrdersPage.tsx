import { useFeatures } from '../entitlements/useFeatures';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownUp, Download, Filter, Plus, RefreshCw, SearchX, ShoppingBag } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { call } from '../api/call';
import { unwrap } from '../api/query';
import type { ApiError } from '../api/errors';
import {
  ActionButton,
  Chip,
  FilterTabs,
  Skeleton,
  actionButtonClass,
  cx,
  fieldClass,
} from '../components/ui';
import { useApproval } from '../auth/useApproval';
import { ApprovalLock } from '../components/ApprovalLock';
import { useMediaQuery } from '../components/useMediaQuery';
import { DeliveryRecordChip } from '../customers/DeliveryRecordChip';
import { SearchBox } from '../inbox/SearchBox';
import { EmptyState } from '../products/list/EmptyState';
import { dhakaDay, formatAgo, formatBDT, formatDateTime, formatPhone } from '../i18n/format';
import { advancePending } from './advance';
import { ConfirmationBadge } from './Confirmation';
import { ReadyBadge } from './ReadyBadge';
import { StatusBadge } from './StatusBadge';
import { CustomerInitials, OrderThumb } from './OrderRowMedia';
import { StatusCards, STATUS_CARDS, type StatusCard } from './StatusCards';
import { ToChaseList } from './ToChaseList';
import type { Order, OrderRow, OrderStatus } from './orderForm';
import { can } from './orderActions';
import { BULK_OUTCOMES, canMarkOutcome, keyKeeper, type BulkOutcome } from './outcomes';
import type { CourierConnection } from './shipments';

// `processing` has no tab: it is a short step between confirmed and shipped.
const TABS = [
  'all',
  'pending',
  'toCall',
  'toChase',
  'confirmed',
  'readySoon',
  'shipped',
  'delivered',
  'returned',
  'needsReview',
  'cancelled',
] as const;
type Tab = (typeof TABS)[number];

const SOURCES = ['all', 'storefront', 'web_chat', 'messenger', 'dashboard'] as const;
type SourceFilter = (typeof SOURCES)[number];

type BulkResult = { accepted: number; refused: { number: number | null; code: string }[] };
/** Each selected order's answer to "Book with …", shown on its row. */
type Booked = Map<string, { ok: true } | { ok: false; message: string }>;

/** The tabs that show how many orders wait in them, and the API count behind each. */
const ACTION_COUNTS: Partial<Record<Tab, 'to_call' | 'to_chase' | 'ready_soon' | 'needs_review'>> =
  {
    toCall: 'to_call',
    toChase: 'to_chase',
    readySoon: 'ready_soon',
    needsReview: 'needs_review',
  };

/** The pills beside the status cards: the tabs that ask the merchant to act. */
const ACTION_TABS = TABS.filter((value) => value in ACTION_COUNTS);

const PAGE_SIZE = 25;
const READY_SOON_DAYS = 7;

/** Confirmed orders that must be ready within a week (or already overdue): `ready_by < today + 8`. */
function readySoonCutoff(): string {
  return dhakaDay(Date.now() + (READY_SOON_DAYS + 1) * 24 * 60 * 60 * 1000);
}

/** Orders a bulk button applies to: the order's `allowed_actions` list what that button does. */
function canBookInBulk(order: OrderRow): boolean {
  return can(order, 'book_courier');
}

/** Orders the list lets the merchant select: at least one bulk button applies to them. */
function canSelect(order: OrderRow): boolean {
  return canBookInBulk(order) || BULK_OUTCOMES.some((outcome) => canMarkOutcome(order, outcome));
}

/** The API filters behind a tab. */
function filterOf(tab: Tab): {
  status?: OrderStatus;
  ready_by_before?: string;
  confirmation?: 'needs_call';
  shipment?: 'needs_review';
} {
  if (tab === 'all') return {};
  if (tab === 'toChase') return {};
  // Courier shipments the merchant must look at: unknown outcome, partial, cancelled after booking.
  if (tab === 'needsReview') return { shipment: 'needs_review' };
  // Orders the customer did not confirm in Messenger (ADR 0032): the merchant phones them.
  if (tab === 'toCall') return { confirmation: 'needs_call' };
  if (tab === 'readySoon') return { status: 'confirmed', ready_by_before: readySoonCutoff() };
  return { status: tab };
}

export function OrdersPage() {
  const features = useFeatures();
  const courierBooking = features.isEnabled('courier_booking', false);
  const { t } = useTranslation();
  const { locked } = useApproval();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab') as Tab;
  const tab: Tab =
    TABS.includes(requestedTab) && (requestedTab !== 'needsReview' || courierBooking)
      ? requestedTab
      : 'all';
  const website = features.isEnabled('website', false);
  const webChat = features.isEnabled('web_chat', false);
  const availableSources = SOURCES.filter(
    (s) => (website || s !== 'storefront') && (webChat || s !== 'web_chat'),
  );
  const requestedSource = params.get('source') as SourceFilter;
  const source: SourceFilter = availableSources.includes(requestedSource) ? requestedSource : 'all';
  const [loadedPages, setLoadedPages] = useState(0);
  const requestedPages = Math.max(1, Math.min(100, Number(params.get('pages')) || 1));
  const search = params.get('q') ?? '';
  const sort = params.get('sort') === 'oldest' ? 'oldest' : 'newest';
  const update = (key: string, value: string, replace = false) => {
    setLoadedPages(0);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        next.delete('pages');
        return next;
      },
      { replace },
    );
  };
  const setTab = (value: Tab) => update('tab', value);
  const setSource = (value: SourceFilter) => update('source', value);
  const setSearch = (value: string) => update('q', value, true);
  const setSort = (value: 'newest' | 'oldest') => update('sort', value);
  const queryClient = useQueryClient();
  // When the list last loaded, and a clock that ticks so "Updated 3m ago" stays true.
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const [items, setItems] = useState<OrderRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [bulkError, setBulkError] = useState<ApiError | null>(null);
  const bulkKeys = useRef(keyKeeper());
  const [couriers, setCouriers] = useState<CourierConnection[]>([]);
  const [booked, setBooked] = useState<Booked>(new Map());
  const [bookedSummary, setBookedSummary] = useState<{
    courier: string;
    accepted: number;
    refused: number;
  } | null>(null);

  // Only the newest request may fill the list: an older, slower answer for another tab or search
  // must not replace it.
  const latest = useRef(0);
  // How many orders wait in the tabs that ask for action. They ignore the search box.
  const countsQuery = useQuery({
    queryKey: ['orders', 'counts'],
    queryFn: async () =>
      unwrap(
        await call(() =>
          api.GET('/v1/orders/counts', {
            params: { query: { ready_by_before: readySoonCutoff() } },
          }),
        ),
      ),
  });
  const counts = countsQuery.data;
  const refreshCounts = () =>
    void queryClient.invalidateQueries({ queryKey: ['orders', 'counts'] });

  const load = useCallback(
    async (
      which: Tab,
      after: string | null,
      q: string,
      order: 'newest' | 'oldest',
      src: SourceFilter,
    ) => {
      if (which === 'toChase') {
        setItems([]);
        setCursor(null);
        setLoading(false);
        return;
      }
      const request = ++latest.current;
      setLoading(true);
      const result = await call(() =>
        api.GET('/v1/orders', {
          params: {
            query: {
              ...filterOf(which),
              source: src === 'all' ? undefined : src,
              q: q || undefined,
              sort: order,
              cursor: after,
              limit: PAGE_SIZE,
            },
          },
        }),
      );
      if (request !== latest.current) return;
      if (result.ok) {
        setItems((current) => (after ? [...current, ...result.data.items] : result.data.items));
        setCursor(result.data.next_cursor);
        setLoadedPages((current) => (after ? current + 1 : 1));
        setFailed(false);
        if (!after) {
          setUpdatedAt(Date.now());
          setNow(Date.now());
        }
      } else {
        setFailed(true);
      }
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- fetch on tab change
    void load(tab, null, search, sort, source);
  }, [load, tab, search, sort, source]);

  useEffect(() => {
    if (loading || failed || loadedPages === 0) return;
    if (loadedPages < requestedPages && cursor) {
      const timer = setTimeout(() => void load(tab, cursor, search, sort, source), 0);
      return () => clearTimeout(timer);
    } else if (loadedPages > requestedPages) {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('pages', String(loadedPages));
          return next;
        },
        { replace: true },
      );
    }
  }, [
    loadedPages,
    requestedPages,
    loading,
    failed,
    cursor,
    load,
    tab,
    search,
    sort,
    source,
    setParams,
  ]);

  useEffect(() => {
    // No couriers (or none on this server): the list simply offers no booking.
    if (!courierBooking) return;
    void call(() => api.GET('/v1/courier-connections')).then((result) => {
      if (result.ok) setCouriers(result.data.items.filter((c) => c.status === 'active'));
    });
  }, [courierBooking]);

  // Narrow screens fold the chips and courier under the customer instead of giving them columns.
  const wide = useMediaQuery('(min-width: 48rem)');
  const columns = wide
    ? ([
        'number',
        'customer',
        'total',
        'status',
        ...(courierBooking ? ['courier' as const] : []),
        'placed',
      ] as const)
    : (['number', 'customer', 'total'] as const);
  // Wide rows are one line tall, so their cells centre; narrow rows stack, so they start at the top.
  const cellAlign = wide ? 'align-middle' : 'align-top';

  function changeTab(next: Tab) {
    setTab(next);
    resetSelection();
  }

  function changeSource(next: SourceFilter) {
    setSource(next);
    resetSelection();
  }

  function changeSearch(next: string) {
    setSearch(next);
    resetSelection();
  }

  function changeSort() {
    setSort(sort === 'newest' ? 'oldest' : 'newest');
    resetSelection();
  }

  function resetSelection() {
    setSelected(new Set());
    setBulkResult(null);
    setBooked(new Map());
    setBookedSummary(null);
  }

  // Load the next page as the end of the list scrolls into view; "Load more" stays as the fallback.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || loading || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void load(tab, cursor, search, sort, source);
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, loading, load, tab, search, sort, source]);

  // `n` starts a new order and Escape drops the selection, unless a field or dialog has the key.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey || typingInField(event.target)) return;
      if (event.key === 'n') {
        event.preventDefault();
        void navigate('/orders/new');
      } else if (event.key === 'Escape') {
        setSelected(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const markable = items.filter(canSelect);
  const allSelected = markable.length > 0 && markable.every((order) => selected.has(order.id));

  function toggle(orderId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(markable.map((order) => order.id)));
  }

  async function markSelected(outcome: BulkOutcome) {
    const orderIds = items
      .filter((order) => selected.has(order.id) && canMarkOutcome(order, outcome))
      .map((order) => order.id);
    if (orderIds.length === 0) return;
    const key = bulkKeys.current.key(`${outcome}|${orderIds.join(',')}`);
    setBulkBusy(true);
    setBulkError(null);
    setBulkResult(null);
    const result = await call(() =>
      api.POST('/v1/orders/outcomes', {
        params: { header: { 'Idempotency-Key': key } },
        body: { outcome, order_ids: orderIds },
      }),
    );
    bulkKeys.current.settle(!result.ok && result.error.code === 'NETWORK_ERROR');
    setBulkBusy(false);
    if (!result.ok) {
      setBulkError(result.error);
      return;
    }
    const numbers = new Map(items.map((order) => [order.id, order.number]));
    setBulkResult({
      accepted: result.data.accepted.length,
      refused: result.data.refused.map((r) => ({
        number: numbers.get(r.order_id) ?? null,
        code: r.code,
      })),
    });
    setSelected(new Set());
    await load(tab, null, search, sort, source);
    refreshCounts();
  }

  async function bookSelected(courier: CourierConnection) {
    const orderIds = items
      .filter((order) => selected.has(order.id) && canBookInBulk(order))
      .map((order) => order.id);
    if (orderIds.length === 0) return;
    const key = bulkKeys.current.key(`book|${courier.id}|${orderIds.join(',')}`);
    setBulkBusy(true);
    setBulkError(null);
    setBulkResult(null);
    setBookedSummary(null);
    const result = await call(() =>
      api.POST('/v1/shipments/bulk', {
        params: { header: { 'Idempotency-Key': key } },
        body: { order_ids: orderIds, connection_id: courier.id },
      }),
    );
    bulkKeys.current.settle(!result.ok && result.error.code === 'NETWORK_ERROR');
    setBulkBusy(false);
    if (!result.ok) {
      // A problem with the courier account itself: nothing was booked.
      setBulkError(result.error);
      return;
    }
    const answers: Booked = new Map();
    for (const a of result.data.accepted) answers.set(a.order_id, { ok: true });
    for (const r of result.data.refused) answers.set(r.order_id, { ok: false, message: r.message });
    setBooked(answers);
    setBookedSummary({
      courier: courier.label,
      accepted: result.data.accepted.length,
      refused: result.data.refused.length,
    });
    setSelected(new Set());
    await load(tab, null, search, sort, source);
    refreshCounts();
  }

  function refresh() {
    void load(tab, null, search, sort, source);
    refreshCounts();
  }

  const { status: exportStatus, confirmation: exportConfirmation } = filterOf(tab);
  const exportParams = new URLSearchParams();
  if (exportConfirmation) exportParams.set('confirmation', exportConfirmation);
  if (exportStatus) exportParams.set('status', exportStatus);
  if (source !== 'all') exportParams.set('source', source);
  const exportQuery = exportParams.toString() ? `?${exportParams.toString()}` : '';
  const exportHref = `/v1/orders/export.csv${exportQuery}`;
  const canMarkSelected = (outcome: BulkOutcome) =>
    items.some((order) => selected.has(order.id) && canMarkOutcome(order, outcome));
  const bookable = items.some((order) => selected.has(order.id) && canBookInBulk(order));

  const showSkeleton = loading && items.length === 0 && !failed;

  return (
    <section className="pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">{t('orders.title')}</h1>
        <div className="flex items-center gap-2">
          {updatedAt !== null && (
            <span className="text-xs text-ink-faint max-sm:hidden">
              {now - updatedAt < 60_000
                ? t('orders.updatedNow')
                : t('orders.updated', { ago: formatAgo(new Date(updatedAt), now) })}
            </span>
          )}
          <ActionButton
            icon={RefreshCw}
            onClick={refresh}
            disabled={loading}
            title={t('orders.refresh')}
            aria-label={t('orders.refresh')}
          />
          {/* A plain same-origin GET: the session cookie goes with it and the browser downloads.
              The export has no courier filter, so the Needs review tab offers none. */}
          {tab !== 'needsReview' && (
            <a
              href={exportHref}
              download
              title={t('orders.export')}
              className={actionButtonClass()}
            >
              <Download aria-hidden className="size-4" />
              <span className="max-sm:sr-only">{t('orders.export')}</span>
            </a>
          )}
          <Link
            to="/orders/new"
            title={t('orders.newShortcut')}
            className={actionButtonClass({ tone: 'primary' })}
          >
            <Plus aria-hidden className="size-4" />
            {t('orders.new')}
          </Link>
        </div>
      </div>

      {/* Lifecycle on the left, what asks for action on the right: one line of filters. */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <StatusCards
          active={(STATUS_CARDS as readonly string[]).includes(tab) ? (tab as StatusCard) : null}
          counts={counts?.by_status}
          failed={countsQuery.isError}
          onChange={changeTab}
        />
        <FilterTabs
          label={t('orders.filters')}
          value={tab}
          onChange={changeTab}
          tabs={ACTION_TABS.filter((value) => value !== 'needsReview' || courierBooking).map(
            (value) => {
              const field = ACTION_COUNTS[value];
              const count = field ? counts?.[field] : undefined;
              return {
                value,
                label: t(`orders.tab.${value}`),
                count: count || null,
                countLabel: t('orders.tabCount', { count: count ?? 0 }),
                countTone: 'warn' as const,
              };
            },
          )}
        />
      </div>

      {tab === 'toChase' ? (
        <div className="mt-5">
          <ToChaseList onCountsChanged={refreshCounts} />
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1 basis-full sm:basis-auto sm:max-w-md">
              <SearchBox
                value={search}
                onSearch={changeSearch}
                label={t('orders.searchPlaceholder')}
                placeholder={t('orders.searchPlaceholder')}
              />
            </div>
            <select
              value={source}
              onChange={(e) => changeSource(e.target.value as SourceFilter)}
              aria-label={t('orders.sourceFilter.label')}
              className={cx('flex-1 py-2 text-sm sm:flex-none', fieldClass)}
            >
              {availableSources.map((s) => (
                <option key={s} value={s}>
                  {t(`orders.sourceFilter.${s}`)}
                </option>
              ))}
            </select>
            <ActionButton
              icon={ArrowDownUp}
              onClick={changeSort}
              title={t('orders.sortToggle')}
              className="py-2"
            >
              <span className="max-sm:sr-only">{t(`orders.sort.${sort}`)}</span>
            </ActionButton>
          </div>

          {failed && (
            <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
              {t('orders.loadFailed')}
            </p>
          )}

          {bulkError && (
            <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
              {bulkError.message}
            </p>
          )}
          {bulkResult && (
            <p role="status" className="mt-4 rounded-md bg-panel-muted px-3 py-2 text-sm text-ink">
              {t('orders.bulk.done', { count: bulkResult.accepted })}
              {bulkResult.refused.length > 0 &&
                ` ${t('orders.bulk.refused', {
                  orders: bulkResult.refused
                    .map((r) => (r.number === null ? r.code : `#${r.number}`))
                    .join(', '),
                })}`}
            </p>
          )}

          {bookedSummary && (
            <p role="status" className="mt-4 rounded-md bg-panel-muted px-3 py-2 text-sm text-ink">
              {t('orders.bulk.booked', {
                count: bookedSummary.accepted,
                courier: bookedSummary.courier,
              })}
              {bookedSummary.refused > 0 &&
                ` ${t('orders.bulk.notBooked', { count: bookedSummary.refused })}`}
            </p>
          )}

          <div className="mt-4">
            {showSkeleton ? (
              <>
                <span className="sr-only">{t('orders.loading')}</span>
                <OrdersSkeleton />
              </>
            ) : !failed && !loading && items.length === 0 ? (
              search ? (
                <EmptyState icon={SearchX} title={t('orders.emptySearch')}>
                  <ActionButton onClick={() => changeSearch('')}>
                    {t('orders.clearSearch')}
                  </ActionButton>
                </EmptyState>
              ) : tab === 'all' ? (
                <EmptyState icon={ShoppingBag} title={t('orders.empty')}>
                  <Link to="/orders/new" className={actionButtonClass({ tone: 'primary' })}>
                    <Plus aria-hidden className="size-4" />
                    {t('orders.new')}
                  </Link>
                </EmptyState>
              ) : (
                <EmptyState icon={Filter} title={t('orders.emptyFiltered')}>
                  <ActionButton onClick={() => changeTab('all')}>
                    {t('orders.clearTab')}
                  </ActionButton>
                </EmptyState>
              )
            ) : (
              items.length > 0 && (
                <div
                  className={cx('overflow-x-auto rounded-xl', loading && 'opacity-60')}
                  aria-busy={loading}
                >
                  <table className="w-full overflow-clip rounded-xl border border-line bg-panel text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-panel shadow-[inset_0_-1px_0_var(--color-line)]">
                      <tr className="font-medium text-xs text-ink-faint">
                        <th scope="col" className="w-10 py-2.5 pl-4 align-middle">
                          {markable.length > 0 && (
                            <input
                              type="checkbox"
                              aria-label={t('orders.bulk.selectAll')}
                              checked={allSelected}
                              onChange={toggleAll}
                            />
                          )}
                        </th>
                        {columns.map((key) => (
                          <th
                            key={key}
                            scope="col"
                            className={cx(
                              'px-3 py-2.5 font-medium whitespace-nowrap',
                              key === 'total' && 'text-right',
                              wide && key === 'number' && 'w-[34%]',
                              wide && key === 'customer' && 'w-[26%]',
                            )}
                          >
                            {t(`orders.col.${key}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {items.map((order) => {
                        const on = selected.has(order.id);
                        return (
                          <tr
                            key={order.id}
                            onClick={(event) => {
                              if (!fromControl(event)) void navigate(`/orders/${order.id}`);
                            }}
                            className={cx(
                              'cursor-pointer motion-safe:transition-colors',
                              on
                                ? 'bg-panel-muted shadow-[inset_2px_0_0_var(--color-active)]'
                                : 'hover:bg-panel-muted/60',
                            )}
                          >
                            <td className={cx('py-2.5 pl-4', cellAlign)}>
                              {canSelect(order) && (
                                <input
                                  type="checkbox"
                                  aria-label={t('orders.bulk.select', { number: order.number })}
                                  checked={on}
                                  onChange={() => toggle(order.id)}
                                />
                              )}
                            </td>
                            <th scope="row" className={cx('px-3 py-2.5 font-normal', cellAlign)}>
                              {/* The photo beside the number, not under it: one line of text sets
                                  the row's height instead of a stacked thumbnail. */}
                              <span
                                className={cx(
                                  'flex gap-3',
                                  wide ? 'items-center' : 'flex-col-reverse items-start gap-1.5',
                                )}
                              >
                                <OrderThumb order={order} />
                                <span className="min-w-0">
                                  <Link
                                    to={`/orders/${order.id}`}
                                    className="font-mono font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-active"
                                  >
                                    #{order.number}
                                  </Link>
                                  {wide && <ItemSummary order={order} />}
                                </span>
                              </span>
                            </th>
                            <td className={cx('px-3 py-2.5 text-ink', cellAlign)}>
                              <span className="flex items-center gap-2.5">
                                {wide && <CustomerInitials name={order.customer.name} />}
                                <span className="min-w-0">
                                  {order.customer.name ?? t('orders.none')}
                                  {order.customer.phone && (
                                    <span className="block font-mono text-xs whitespace-nowrap text-ink-faint">
                                      {formatPhone(order.customer.phone)}
                                    </span>
                                  )}
                                </span>
                              </span>
                              {!wide && (
                                <span className="mt-1.5 block">
                                  <span className="mb-1 block text-xs text-ink-faint tabular-nums">
                                    {formatDateTime(order.created_at)}
                                  </span>
                                  <OrderChips order={order} webChat={webChat} />
                                  {courierBooking && (
                                    <CourierCell order={order} answer={booked.get(order.id)} />
                                  )}
                                </span>
                              )}
                            </td>
                            <td
                              className={cx(
                                'px-3 py-2.5 text-right font-mono whitespace-nowrap text-ink tabular-nums',
                                cellAlign,
                              )}
                            >
                              {formatBDT(order.total_minor)}
                              {order.delivery.fee_minor > 0 && (
                                <span className="block font-sans text-xs font-normal text-ink-faint">
                                  {t('orders.deliveryLine', {
                                    fee: formatBDT(order.delivery.fee_minor),
                                  })}
                                </span>
                              )}
                            </td>
                            {wide && (
                              <>
                                <td className="px-3 py-2.5 align-middle">
                                  <OrderChips order={order} webChat={webChat} />
                                </td>
                                {courierBooking && (
                                  <td className="px-3 py-2.5 align-middle">
                                    <CourierCell order={order} answer={booked.get(order.id)} />
                                  </td>
                                )}
                                <td className="px-3 py-2.5 align-middle tabular-nums text-xs whitespace-nowrap text-ink-muted">
                                  {formatDateTime(order.created_at)}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          <div ref={sentinel} />
          {loading && items.length > 0 && (
            <p className="mt-4 text-center text-sm text-ink-faint">{t('orders.loading')}</p>
          )}
          {cursor && !loading && (
            <div className="mt-4 flex justify-center">
              <ActionButton onClick={() => void load(tab, cursor, search, sort, source)}>
                {t('orders.loadMore')}
              </ActionButton>
            </div>
          )}

          {selected.size > 0 && (
            <div
              role="toolbar"
              aria-label={t('orders.bulk.label')}
              className="sticky bottom-4 z-20 mx-auto mt-4 w-fit max-w-[calc(100%-2rem)] rounded-xl border border-line bg-panel px-3 py-2 shadow-lg motion-safe:transition motion-safe:duration-150 motion-safe:starting:translate-y-4 motion-safe:starting:opacity-0"
            >
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                <span className="tabular-nums text-xs whitespace-nowrap text-ink-muted">
                  {t('orders.bulk.selected', { count: selected.size })}
                </span>
                {BULK_OUTCOMES.filter(canMarkSelected).map((outcome) => (
                  <ActionButton
                    key={outcome}
                    size="sm"
                    tone={outcome === 'delivered' ? 'primary' : 'neutral'}
                    disabled={bulkBusy}
                    onClick={() => void markSelected(outcome)}
                  >
                    {t(`orders.bulk.${outcome}`)}
                  </ActionButton>
                ))}
                {courierBooking &&
                  bookable &&
                  couriers.map((courier) => (
                    <ActionButton
                      key={courier.id}
                      size="sm"
                      tone="primary"
                      disabled={bulkBusy || locked}
                      onClick={() => void bookSelected(courier)}
                    >
                      {t('orders.bulk.bookWith', { courier: courier.label })}
                    </ActionButton>
                  ))}
                {courierBooking && bookable && locked && <ApprovalLock />}
                <ActionButton size="sm" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
                  {t('orders.bulk.clear')}
                </ActionButton>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** What is going on with an order, as a row of chips. */
function OrderChips({ order, webChat }: { order: Order; webChat: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap items-center gap-1">
      <StatusBadge status={order.status} />
      {order.source === 'storefront' && (
        <Chip tone="neutral">{t('orders.sourceBadge.storefront')}</Chip>
      )}
      {webChat && order.source === 'web_chat' && (
        <Chip tone="neutral">{t('orders.sourceBadge.web_chat')}</Chip>
      )}
      {order.source === 'storefront' && !order.phone_verified_at && (
        <Chip tone="warn">{t('orders.phoneNotVerified')}</Chip>
      )}
      <ConfirmationBadge confirmation={order.confirmation} />
      {order.is_partial_delivery && <Chip tone="warn">{t('orders.outcome.partialChip')}</Chip>}
      <ReadyBadge order={order} />
      <DeliveryRecordChip record={order.customer_record} />
      {advancePending(order) && <Chip tone="warn">{t('orders.advance.pendingChip')}</Chip>}
    </span>
  );
}

/** What was ordered, in brief: the first line's product, its variant and quantity. */
function ItemSummary({ order }: { order: OrderRow }) {
  const first = order.items[0];
  if (!first) return null;
  return (
    <span className="block max-w-72 truncate text-xs text-ink-muted" title={first.product_name}>
      {first.product_name}
      {first.variant_label && <span className="text-ink-faint">, {first.variant_label}</span>}
      {first.quantity > 1 && (
        <span className="text-ink-faint tabular-nums"> ×{first.quantity}</span>
      )}
    </span>
  );
}

/** Placeholder rows while the first page loads. */
function OrdersSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden className="divide-y divide-line rounded-xl border border-line bg-panel">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-4" />
          <Skeleton className="size-10 rounded-md" />
          <div className="w-1/4 space-y-2">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/4" />
            <Skeleton className="h-3 w-1/6" />
          </div>
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-5 w-20 max-md:hidden" />
        </div>
      ))}
    </div>
  );
}

/** Clicks on these inside a row act on their own, not open the order. */
function fromControl(e: MouseEvent) {
  const target = e.target as HTMLElement;
  return (
    !e.currentTarget.contains(target) || target.closest('a, button, input, label, select') !== null
  );
}

function typingInField(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** The order's newest courier booking in brief, and the answer to a bulk booking just made. */
function CourierCell({
  order,
  answer,
}: {
  order: Order;
  answer: { ok: true } | { ok: false; message: string } | undefined;
}) {
  const { t } = useTranslation();
  const shipment = order.shipment;
  return (
    <span className="block text-xs">
      {shipment && (
        <span className="flex flex-wrap items-center gap-1">
          <span className="text-ink-muted">
            {t(`couriers.providers.${shipment.provider}`, { defaultValue: shipment.provider })}
          </span>
          <Chip tone={shipment.needs_review_reason ? 'warn' : 'neutral'}>
            {shipment.needs_review_reason
              ? t('orders.tab.needsReview')
              : t(`shipments.status.${shipment.status}`, { defaultValue: shipment.status })}
          </Chip>
          {shipment.tracking_code && (
            <span className="font-mono text-ink">{shipment.tracking_code}</span>
          )}
        </span>
      )}
      {answer && !answer.ok && <span className="mt-1 block text-danger-ink">{answer.message}</span>}
    </span>
  );
}
