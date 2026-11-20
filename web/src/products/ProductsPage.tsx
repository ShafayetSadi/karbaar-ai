import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Archive,
  Download,
  Filter,
  Package,
  PackageCheck,
  Plus,
  SearchX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { call } from '../api/call';
import { unwrap } from '../api/query';
import type { components } from '../api/schema';
import { ActionButton, FilterTabs, FormError, actionButtonClass, cx } from '../components/ui';
import type { ApiError } from '../api/errors';
import { BulkBar } from './BulkBar';
import { useFeatures } from '../entitlements/useFeatures';
import { useGroups } from './groups';
import { EmptyState } from './list/EmptyState';
import { GroupPills } from './list/GroupPills';
import { ListToolbar } from './list/ListToolbar';
import { GridSkeleton, ProductGrid } from './list/ProductGrid';
import { ProductTable, TableSkeleton, type Selection } from './list/ProductTable';
import { useViewMode } from './list/useViewMode';
import { PRODUCT_TYPES, type ProductType } from './presets';
import { ProductsHeader } from './ProductsNav';

export type Product = components['schemas']['ProductRead'];
type StockFilter = 'low' | 'out';

const PAGE_SIZE = 25;

/** The list's filters live in the URL, so a refresh or a shared link keeps the view. */
function useListParams() {
  const [params, setParams] = useSearchParams();
  const typeParam = params.get('type') ?? '';
  const type: ProductType | '' = (PRODUCT_TYPES as readonly string[]).includes(typeParam)
    ? (typeParam as ProductType)
    : '';
  const stock = params.get('stock');
  const filters = {
    q: (params.get('q') ?? '').trim(),
    status: params.get('status') === 'archived' ? ('archived' as const) : ('active' as const),
    type,
    categoryId: params.get('category') ?? '',
    collectionId: params.get('collection') ?? '',
    stock: stock === 'low' || stock === 'out' ? (stock as StockFilter) : null,
    sort: params.get('sort') === 'stock' ? ('stock' as const) : ('newest' as const),
  };
  /** Sets (or, for null and '', drops) several parameters in one URL change. */
  const set = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [filters, set] as const;
}

function typingInField(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function ProductsPage() {
  const { t } = useTranslation();
  const [filters, setParams] = useListParams();
  const { q: search, status, type, categoryId, collectionId, stock, sort } = filters;
  const [selected, setSelected] = useState<string[]>([]);
  const lastClicked = useRef<number | null>(null);
  const [rowError, setRowError] = useState<ApiError | null>(null);
  const [view, setView] = useViewMode();
  const categories = useGroups('categories');
  const collections = useGroups('collections');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { limitOf, currentOf, isLimitReached } = useFeatures();
  const productsLimit = limitOf('products_max');
  const productsLimitReached = isLimitReached('products_max');

  /** A filter change starts a new list, so it drops the selection too. */
  const changeFilters = useCallback(
    (changes: Record<string, string | null>) => {
      setSelected([]);
      lastClicked.current = null;
      setParams(changes);
    },
    [setParams],
  );
  const onSearch = useCallback((q: string) => changeFilters({ q }), [changeFilters]);

  const groupFilters = {
    status,
    product_type: type || undefined,
    category_id: categoryId || undefined,
    collection_id: collectionId || undefined,
  };
  const listFilters = { ...groupFilters, q: search || undefined, stock: stock ?? undefined, sort };
  // Cached per filter set: coming back to the list shows it at once while it refetches. Each
  // filter set is its own entry, so switching tabs quickly never shows another tab's page.
  const products = useInfiniteQuery({
    queryKey: ['products', 'list', listFilters],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await call(() =>
          api.GET('/v1/products', {
            params: {
              query: { ...listFilters, cursor: pageParam, limit: PAGE_SIZE, images: 'cover' },
            },
          }),
        ),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
    // Keep the old rows on screen (dimmed) while a new filter loads.
    placeholderData: keepPreviousData,
  });
  const items = useMemo(
    () => products.data?.pages.flatMap((page) => page.items) ?? [],
    [products.data],
  );
  const failed = products.isError;
  const settled = !products.isPending && !products.isPlaceholderData;

  const stockCounts = useQuery({
    queryKey: ['products', 'stock-counts', groupFilters],
    queryFn: async () =>
      unwrap(
        await call(() => api.GET('/v1/products/stock-counts', { params: { query: groupFilters } })),
      ),
  });
  const counts = stockCounts.data ?? null;

  // Load the next page as the end of the list scrolls into view. The button below stays as the
  // fallback where there is no IntersectionObserver.
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = products;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // `n` starts a new product, `a` selects every shown row, Escape drops the selection. `/`
  // (search) is the search box's own. A key a menu, popover or dialog already handled is skipped.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey || typingInField(event.target)) return;
      if (event.key === 'n') {
        if (productsLimitReached) return;
        event.preventDefault();
        void navigate('/products/new');
      } else if (event.key === 'a') {
        event.preventDefault();
        lastClicked.current = null;
        setSelected(items.map((product) => product.id));
      } else if (event.key === 'Escape') {
        setSelected([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, items, productsLimitReached]);

  const selection: Selection = {
    selected: new Set(selected),
    onSelect(index, on, range) {
      const from = range && lastClicked.current !== null ? lastClicked.current : index;
      const ids = items
        .slice(Math.min(from, index), Math.max(from, index) + 1)
        .map((product) => product.id);
      lastClicked.current = index;
      setSelected((current) =>
        on
          ? [...current, ...ids.filter((id) => !current.includes(id))]
          : current.filter((id) => !ids.includes(id)),
      );
    },
    onSelectAll(on) {
      lastClicked.current = null;
      setSelected(on ? items.map((product) => product.id) : []);
    },
  };

  async function duplicate(product: Product) {
    setRowError(null);
    const result = await call(() =>
      api.POST('/v1/products/{product_id}/duplicate', {
        params: { path: { product_id: product.id } },
      }),
    );
    if (result.ok) navigate(`/products/${result.data.id}`);
    else setRowError(result.error);
  }

  const filtered = !!(type || categoryId || collectionId);

  return (
    <section className="pb-24">
      <ProductsHeader
        actions={
          <>
            {/* A plain same-origin GET: the session cookie goes with it and the browser downloads. */}
            <a
              href="/v1/catalog/export.csv"
              download
              title={t('products.export')}
              className={actionButtonClass()}
            >
              <Download aria-hidden className="size-4" />
              <span className="max-sm:sr-only">{t('products.export')}</span>
            </a>
            {productsLimitReached ? (
              <span
                role="status"
                className="inline-flex h-9 items-center rounded-md bg-panel-muted px-3 text-xs font-medium text-ink-muted"
              >
                {t('products.limitReached', {
                  current: currentOf('products_max') ?? items.length,
                  limit: productsLimit,
                })}
              </span>
            ) : (
              <Link
                to="/products/new"
                title={t('products.newShortcut')}
                className={actionButtonClass({ tone: 'primary' })}
              >
                <Plus aria-hidden className="size-4" />
                {t('products.new')}
              </Link>
            )}
          </>
        }
      />

      <div className="mt-6 space-y-3">
        <ListToolbar
          filters={filters}
          onSearch={onSearch}
          onFilter={(key, value) => changeFilters({ [key]: value })}
          onClear={() => changeFilters({ type: null, sort: null })}
          view={view}
          onView={setView}
        />
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <FilterTabs
            label={t('products.filters')}
            value={status}
            onChange={(next) => changeFilters({ status: next === 'archived' ? next : null })}
            tabs={[
              { value: 'active', label: t('products.filterActive') },
              { value: 'archived', label: t('products.filterArchived') },
            ]}
          />
          <FilterTabs
            label={t('products.stockFilter')}
            value={stock ?? 'all'}
            onChange={(next) => changeFilters({ stock: next === 'all' ? null : next })}
            tabs={[
              { value: 'all', label: t('products.stockAll') },
              {
                value: 'low',
                label: t('products.stockLow'),
                // The counts ignore the search box, so they are hidden while searching.
                count: search ? null : counts?.low_stock,
                countLabel: t('products.lowCount', { count: counts?.low_stock ?? 0 }),
                countTone: counts?.low_stock ? 'warn' : 'plain',
              },
              {
                value: 'out',
                label: t('products.stockOut'),
                count: search ? null : counts?.out_of_stock,
                countLabel: t('products.outCount', { count: counts?.out_of_stock ?? 0 }),
                countTone: counts?.out_of_stock ? 'warn' : 'plain',
              },
            ]}
          />
        </div>
        <GroupPills
          categories={categories.items ?? []}
          collections={collections.items ?? []}
          categoryId={categoryId}
          collectionId={collectionId}
          onFilter={(key, value) => changeFilters({ [key]: value })}
        />
      </div>

      {failed && (
        <p role="alert" className="mt-6 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('products.loadFailed')}
        </p>
      )}
      <div className="mt-4 empty:hidden">
        <FormError error={rowError} />
      </div>

      <div className="mt-4">
        {products.isPending ? (
          <>
            <span className="sr-only">{t('products.loading')}</span>
            {view === 'grid' ? <GridSkeleton /> : <TableSkeleton />}
          </>
        ) : settled && !failed && items.length === 0 ? (
          search ? (
            <EmptyState icon={SearchX} title={t('products.emptySearch')}>
              <ActionButton onClick={() => onSearch('')}>{t('products.clearSearch')}</ActionButton>
            </EmptyState>
          ) : stock ? (
            <EmptyState icon={PackageCheck} tone="ok" title={t(`products.empty_${stock}`)} />
          ) : filtered ? (
            <EmptyState icon={Filter} title={t('products.emptyFiltered')}>
              <ActionButton
                onClick={() => changeFilters({ type: null, category: null, collection: null })}
              >
                {t('products.clearFilters')}
              </ActionButton>
            </EmptyState>
          ) : status === 'archived' ? (
            <EmptyState icon={Archive} title={t('products.emptyArchived')} />
          ) : (
            <EmptyState icon={Package} title={t('products.empty')} hint={t('products.emptyHint')}>
              {productsLimitReached ? (
                <p role="status" className="text-sm text-ink-muted">
                  {t('products.limitReached', {
                    current: currentOf('products_max') ?? items.length,
                    limit: productsLimit,
                  })}
                </p>
              ) : (
                <Link to="/products/new" className={actionButtonClass({ tone: 'primary' })}>
                  <Plus aria-hidden className="size-4" />
                  {t('products.addFirst')}
                </Link>
              )}
            </EmptyState>
          )
        ) : items.length > 0 ? (
          <div
            className={cx(
              'motion-safe:transition-opacity',
              products.isPlaceholderData && 'opacity-60',
            )}
          >
            {view === 'grid' ? (
              <ProductGrid items={items} selection={selection} onDuplicate={duplicate} />
            ) : (
              <ProductTable items={items} selection={selection} onDuplicate={duplicate} />
            )}
          </div>
        ) : null}
      </div>

      <div ref={sentinel} />
      {isFetchingNextPage && (
        <p className="mt-4 text-center text-sm text-ink-faint">{t('products.loading')}</p>
      )}
      {hasNextPage && !isFetchingNextPage && !products.isPlaceholderData && (
        <div className="mt-4 flex justify-center">
          <ActionButton onClick={() => void fetchNextPage()}>{t('products.loadMore')}</ActionButton>
        </div>
      )}
      {selected.length > 0 && (
        <BulkBar
          productIds={selected}
          shownCount={items.length}
          status={status}
          onSelectAll={() => selection.onSelectAll(true)}
          onClear={() => setSelected([])}
          onDone={() => {
            categories.reload();
            collections.reload();
            void queryClient.invalidateQueries({ queryKey: ['products'] });
          }}
        />
      )}
    </section>
  );
}
