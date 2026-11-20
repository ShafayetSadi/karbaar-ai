import { StatusLinkControls } from './StatusLinkControls';
import { useOptionalAuth } from '../auth/AuthProvider';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import { ActionButton, Chip, cx, fieldClass } from '../components/ui';
import { DeliveryRecordChip } from '../customers/DeliveryRecordChip';
import { OrderCustomerContext } from '../customers/OrderCustomerContext';
import { ReturnsWarning } from '../customers/ReturnsWarning';
import { formatBDT, formatDateTime, parseTaka } from '../i18n/format';
import { leadTimeRange } from '../products/availability';
import { ConfirmationBadge, ConfirmationTimeline } from './Confirmation';
import { ADVANCE_METHODS, advanceMissing, canRecordAdvance, type AdvanceMethod } from './advance';
import { OutcomeActions } from './OutcomeActions';
import { ReadyBadge } from './ReadyBadge';
import { StatusBadge } from './StatusBadge';
import { useMembers } from '../team/useMembers';
import type { Order } from './orderForm';
import { can } from './orderActions';

export function OrderDetailPage() {
  const auth = useOptionalAuth();
  const { t } = useTranslation();
  const { orderId = '' } = useParams();
  const { members } = useMembers();
  const [order, setOrder] = useState<Order | null>(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [recording, setRecording] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<AdvanceMethod>('bkash');
  const [reference, setReference] = useState('');
  const [amountProblem, setAmountProblem] = useState(false);
  // Bumped when the customer's advance changes here, so its section shows the new value.
  const [customerVersion, setCustomerVersion] = useState(0);
  // One key per distinct record, kept across retries so a timeout never records twice.
  const advanceKey = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void call(() =>
      api.GET('/v1/orders/{order_id}', { params: { path: { order_id: orderId } } }),
    ).then((result) => {
      if (cancelled) return;
      if (result.ok) setOrder(result.data);
      else if (result.error.code === 'NOT_FOUND') setMissing(true);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const reload = useCallback(async () => {
    const result = await call(() =>
      api.GET('/v1/orders/{order_id}', { params: { path: { order_id: orderId } } }),
    );
    if (result.ok) setOrder(result.data);
  }, [orderId]);

  useEffect(() => {
    if (
      !order?.shipping_notifications?.some(
        (item) => item.decision === 'queued' && item.delivery === null,
      )
    )
      return;
    const timer = window.setInterval(() => void reload(), 4_000);
    return () => window.clearInterval(timer);
  }, [order, reload]);

  async function act(run: () => ReturnType<typeof confirmCall>) {
    setBusy(true);
    setError(null);
    const result = await run();
    setBusy(false);
    if (result.ok) {
      setOrder(result.data);
      setCancelling(false);
      setReason('');
    } else {
      setError(result.error);
      // The order may have been changed elsewhere (another tab, another person): show it as it is.
      if (result.error.code === 'INVALID_ORDER_TRANSITION') void reload();
    }
  }

  function startRecording() {
    if (!order) return;
    const { advance } = order;
    // Pre-fill with what was already recorded, else what the order asked for.
    const suggested = advance.received_minor || advance.required_minor;
    setAmount(suggested > 0 ? String(suggested / 100) : '');
    setMethod((advance.method as AdvanceMethod | null) ?? 'bkash');
    setReference(advance.reference ?? '');
    setAmountProblem(false);
    setRecording(true);
  }

  function record(event: FormEvent) {
    event.preventDefault();
    if (!order) return;
    const minor = parseTaka(amount);
    if (minor === null || minor <= 0 || minor > order.total_minor) {
      setAmountProblem(true);
      return;
    }
    setAmountProblem(false);
    const text = reference.trim();
    if (!text) return;
    const fingerprint = `${minor}|${method}|${text}`;
    if (advanceKey.current?.fingerprint !== fingerprint) {
      advanceKey.current = { fingerprint, key: crypto.randomUUID() };
    }
    const key = advanceKey.current.key;
    void act(async () => {
      const result = await call(() =>
        api.POST('/v1/orders/{order_id}/advance', {
          params: { path: { order_id: orderId }, header: { 'Idempotency-Key': key } },
          body: { amount_minor: minor, method, reference: text },
        }),
      );
      if (result.ok || result.error.code !== 'NETWORK_ERROR') advanceKey.current = null;
      if (result.ok) setRecording(false);
      return result;
    });
  }

  function confirmCall() {
    return call(() =>
      api.POST('/v1/orders/{order_id}/confirm', { params: { path: { order_id: orderId } } }),
    );
  }

  function cancel(event: FormEvent) {
    event.preventDefault();
    const text = reason.trim();
    if (!text) return;
    void act(() =>
      call(() =>
        api.POST('/v1/orders/{order_id}/cancel', {
          params: { path: { order_id: orderId } },
          body: { reason: text },
        }),
      ),
    );
  }

  if (missing) {
    return (
      <section>
        <p role="alert" className="rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('orders.errors.NOT_FOUND')}
        </p>
        <Link
          to="/orders"
          className="mt-4 inline-block text-sm font-medium text-active hover:underline"
        >
          {t('orders.back')}
        </Link>
      </section>
    );
  }
  if (failed) {
    return (
      <p role="alert" className="rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
        {t('orders.loadFailed')}
      </p>
    );
  }
  if (!order) return <p className="text-sm text-ink-faint">{t('orders.loading')}</p>;

  const { customer } = order;
  return (
    <section className="max-w-3xl space-y-6">
      <div>
        <Link
          to="/orders"
          className="inline-flex items-center gap-1 text-sm font-medium text-active hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t('orders.back')}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-ink">
            {t('orders.number', { number: order.number })}
          </h1>
          <StatusBadge status={order.status} />
          <ConfirmationBadge confirmation={order.confirmation} />
          {order.is_partial_delivery && <Chip tone="warn">{t('orders.outcome.partialChip')}</Chip>}
          <ReadyBadge order={order} />
          {order.credit && (
            <Chip tone="team">
              {order.credit === 'agent' && t('orders.credit.agent')}
              {order.credit === 'product_page' && t('orders.credit.product_page')}
              {order.credit === 'team' &&
                (order.created_by_user_id
                  ? t('orders.credit.team', {
                      name:
                        members.find((m) => m.user_id === order.created_by_user_id)?.name ??
                        t('orders.credit.formerTeammate'),
                    })
                  : t('orders.credit.teamDefault'))}
            </Chip>
          )}
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {t(`orders.from.${order.source}`, { defaultValue: order.source })} ·{' '}
          {t('orders.placedAt', { when: formatDateTime(order.created_at) })}
          {order.confirmed_at &&
            ` · ${t('orders.confirmedAt', { when: formatDateTime(order.confirmed_at) })}`}
          {order.cancelled_at &&
            ` · ${t('orders.cancelledAt', { when: formatDateTime(order.cancelled_at) })}`}
          {order.shipped_at &&
            order.shipped_source === 'merchant' &&
            ` · ${t('orders.shippedAt', { when: formatDateTime(order.shipped_at) })}`}
          {order.delivered_at &&
            order.outcome_source === 'merchant' &&
            ` · ${t('orders.deliveredAt', { when: formatDateTime(order.delivered_at) })}`}
          {order.returned_at &&
            order.outcome_source === 'merchant' &&
            ` · ${t('orders.returnedAt', { when: formatDateTime(order.returned_at) })}`}
          {order.return_received_at &&
            ` · ${t('orders.receivedBackAt', { when: formatDateTime(order.return_received_at) })}`}
        </p>
        {order.collected_amount_minor !== null && (
          <p className="mt-1 text-sm text-ink">
            {t('orders.collected', { amount: formatBDT(order.collected_amount_minor) })}
          </p>
        )}
        {order.cancel_reason && (
          <p className="mt-1 text-sm text-ink">
            {t('orders.cancelReason', { reason: order.cancel_reason })}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {error.code === 'NOT_FOUND' ? t('orders.errors.NOT_FOUND') : error.message}
        </p>
      )}

      <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-ink">{t('orders.items')}</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="font-medium text-xs text-ink-faint">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">
                {t('orders.item')}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                {t('orders.qty')}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                {t('orders.unitPrice')}
              </th>
              <th scope="col" className="py-2 pl-2 text-right font-medium">
                {t('orders.lineTotal')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-t border-line">
            {order.items.map((item) => (
              <tr key={item.variant_id}>
                <td className="py-2 pr-4 text-ink">
                  {item.product_name}
                  {item.variant_label && (
                    <span className="block text-xs text-ink-faint">{item.variant_label}</span>
                  )}
                  {item.availability !== 'in_stock' && (
                    <span className="block text-xs text-warn-ink">
                      {t(`orders.availability.${item.availability}`)}
                      {item.lead_time_days_min !== null &&
                        item.lead_time_days_max !== null &&
                        ` · ${t('orders.leadDays', {
                          days: leadTimeRange(item.lead_time_days_min, item.lead_time_days_max),
                        })}`}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right font-mono text-ink tabular-nums">
                  {item.quantity}
                </td>
                <td className="px-2 py-2 text-right font-mono text-ink tabular-nums">
                  {item.list_price_minor !== null &&
                    item.list_price_minor > item.unit_price_minor && (
                      <s className="block text-xs text-ink-faint">
                        {formatBDT(item.list_price_minor)}
                      </s>
                    )}
                  {formatBDT(item.unit_price_minor)}
                  {item.tier_min_quantity !== null && (
                    <span className="block text-xs text-ok-ink">
                      {t('orders.tierPrice', { quantity: item.tier_min_quantity })}
                    </span>
                  )}
                </td>
                <td className="py-2 pl-2 text-right font-mono text-ink tabular-nums">
                  {formatBDT(item.line_total_minor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-t border-line pt-3 text-sm">
          <dt className="text-ink-muted">{t('orders.subtotal')}</dt>
          <dd className="text-right font-mono text-ink tabular-nums">
            {formatBDT(order.subtotal_minor)}
          </dd>
          {order.savings_minor > 0 && (
            <>
              <dt className="text-ink-muted">{t('orders.savings')}</dt>
              <dd className="text-right font-mono text-ok-ink tabular-nums">
                {formatBDT(order.savings_minor)}
              </dd>
            </>
          )}
          <dt className="text-ink-muted">
            {t('orders.deliveryFee', { name: order.delivery.name })}
          </dt>
          <dd className="text-right font-mono text-ink tabular-nums">
            {formatBDT(order.delivery.fee_minor)}
          </dd>
          <dt className="font-semibold text-ink">{t('orders.total')}</dt>
          <dd className="text-right font-mono font-semibold text-ink tabular-nums">
            {formatBDT(order.total_minor)}
          </dd>
        </dl>
        <p className="mt-3 text-base font-semibold text-ink">
          {t('orders.cod', { amount: formatBDT(order.cod_amount_minor) })}
        </p>
      </div>

      {(order.advance.required_minor > 0 ||
        order.advance.received_minor > 0 ||
        canRecordAdvance(order)) && (
        <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-ink">{t('orders.advance.title')}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {t('orders.advance.summary', {
              required: formatBDT(order.advance.required_minor),
              received: formatBDT(order.advance.received_minor),
            })}
          </p>
          {order.advance.method && order.advance.received_at && (
            <p className="mt-1 text-sm text-ink-muted">
              {t('orders.advance.recorded', {
                method: t(`orders.advance.method.${order.advance.method}`),
                reference: order.advance.reference,
                when: formatDateTime(order.advance.received_at),
              })}
            </p>
          )}
          {recording ? (
            <form onSubmit={record} className="mt-4 space-y-3 text-sm">
              <p className="text-ink-muted">{t('orders.advance.bookkeeping')}</p>
              <label className="block font-medium text-ink-muted">
                {t('orders.advance.amount')}
                <input
                  value={amount}
                  inputMode="decimal"
                  onChange={(e) => setAmount(e.target.value)}
                  className={cx('mt-1 block w-full max-w-xs', fieldClass)}
                />
                {amountProblem && (
                  <span role="alert" className="mt-1 block font-normal text-danger-ink">
                    {t('orders.advance.amountProblem', { max: formatBDT(order.total_minor) })}
                  </span>
                )}
              </label>
              <label className="block font-medium text-ink-muted">
                {t('orders.advance.methodLabel')}
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as AdvanceMethod)}
                  className={cx('mt-1 block w-full max-w-xs', fieldClass)}
                >
                  {ADVANCE_METHODS.map((value) => (
                    <option key={value} value={value}>
                      {t(`orders.advance.method.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block font-medium text-ink-muted">
                {t('orders.advance.reference')}
                <input
                  value={reference}
                  maxLength={64}
                  onChange={(e) => setReference(e.target.value)}
                  className={cx('mt-1 block w-full max-w-xs', fieldClass)}
                />
              </label>
              <div className="flex gap-2">
                <ActionButton
                  type="submit"
                  tone="primary"
                  disabled={busy || reference.trim() === ''}
                >
                  {t('orders.advance.save')}
                </ActionButton>
                <ActionButton onClick={() => setRecording(false)}>{t('orders.keep')}</ActionButton>
              </div>
            </form>
          ) : (
            canRecordAdvance(order) && (
              <ActionButton className="mt-4" onClick={startRecording}>
                {order.advance.received_minor > 0
                  ? t('orders.advance.correct')
                  : t('orders.advance.record')}
              </ActionButton>
            )
          )}
        </div>
      )}

      <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-ink">{t('orders.customer')}</h2>
          <DeliveryRecordChip record={order.customer_record} />
        </div>
        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-ink-faint">{t('orders.name')}</dt>
          <dd className="text-ink">{customer.name ?? t('orders.none')}</dd>
          <dt className="text-ink-faint">{t('orders.phone')}</dt>
          <dd className="font-mono text-ink">{customer.phone ?? t('orders.none')}</dd>
          <dt className="text-ink-faint">{t('orders.address')}</dt>
          <dd className="break-words text-ink">{customer.address.raw_text ?? t('orders.none')}</dd>
          {customer.address.district && (
            <>
              <dt className="text-ink-faint">{t('orders.areaAndDistrict')}</dt>
              <dd className="text-ink">
                {[customer.address.area, customer.address.district].filter(Boolean).join(', ')}
              </dd>
            </>
          )}
          {customer.address.line && customer.address.line !== customer.address.raw_text && (
            <>
              <dt className="text-ink-faint">{t('orders.addressLine')}</dt>
              <dd className="break-words text-ink">{customer.address.line}</dd>
            </>
          )}
          {order.notes && (
            <>
              <dt className="text-ink-faint">{t('orders.notes')}</dt>
              <dd className="break-words text-ink">{order.notes}</dd>
            </>
          )}
          {order.customer_note && (
            <>
              <dt className="text-ink-faint">{t('orders.customerNote')}</dt>
              <dd className="break-words text-ink">{order.customer_note}</dd>
            </>
          )}
        </dl>
      </div>

      <StatusLinkControls
        key={order.id}
        orderId={order.id}
        owner={auth?.state.status === 'authenticated' && auth.state.me.role === 'owner'}
      />

      {(order.shipping_notifications ?? []).length > 0 && (
        <section
          className="rounded-lg border border-line bg-panel p-4 sm:p-6"
          aria-labelledby="shipping-notifications-title"
        >
          <h2 id="shipping-notifications-title" className="text-lg font-semibold text-ink">
            {t('orders.shippingNotifications.title')}
          </h2>
          <ul className="mt-3 space-y-3 text-sm">
            {(order.shipping_notifications ?? []).map((notification) => (
              <li
                key={`${notification.purpose}-${notification.decided_at}`}
                className="border-t border-line pt-3 first:border-0 first:pt-0"
              >
                <p className="font-medium text-ink">
                  {t(`orders.shippingNotifications.purpose.${notification.purpose}`)}
                </p>
                <p className="text-ink-muted">
                  {notification.delivery
                    ? t(`orders.shippingNotifications.delivery.${notification.delivery}`)
                    : t(`orders.shippingNotifications.decision.${notification.decision}`)}
                </p>
                {notification.reason && (
                  <p className="text-ink-muted">
                    {t(
                      `orders.shippingNotifications.reason.${notification.purpose}.${notification.reason}`,
                      {
                        defaultValue: t(
                          `orders.shippingNotifications.reason.${notification.reason}`,
                          {
                            defaultValue: notification.reason ?? '',
                          },
                        ),
                      },
                    )}
                  </p>
                )}
                <time className="text-ink-muted" dateTime={notification.decided_at}>
                  {formatDateTime(notification.decided_at)}
                </time>
                {notification.tracking_available === false && (
                  <p className="text-ink-muted">{t('orders.shippingNotifications.noTracking')}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmationTimeline confirmation={order.confirmation} />

      <OrderCustomerContext
        customerId={order.customer_id}
        orderId={order.id}
        record={order.customer_record}
        refresh={customerVersion}
      />

      <OutcomeActions order={order} onChange={setOrder} onError={setError} />

      {can(order, 'confirm') && (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">{t('orders.confirmHint')}</p>
          <ReturnsWarning
            customerId={order.customer_id}
            record={order.customer_record}
            onAsked={() => setCustomerVersion((n) => n + 1)}
          />
          {advanceMissing(order) > 0 && (
            <p role="status" className="rounded-md bg-warn p-3 text-sm text-warn-ink">
              {t('orders.advance.notReceived', { amount: formatBDT(advanceMissing(order)) })}
            </p>
          )}
          <ActionButton tone="primary" disabled={busy} onClick={() => void act(confirmCall)}>
            {t('orders.confirm')}
          </ActionButton>
        </div>
      )}

      {can(order, 'cancel') &&
        (cancelling ? (
          <form
            onSubmit={cancel}
            className="space-y-3 rounded-lg border border-danger-ink/30 bg-panel p-4 sm:p-6 text-sm"
          >
            {order.confirmed_at && <p className="text-ink-muted">{t('orders.cancelStockBack')}</p>}
            {order.advance.received_minor > 0 && (
              <p role="status" className="rounded-md bg-warn p-3 text-warn-ink">
                {t('orders.advance.refundByHand', {
                  amount: formatBDT(order.advance.received_minor),
                })}
              </p>
            )}
            <label className="block font-medium text-ink-muted">
              {t('orders.cancelReasonLabel')}
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                className={cx('mt-1 block w-full', fieldClass)}
              />
            </label>
            <div className="flex gap-2">
              <ActionButton type="submit" tone="danger" disabled={busy || reason.trim() === ''}>
                {t('orders.cancelSubmit')}
              </ActionButton>
              <ActionButton onClick={() => setCancelling(false)}>{t('orders.keep')}</ActionButton>
            </div>
          </form>
        ) : (
          <ActionButton tone="danger" onClick={() => setCancelling(true)}>
            {t('orders.cancel')}
          </ActionButton>
        ))}
    </section>
  );
}
