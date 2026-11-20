import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call, type Outcome } from '../api/call';
import type { ApiError } from '../api/errors';
import { ActionButton, cx, fieldClass } from '../components/ui';
import { formatBDT, parseTaka } from '../i18n/format';
import type { Order } from './orderForm';
import { keyKeeper, outcomeActions, type OutcomeAction } from './outcomes';

/**
 * Mark what happened to the parcel: shipped, delivered (in full or partly), returned, and a
 * returned parcel received back (its stock comes back once). By hand until couriers report it.
 */
export function OutcomeActions({
  order,
  onChange,
  onError,
}: {
  order: Order;
  onChange: (order: Order) => void;
  onError: (error: ApiError | null) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [partial, setPartial] = useState(false);
  const [collected, setCollected] = useState('');
  const [collectedProblem, setCollectedProblem] = useState(false);
  const [confirmingReturn, setConfirmingReturn] = useState(false);
  const keys = useRef(keyKeeper());
  const actions = outcomeActions(order);
  if (actions.length === 0) return null;
  const orderId = order.id;

  async function send(fingerprint: string, run: (key: string) => Promise<Outcome<Order>>) {
    setBusy(true);
    onError(null);
    const result = await run(keys.current.key(fingerprint));
    keys.current.settle(!result.ok && result.error.code === 'NETWORK_ERROR');
    setBusy(false);
    if (result.ok) {
      onChange(result.data);
      setDelivering(false);
      setConfirmingReturn(false);
    } else {
      onError(result.error);
    }
  }

  function post(action: Exclude<OutcomeAction, 'delivered'>) {
    void send(`${orderId}|${action}`, (key) => {
      const params = { path: { order_id: orderId }, header: { 'Idempotency-Key': key } };
      if (action === 'shipped') {
        return call(() => api.POST('/v1/orders/{order_id}/shipped', { params }));
      }
      if (action === 'returned') {
        return call(() => api.POST('/v1/orders/{order_id}/returned', { params }));
      }
      return call(() => api.POST('/v1/orders/{order_id}/return-received', { params }));
    });
  }

  function startDelivering() {
    setPartial(false);
    setCollected(String(order.cod_amount_minor / 100));
    setCollectedProblem(false);
    setDelivering(true);
  }

  function deliver(event: FormEvent) {
    event.preventDefault();
    let minor: number | null = null;
    if (partial) {
      minor = parseTaka(collected);
      if (minor === null || minor < 0 || minor >= order.cod_amount_minor) {
        setCollectedProblem(true);
        return;
      }
    }
    setCollectedProblem(false);
    const body = partial ? { collected_minor: minor, partial: true } : { partial: false };
    void send(`${orderId}|delivered|${partial}|${minor}`, (key) =>
      call(() =>
        api.POST('/v1/orders/{order_id}/delivered', {
          params: { path: { order_id: orderId }, header: { 'Idempotency-Key': key } },
          body,
        }),
      ),
    );
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-ink">{t('orders.outcome.title')}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t('orders.outcome.hint')}</p>

      {delivering ? (
        <form onSubmit={deliver} className="mt-4 space-y-3 text-sm">
          <label className="flex items-center gap-2 font-medium text-ink-muted">
            <input
              type="checkbox"
              checked={partial}
              onChange={(e) => setPartial(e.target.checked)}
            />
            {t('orders.outcome.partial')}
          </label>
          {partial ? (
            <label className="block font-medium text-ink-muted">
              {t('orders.outcome.collected')}
              <input
                value={collected}
                inputMode="decimal"
                onChange={(e) => setCollected(e.target.value)}
                className={cx('mt-1 block w-full max-w-xs', fieldClass)}
              />
              {collectedProblem && (
                <span role="alert" className="mt-1 block font-normal text-danger-ink">
                  {t('orders.outcome.collectedProblem', {
                    max: formatBDT(order.cod_amount_minor),
                  })}
                </span>
              )}
              <span className="mt-1 block font-normal text-ink-faint">
                {t('orders.outcome.partialStock')}
              </span>
            </label>
          ) : (
            <p className="text-ink-muted">
              {t('orders.outcome.collectedFull', { amount: formatBDT(order.cod_amount_minor) })}
            </p>
          )}
          <div className="flex gap-2">
            <ActionButton type="submit" tone="primary" disabled={busy}>
              {t('orders.outcome.saveDelivered')}
            </ActionButton>
            <ActionButton onClick={() => setDelivering(false)}>{t('orders.keep')}</ActionButton>
          </div>
        </form>
      ) : confirmingReturn ? (
        <div className="mt-4 space-y-3 text-sm">
          <p role="status" className="rounded-md bg-warn p-3 text-warn-ink">
            {order.status === 'delivered'
              ? t('orders.outcome.returnAfterDelivered')
              : t('orders.outcome.returnHint')}
          </p>
          <div className="flex gap-2">
            <ActionButton tone="danger" disabled={busy} onClick={() => post('returned')}>
              {t('orders.outcome.saveReturned')}
            </ActionButton>
            <ActionButton onClick={() => setConfirmingReturn(false)}>
              {t('orders.keep')}
            </ActionButton>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.includes('shipped') && (
            <ActionButton disabled={busy} onClick={() => post('shipped')}>
              {t('orders.outcome.shipped')}
            </ActionButton>
          )}
          {actions.includes('delivered') && (
            <ActionButton tone="primary" disabled={busy} onClick={startDelivering}>
              {t('orders.outcome.delivered')}
            </ActionButton>
          )}
          {actions.includes('returned') && (
            <ActionButton disabled={busy} onClick={() => setConfirmingReturn(true)}>
              {t('orders.outcome.returned')}
            </ActionButton>
          )}
          {actions.includes('return-received') && (
            <div className="space-y-2">
              <p className="text-sm text-ink-muted">{t('orders.outcome.receivedHint')}</p>
              <ActionButton tone="primary" disabled={busy} onClick={() => post('return-received')}>
                {t('orders.outcome.received')}
              </ActionButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
