import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { call } from '../api/call';
import { unwrap } from '../api/query';
import { useAuth } from '../auth/AuthProvider';
import { ActionButton, Skeleton, actionButtonClass } from '../components/ui';
import { dhakaDay, formatAge, formatInteger } from '../i18n/format';
import { RecentOrders, TodayBlock } from './HomeBlocks';
import { AiSummary } from './AiSummary';
import { useAttentionSource } from './useAttentionSource';

type Row = { label: string; count: number; to: string; since?: string | null };

const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * HOUR_MS;

/**
 * How long the oldest in a row has waited, from an hour on; Needs you always, as every minute
 * counts there. Null when there is nothing to say.
 */
function oldest(row: Row, now = Date.now()) {
  if (!row.since) return null;
  const waited = now - new Date(row.since).getTime();
  if (waited < HOUR_MS && row.label !== 'needsYou') return null;
  return {
    key: waited >= WEEK_MS ? 'home.oldestSince' : 'home.oldest',
    age: formatAge(row.since, now),
  };
}

export function HomePage() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const conversations = useAttentionSource('conversations', async () => {
    const counts = unwrap(await call(() => api.GET('/v1/conversations/counts')));
    return [
      {
        label: 'needsYou',
        count: counts.needs_human,
        to: '/inbox?needs_you=1',
        since: counts.oldest_needs_human_at,
      },
      {
        label: 'draftReady',
        count: counts.draft_ready,
        to: '/inbox?draft_ready=1',
        since: counts.oldest_draft_ready_at,
      },
      {
        label: 'waiting',
        count: counts.needs_reply,
        to: '/inbox?waiting=1',
        since: counts.oldest_needs_reply_at,
      },
    ];
  });
  const orders = useAttentionSource('orders', async () => {
    const counts = unwrap(
      await call(() =>
        api.GET('/v1/orders/counts', {
          params: { query: { ready_by_before: dhakaDay(Date.now() + 8 * 24 * 60 * 60 * 1000) } },
        }),
      ),
    );
    return [
      { label: 'readySoon', count: counts.ready_soon, to: '/orders?tab=readySoon' },
      { label: 'toChase', count: counts.to_chase, to: '/orders?tab=toChase' },
      { label: 'toCall', count: counts.to_call, to: '/orders?tab=toCall' },
    ];
  });
  const confirmation = useAttentionSource('confirmation', async () => {
    const settings = unwrap(await call(() => api.GET('/v1/merchant/order-confirmation-settings')));
    return settings.order_confirmation_enabled;
  });
  const stock = useAttentionSource('stock', async () => {
    const counts = unwrap(await call(() => api.GET('/v1/products/stock-counts')));
    return [
      { label: 'outOfStock', count: counts.out_of_stock, to: '/products?stock=out' },
      { label: 'lowStock', count: counts.low_stock, to: '/products?stock=low' },
    ];
  });
  const sources = [
    { key: 'conversations', query: conversations },
    { key: 'orders', query: orders },
    { key: 'stock', query: stock },
  ];
  const visibleRows = (rows: Row[] = []) =>
    rows.filter((row) => row.count > 0 && (row.label !== 'toCall' || confirmation.data === true));
  const allHandled =
    sources.every(
      ({ query }) => query.isSuccess && !query.isError && visibleRows(query.data).length === 0,
    ) && confirmation.isSuccess;
  const owner = state.status === 'authenticated' && state.me.role === 'owner';
  return (
    <div className="min-w-0 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">{t('nav.home')}</h1>
        <p className="mt-1 break-words text-sm text-ink-muted">
          {t('home.greeting', {
            name:
              state.status === 'authenticated' ? state.me.user.name || state.me.merchant.name : '',
          })}
        </p>
        {owner && (
          <AiSummary
            waiting={conversations.data?.find((row) => row.label === 'waiting')?.count ?? null}
          />
        )}
      </header>
      <section
        aria-labelledby="home-attention"
        className="overflow-hidden rounded-lg border border-line bg-panel"
      >
        <h2 id="home-attention" className="px-4 py-3 text-base font-semibold">
          {t('home.attention')}
        </h2>
        {sources.map(({ key, query: source }) => (
          <div key={key}>
            {source.isPending && (
              <div role="status" aria-label={t('home.loading')} className="p-4">
                <Skeleton className="h-6 w-full" />
              </div>
            )}
            {visibleRows(source.data).map((row) => {
              const waited = oldest(row);
              const age = waited && t(waited.key, { age: waited.age });
              return (
                <Link
                  key={row.label}
                  to={row.to}
                  aria-label={[t(`home.rows.${row.label}`), formatInteger(row.count), age]
                    .filter(Boolean)
                    .join(' ')}
                  className="flex min-h-12 items-center justify-between gap-4 border-t border-line px-4 py-3 text-sm hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-active"
                >
                  <span>{t(`home.rows.${row.label}`)}</span>
                  <span className="flex shrink-0 items-baseline gap-3">
                    {age && <span className="text-xs text-ink-muted tabular-nums">{age}</span>}
                    <span className="font-medium tabular-nums">{formatInteger(row.count)}</span>
                  </span>
                </Link>
              );
            })}
            {source.isError && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-2 border-t border-line p-4 text-sm text-ink-muted"
              >
                <span>{t(`home.errors.${key}`)}</span>
                <ActionButton className="min-h-11" onClick={() => void source.refetch()}>
                  {t('home.retry')}
                </ActionButton>
              </div>
            )}
          </div>
        ))}
        {confirmation.isError && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 border-t border-line p-4 text-sm text-ink-muted"
          >
            <span>{t('home.errors.settings')}</span>
            <ActionButton className="min-h-11" onClick={() => void confirmation.refetch()}>
              {t('home.retry')}
            </ActionButton>
          </div>
        )}
        {allHandled && (
          <p className="border-t border-line p-4 text-sm text-ink-muted">{t('home.allHandled')}</p>
        )}
      </section>
      <div className={owner ? 'grid min-w-0 gap-6 lg:grid-cols-2' : 'min-w-0'}>
        {owner && <TodayBlock />}
        <RecentOrders />
      </div>
      {owner && (
        <section aria-labelledby="home-actions">
          <h2 id="home-actions" className="mb-3 text-base font-semibold">
            {t('home.quickActions')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['createOrder', '/orders/new'],
                ['addProduct', '/products/new'],
                ['openInbox', '/inbox'],
              ] as const
            ).map(([key, to], index) => (
              <Link
                key={key}
                to={to}
                className={`${actionButtonClass({ tone: index === 0 ? 'primary' : 'neutral' })} min-h-11`}
              >
                {t(`home.${key}`)}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
