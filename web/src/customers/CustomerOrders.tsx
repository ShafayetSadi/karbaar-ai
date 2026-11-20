import { ShoppingBag } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { call } from '../api/call';
import { Section, cx } from '../components/ui';
import { formatAgo, formatBDT } from '../i18n/format';
import type { Order, OrderStatus } from '../orders/orderForm';
import { DeliveryRecordChip, type DeliveryRecord } from './DeliveryRecordChip';
import { ReturnsWarning } from './ReturnsWarning';

const SHOWN = 5;

// The order status colours of `orders/StatusBadge.tsx`, on the design tokens.
const STATUS_TONE: Record<OrderStatus, string> = {
  pending: 'text-warn-ink',
  on_hold: 'text-warn-ink',
  confirmed: 'text-ok-ink',
  processing: 'text-ai-ink',
  ready_to_ship: 'text-ai-ink',
  shipped: 'text-ai-ink',
  delivered: 'text-ok-ink',
  cancelled: 'text-ink-faint',
  // A return is the history the merchant most needs to notice.
  returned: 'font-semibold text-danger-ink',
};

/** "Cotton Panjabi" or "Cotton Panjabi +2": what the order was, at a glance. */
function itemsSummary(order: Order): string {
  const [first, ...rest] = order.items;
  if (!first) return '';
  return rest.length > 0 ? `${first.product_name} +${rest.length}` : first.product_name;
}

/**
 * The customer's latest orders, so the merchant sees at a glance whether this is a repeat buyer,
 * what they bought before and how those parcels ended (ADR 0034). Refetches when `refresh` changes
 * (a new order was just created). `children` go under the list: the create-order actions and form.
 *
 * On an order's own page, `excludeOrderId` leaves that order out and `record` is the order's
 * `customer_record` (also without it); elsewhere the record is fetched for the customer.
 */
export function CustomerOrders({
  customerId,
  refresh = 0,
  excludeOrderId,
  record: given,
  storageKey = 'inbox.panel.orders',
  children,
}: {
  customerId: string;
  refresh?: number;
  excludeOrderId?: string;
  record?: DeliveryRecord | null;
  storageKey?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fetched, setFetched] = useState<DeliveryRecord | null>(null);
  const record = given === undefined ? fetched : given;

  useEffect(() => {
    let cancelled = false;
    const limit = SHOWN + (excludeOrderId ? 1 : 0);
    void call(() =>
      api.GET('/v1/orders', { params: { query: { customer_id: customerId, limit } } }),
    ).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        const others = result.data.items.filter((order) => order.id !== excludeOrderId);
        setOrders(others.slice(0, SHOWN));
        setMore(result.data.next_cursor !== null || others.length > SHOWN);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    if (given === undefined) {
      void call(() =>
        api.GET('/v1/customers/{customer_id}/delivery-record', {
          params: { path: { customer_id: customerId } },
        }),
      ).then((result) => {
        // The record only adds to the history: without it the list still shows.
        if (!cancelled && result.ok) setFetched(result.data.own);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [customerId, refresh, excludeOrderId, given]);

  return (
    <Section
      title={t('inbox.panel.orders')}
      icon={ShoppingBag}
      // Only the latest few are fetched: say "5+" rather than a count that is too low.
      count={orders && !more ? orders.length : null}
      summary={
        orders ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {orders.length === 0
              ? t('inbox.history.first')
              : t('inbox.history.returning') + (more ? ` · ${SHOWN}+` : '')}
            <DeliveryRecordChip record={record} />
          </span>
        ) : undefined
      }
      storageKey={storageKey}
    >
      {failed && (
        <p role="alert" className="text-danger-ink">
          {t('inbox.history.failed')}
        </p>
      )}
      {!failed && orders?.length === 0 && (
        <p className="text-ink-faint">{t('inbox.history.none')}</p>
      )}
      {orders && orders.length > 0 && (
        <ul className="space-y-1.5">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                to={`/orders/${order.id}`}
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-panel px-3 py-2 hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-active"
              >
                <span className="min-w-0">
                  <span className="block truncate">
                    <span className="font-semibold text-ink">#{order.number}</span>
                    <span className="text-ink-faint"> · </span>
                    <span className={cx('text-xs', STATUS_TONE[order.status])}>
                      {t(`orders.status.${order.status}`)}
                      {order.is_partial_delivery && ` (${t('orders.outcome.partialChip')})`}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-ink-faint">
                    {itemsSummary(order)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-ink-muted">
                  <span>{formatBDT(order.total_minor)}</span>
                  <span className="text-ink-faint">
                    {' · '}
                    {formatAgo(order.created_at)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {children && (
        <div className="mt-3 space-y-3">
          {/* Before taking an order from this customer: they sent parcels back before. */}
          <ReturnsWarning compact customerId={customerId} record={record} />
          {children}
        </div>
      )}
    </Section>
  );
}
