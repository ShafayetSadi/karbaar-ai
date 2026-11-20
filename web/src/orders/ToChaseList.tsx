import { MessageSquare, Phone, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { call } from '../api/call';
import type { components } from '../api/schema';
import { ActionButton, Chip } from '../components/ui';
import { formatAgo, formatBDT } from '../i18n/format';

type ChaseItem = components['schemas']['ChaseItemRead'];
type DismissReason = 'not_interested' | 'ordered_elsewhere' | 'wrong_list' | 'other';

interface ToChaseListProps {
  onCountsChanged?: () => void;
}

export function ToChaseList({ onCountsChanged }: ToChaseListProps) {
  const { t } = useTranslation();
  const generation = useRef(0);
  const [items, setItems] = useState<ChaseItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');

  // Dismiss modal state
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState<DismissReason>('not_interested');
  const [busyDismiss, setBusyDismiss] = useState(false);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    let cancelled = false;
    void call(() =>
      api.GET('/v1/analytics/to-chase', {
        params: { query: { mine: filter === 'mine' } },
      }),
    ).then((res) => {
      if (cancelled || generation.current !== currentGeneration) return;
      if (res.ok) {
        setItems(res.data.items);
        setNextCursor(res.data.next_cursor ?? null);
      } else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [filter, revision]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const currentGeneration = generation.current;
    setLoadingMore(true);
    const res = await call(() =>
      api.GET('/v1/analytics/to-chase', {
        params: { query: { cursor: nextCursor, mine: filter === 'mine' } },
      }),
    );
    if (generation.current !== currentGeneration) return;
    setLoadingMore(false);
    if (res.ok) {
      setItems((current) => [
        ...new Map(
          [...(current ?? []), ...res.data.items].map((item) => [item.conversation_id, item]),
        ).values(),
      ]);
      setNextCursor(res.data.next_cursor ?? null);
    } else setFailed(true);
  };

  const resetList = () => {
    generation.current++;
    setItems(null);
    setFailed(false);
    setNextCursor(null);
    setLoadingMore(false);
  };

  const handleDismiss = async () => {
    if (!dismissingId) return;
    setBusyDismiss(true);

    const res = await call(() =>
      api.POST('/v1/conversations/{conversation_id}/chase-dismissal', {
        params: { path: { conversation_id: dismissingId } },
        body: { reason: dismissReason },
      }),
    );

    setBusyDismiss(false);
    if (res.ok) {
      setDismissingId(null);
      resetList();
      setRevision((value) => value + 1);
      onCountsChanged?.();
    }
  };

  const filteredItems = items ?? [];

  if (!failed && items === null) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-ink-muted">
        {t('analytics.loading')}
      </div>
    );
  }

  if (failed) {
    return (
      <div role="alert" className="rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
        {t('orders.chase.loadFailed')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Filter and Description */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">{t('orders.chase.title')}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">{t('orders.chase.subtitle')}</p>
        </div>

        {/* Filter: All / Mine */}
        <div className="inline-flex rounded-lg border border-line bg-panel p-1 text-xs font-medium shadow-2xs">
          <button
            type="button"
            onClick={() => {
              if (filter !== 'all') {
                resetList();
                setFilter('all');
              }
            }}
            className={`rounded-md px-3 py-1 cursor-pointer transition-colors ${
              filter === 'all'
                ? 'bg-accent/20 text-ink font-medium'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t('orders.chase.filterAll')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (filter !== 'mine') {
                resetList();
                setFilter('mine');
              }
            }}
            className={`rounded-md px-3 py-1 cursor-pointer transition-colors ${
              filter === 'mine'
                ? 'bg-accent/20 text-ink font-medium'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t('orders.chase.filterMine')}
          </button>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-panel p-12 text-center">
          <p className="text-sm font-medium text-ink">{t('orders.chase.emptyTitle')}</p>
          <p className="mt-1 text-xs text-ink-muted">{t('orders.chase.emptySubtitle')}</p>
        </div>
      ) : (
        <div className="divide-y divide-line rounded-lg border border-line bg-panel overflow-hidden">
          {filteredItems.map((item) => (
            <div
              key={item.conversation_id}
              className="flex flex-col gap-4 p-4 hover:bg-panel-muted/40 transition-colors sm:flex-row sm:items-center sm:justify-between"
            >
              {/* Left Column: Customer & Signal */}
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">
                    {item.customer_name || t('orders.chase.unnamedCustomer')}
                  </span>
                  {item.customer_phone && (
                    <span className="font-mono text-xs text-ink-muted">{item.customer_phone}</span>
                  )}
                  {item.window_open ? (
                    <Chip tone="neutral">{t('orders.chase.windowOpen')}</Chip>
                  ) : (
                    <Chip tone="warn">{t('orders.chase.windowClosed')}</Chip>
                  )}
                  {item.follow_up_sent && <Chip tone="team">{t('orders.chase.nudgeSent')}</Chip>}
                  {item.assignee_name && (
                    <span className="text-xs text-ink-faint">
                      · {t('orders.chase.assignedTo', { name: item.assignee_name })}
                    </span>
                  )}
                </div>

                {/* Products wanted */}
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                  <span className="font-medium text-ink">
                    {item.signal_type === 'tap'
                      ? t('orders.chase.signalTap')
                      : t('orders.chase.signalOffer')}
                    :
                  </span>
                  {item.products.map((p, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1">
                      <span className="text-ink font-medium">{p.name}</span>
                      {p.price_now_minor !== null && p.price_now_minor !== undefined && (
                        <span className="text-xs text-ink-faint">
                          ({t('orders.chase.priceNow')}: {formatBDT(p.price_now_minor)})
                        </span>
                      )}
                      {idx < item.products.length - 1 && <span>,</span>}
                    </span>
                  ))}
                  <span className="text-xs text-ink-faint">· {formatAgo(item.signal_at)}</span>
                </div>
              </div>

              {/* Right Column: Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to={`/inbox?c=${item.conversation_id}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-xs font-medium text-ink hover:bg-panel-muted transition-colors"
                >
                  <MessageSquare aria-hidden className="size-3.5" />
                  {t('orders.chase.openChat')}
                </Link>

                {item.customer_phone && (
                  <a
                    href={`tel:${item.customer_phone}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-xs font-medium text-ink hover:bg-panel-muted transition-colors"
                  >
                    <Phone aria-hidden className="size-3.5" />
                    {t('orders.chase.call')}
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => setDismissingId(item.conversation_id)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-muted hover:text-ink hover:bg-panel-muted transition-colors cursor-pointer"
                >
                  <XCircle aria-hidden className="size-3.5 text-ink-faint" />
                  {t('orders.chase.dismiss')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {nextCursor && (
        <ActionButton onClick={() => void loadMore()} disabled={loadingMore}>
          {t('orders.chase.loadMore')}
        </ActionButton>
      )}

      {/* Dismiss Modal */}
      {dismissingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('orders.chase.dismissModalTitle')}
            className="w-full max-w-sm rounded-xl border border-line bg-panel p-4 sm:p-6 shadow-xl space-y-4"
          >
            <h3 className="text-base font-semibold text-ink">
              {t('orders.chase.dismissModalTitle')}
            </h3>
            <p className="text-xs text-ink-muted">{t('orders.chase.dismissModalHint')}</p>

            <div className="space-y-2">
              {(['not_interested', 'ordered_elsewhere', 'wrong_list', 'other'] as const).map(
                (reason) => (
                  <label
                    key={reason}
                    className="flex items-center gap-2.5 rounded-md p-2 text-sm text-ink hover:bg-panel-muted cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="dismissReason"
                      value={reason}
                      checked={dismissReason === reason}
                      onChange={() => setDismissReason(reason)}
                      className="accent-accent"
                    />
                    <span>{t(`orders.chase.reasons.${reason}`)}</span>
                  </label>
                ),
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setDismissingId(null)}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
              <ActionButton onClick={handleDismiss} disabled={busyDismiss}>
                {t('orders.chase.confirmDismiss')}
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
