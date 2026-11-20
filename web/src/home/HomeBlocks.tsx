import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { call } from '../api/call';
import { unwrap } from '../api/query';
import { ActionButton, Skeleton, actionButtonClass } from '../components/ui';
import { formatBDT, formatInteger, formatPercent, dhakaDay, dhakaTime } from '../i18n/format';
import { StatusBadge } from '../orders/StatusBadge';
import { useAttentionSource } from './useAttentionSource';

const DAY_MS = 24 * 60 * 60 * 1000;

type DayFigures = { orders: number; value: number; chats: number; aiShare: number | null };

function Block({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="min-w-0 overflow-hidden rounded-lg border border-line bg-panel"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function BlockError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 border-t border-line p-4 text-sm text-ink-muted"
    >
      <span>{message}</span>
      <ActionButton className="min-h-11" onClick={onRetry}>
        {t('home.retry')}
      </ActionButton>
    </div>
  );
}

/**
 * Orders, order value, chats and AI-only share for the Dhaka day. Counts sit beside yesterday by
 * the same time, which is a fair comparison early in the day, and yesterday's whole day; the
 * share sits beside yesterday's. Owners only.
 */
export function TodayBlock() {
  const { t } = useTranslation();
  const query = useAttentionSource('today', async () => {
    const now = Date.now();
    const today = dhakaDay(now);
    const yesterday = dhakaDay(now - DAY_MS);
    const overview = async (query: { from: string; to: string; until?: string }) =>
      unwrap(await call(() => api.GET('/v1/analytics/overview', { params: { query } })));
    const [data, sameTime] = await Promise.all([
      overview({ from: yesterday, to: today }),
      overview({ from: yesterday, to: yesterday, until: dhakaTime(now) }),
    ]);
    const figures = (date: string, days = data.days): DayFigures => {
      const day = days.find((d) => d.date === date);
      return {
        orders: day?.orders ?? 0,
        value: day?.order_value_minor ?? 0,
        chats: day?.chats ?? 0,
        // The same base as Analytics: chats that got any reply.
        aiShare: day && day.replied_chats > 0 ? day.chats_ai_only / day.replied_chats : null,
      };
    };
    return {
      today: figures(today),
      yesterday: figures(yesterday),
      yesterdayByNow: figures(yesterday, sameTime.days),
    };
  });
  const tiles = (
    [
      ['orders', (f) => formatInteger(f.orders), true],
      ['orderValue', (f) => formatBDT(f.value), true],
      ['chats', (f) => formatInteger(f.chats), true],
      ['aiOnlyShare', (f) => (f.aiShare === null ? '–' : formatPercent(f.aiShare)), false],
    ] as [string, (f: DayFigures) => string, boolean][]
  ).map(([key, format, byNow]) => ({ key, format, byNow }));
  return (
    <Block
      id="home-today"
      title={t('home.today.title')}
    >
      {query.isPending && (
        <div role="status" aria-label={t('home.loading')} className="p-4">
          <Skeleton className="h-16 w-full" />
        </div>
      )}
      {query.isError && (
        <BlockError message={t('home.errors.today')} onRetry={() => void query.refetch()} />
      )}
      {query.data && (
        <dl className="grid grid-cols-2 gap-px border-t border-line bg-line">
          {tiles.map(({ key, format, byNow }) => (
            <div key={key} className="min-w-0 bg-panel p-4">
              <dt className="text-sm text-ink-muted">{t(`home.today.${key}`)}</dt>
              <dd className="mt-1 break-words text-xl font-semibold tabular-nums">
                {format(query.data.today)}
              </dd>
              <dd className="mt-1 text-xs text-ink-muted tabular-nums">
                {byNow
                  ? t('home.today.yesterdayByNow', {
                      value: format(query.data.yesterdayByNow),
                      total: format(query.data.yesterday),
                    })
                  : t('home.today.yesterday', { value: format(query.data.yesterday) })}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Block>
  );
}

const SOURCES = ['messenger', 'dashboard'];

/** The last five orders from every source, for owners and teammates. */
export function RecentOrders() {
  const { t } = useTranslation();
  const query = useAttentionSource('recent-orders', async () =>
    unwrap(
      await call(() => api.GET('/v1/orders', { params: { query: { sort: 'newest', limit: 5 } } })),
    ).items.slice(0, 5),
  );
  return (
    <Block
      id="home-recent-orders"
      title={t('home.recent.title')}
      action={
        <Link to="/orders" className="text-sm font-medium text-active hover:underline">
          {t('home.recent.viewAll')}
        </Link>
      }
    >
      {query.isPending && (
        <div role="status" aria-label={t('home.loading')} className="p-4">
          <Skeleton className="h-16 w-full" />
        </div>
      )}
      {query.isError && (
        <BlockError message={t('home.errors.recent')} onRetry={() => void query.refetch()} />
      )}
      {query.data && query.data.length === 0 && (
        <div className="space-y-3 border-t border-line p-4 text-sm text-ink-muted">
          <p>{t('home.recent.empty')}</p>
          <Link to="/orders/new" className={`${actionButtonClass({ tone: 'primary' })} min-h-11`}>
            {t('home.createOrder')}
          </Link>
        </div>
      )}
      {query.data?.map((order) => (
        <Link
          key={order.id}
          to={`/orders/${order.id}`}
          className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-sm hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-active"
        >
          <span className="min-w-0">
            <span className="font-medium tabular-nums">#{formatInteger(order.number)}</span>{' '}
            <span className="break-words">{order.customer.name ?? t('orders.none')}</span>
            <span className="block text-xs text-ink-muted">
              {SOURCES.includes(order.source)
                ? t(`orders.sourceFilter.${order.source}`)
                : order.source}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="font-medium tabular-nums">{formatBDT(order.total_minor)}</span>
            <StatusBadge status={order.status} />
          </span>
        </Link>
      ))}
    </Block>
  );
}
