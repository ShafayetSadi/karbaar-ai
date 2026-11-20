import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import type { components } from '../api/schema';
import { useApproval } from '../auth/useApproval';
import { ApprovalLock } from '../components/ApprovalLock';
import { ActionButton, cx, fieldClass } from '../components/ui';
import { DeliveryRecordChip } from '../customers/DeliveryRecordChip';
import { formatBDT, formatDateTime, toTakaInput } from '../i18n/format';
import type { Order } from './orderForm';
import { keyKeeper } from './outcomes';
import {
  DELIVERY_TYPES,
  parseKg,
  toKg,
  type CourierConnection,
  type DeliveryType,
  type Quote,
  type Shipment,
} from './shipments';

type CustomerRecord = components['schemas']['CustomerDeliveryRecordRead'];

/**
 * Book the order with one of the shop's couriers. Everything is prefilled from the order and the
 * courier account's defaults; changes here apply to this parcel only, never to the order.
 */
export function BookCourier({
  order,
  connections,
  again,
  onBooked,
  onCancel,
}: {
  order: Order;
  connections: CourierConnection[];
  again: boolean;
  onBooked: (shipment: Shipment) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { locked } = useApproval();
  const first = connections.find((c) => c.is_default) ?? connections[0];
  const [connectionId, setConnectionId] = useState(first?.id ?? '');
  const connection = connections.find((c) => c.id === connectionId) ?? first;
  const types = (connection && DELIVERY_TYPES[connection.provider]) ?? ['standard'];
  const [deliveryType, setDeliveryType] = useState<DeliveryType>(
    connection?.default_delivery_type as DeliveryType,
  );
  const [weight, setWeight] = useState('');
  const [weightProblem, setWeightProblem] = useState(false);
  // The weight is quoted when its field is left, not on every key.
  const [quotedGrams, setQuotedGrams] = useState<number | null>(null);
  const [note, setNote] = useState(connection?.default_note ?? '');
  const [editingAddress, setEditingAddress] = useState(false);
  const [address, setAddress] = useState(order.customer.address.raw_text ?? '');
  const [name, setName] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const keys = useRef(keyKeeper());
  const quoteSeq = useRef(0);
  const type = types.includes(deliveryType) ? deliveryType : (types[0] ?? 'standard');

  const fetchQuote = useCallback(async () => {
    if (!connectionId) return;
    const seq = ++quoteSeq.current;
    setQuoteError(null);
    const result = await call(() =>
      api.POST('/v1/shipments/quote', {
        body: {
          order_id: order.id,
          connection_id: connectionId,
          delivery_type: type,
          ...(quotedGrams === null ? {} : { weight_grams: quotedGrams }),
        },
      }),
    );
    // A slower answer for an earlier choice never replaces the latest one.
    if (seq !== quoteSeq.current) return;
    if (result.ok) setQuote(result.data);
    else {
      setQuote(null);
      setQuoteError(result.error);
    }
  }, [order.id, connectionId, type, quotedGrams]);

  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- quote on courier, type or weight change
    void fetchQuote();
  }, [fetchQuote]);

  function chooseConnection(id: string) {
    const next = connections.find((c) => c.id === id);
    setConnectionId(id);
    setDeliveryType(next?.default_delivery_type as DeliveryType);
    setNote(next?.default_note ?? '');
  }

  function weightLeft() {
    const grams = weight.trim() === '' ? null : parseKg(weight);
    setWeightProblem(weight.trim() !== '' && grams === null);
    if (weight.trim() === '' || grams !== null) setQuotedGrams(grams);
  }

  async function book(e: FormEvent) {
    e.preventDefault();
    const grams = weight.trim() === '' ? null : parseKg(weight);
    if (weight.trim() !== '' && grams === null) {
      setWeightProblem(true);
      return;
    }
    const override = address.trim();
    const body = {
      connection_id: connectionId,
      delivery_type: type,
      // An empty note sends none; the account's default was prefilled above.
      note: note.trim(),
      ...(grams === null ? {} : { weight_grams: grams }),
      ...(editingAddress && override && override !== order.customer.address.raw_text
        ? { address_override: override }
        : {}),
      ...(!order.customer.name && name.trim() ? { recipient_name: name.trim() } : {}),
    };
    setBusy(true);
    setError(null);
    const key = keys.current.key(JSON.stringify(body));
    const result = await call(() =>
      api.POST('/v1/orders/{order_id}/shipments', {
        params: { path: { order_id: order.id }, header: { 'Idempotency-Key': key } },
        body,
      }),
    );
    keys.current.settle(!result.ok && result.error.code === 'NETWORK_ERROR');
    setBusy(false);
    if (result.ok) onBooked(result.data);
    else setError(result.error);
  }

  return (
    <form
      onSubmit={(e) => void book(e)}
      aria-label={t('shipments.form.label')}
      className="space-y-4 rounded-md border border-line p-4 text-sm"
    >
      <h3 className="font-semibold text-ink">
        {again ? t('shipments.bookAgain') : t('shipments.book')}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block font-medium text-ink-muted">
          {t('shipments.form.courier')}
          <select
            value={connectionId}
            onChange={(e) => chooseConnection(e.target.value)}
            className={cx('mt-1 block w-full', fieldClass)}
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block font-medium text-ink-muted">
          {t('shipments.form.deliveryType')}
          <select
            value={type}
            onChange={(e) => setDeliveryType(e.target.value as DeliveryType)}
            className={cx('mt-1 block w-full', fieldClass)}
          >
            {types.map((value) => (
              <option key={value} value={value}>
                {t(`shipments.deliveryType.${value}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
        <dt className="text-ink-faint">{t('shipments.form.collect')}</dt>
        <dd className="font-mono text-ink tabular-nums">
          {t('shipments.form.codAmount', { amount: formatBDT(order.cod_amount_minor) })}
        </dd>
        <dt className="text-ink-faint">{t('shipments.fee')}</dt>
        <dd className="text-ink">
          <QuoteLine quote={quote} error={quoteError} />
        </dd>
      </dl>

      <label className="block font-medium text-ink-muted">
        {t('shipments.form.weight')}
        <input
          value={weight}
          inputMode="decimal"
          placeholder={quote ? toKg(quote.weight_grams) : ''}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={weightLeft}
          aria-invalid={weightProblem || undefined}
          className={cx('mt-1 block w-full max-w-xs', fieldClass)}
        />
        <span
          role={weightProblem ? 'alert' : undefined}
          className={cx(
            'mt-1 block font-normal',
            weightProblem ? 'text-danger-ink' : 'text-ink-faint',
          )}
        >
          {weightProblem ? t('shipments.form.weightProblem') : t('shipments.form.weightHint')}
        </span>
      </label>

      {!order.customer.name && (
        <label className="block font-medium text-ink-muted">
          {t('shipments.form.recipientName')}
          <input
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            className={cx('mt-1 block w-full max-w-xs', fieldClass)}
          />
        </label>
      )}

      <div>
        <p className="font-medium text-ink-muted">{t('shipments.form.address')}</p>
        {editingAddress ? (
          <>
            <textarea
              aria-label={t('shipments.form.address')}
              value={address}
              rows={2}
              maxLength={500}
              onChange={(e) => setAddress(e.target.value)}
              className={cx('mt-1 block w-full', fieldClass)}
            />
            <span className="mt-1 block text-ink-faint">{t('shipments.form.addressHint')}</span>
          </>
        ) : (
          <p className="mt-1 flex flex-wrap items-baseline gap-2 text-ink">
            <span className="break-words">
              {order.customer.address.raw_text ?? t('orders.none')}
            </span>
            <ActionButton size="sm" tone="ghost" onClick={() => setEditingAddress(true)}>
              {t('shipments.form.editAddress')}
            </ActionButton>
          </p>
        )}
      </div>

      <label className="block font-medium text-ink-muted">
        {t('shipments.form.note')}
        <textarea
          value={note}
          rows={2}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          className={cx('mt-1 block w-full', fieldClass)}
        />
      </label>

      <CustomerRecordLine order={order} />

      {error && (
        <p role="alert" className="rounded-md bg-danger px-3 py-2 text-danger-ink">
          {error.message}
        </p>
      )}
      <div className="flex gap-2">
        <ActionButton type="submit" tone="primary" disabled={busy || !connectionId || locked}>
          {busy ? t('common.pleaseWait') : t('shipments.form.submit')}
        </ActionButton>
        <ActionButton onClick={onCancel}>{t('common.cancel')}</ActionButton>
      </div>
      {locked && <ApprovalLock />}
    </form>
  );
}

function QuoteLine({ quote, error }: { quote: Quote | null; error: ApiError | null }) {
  const { t } = useTranslation();
  if (error) return <span className="text-ink-muted">{t('shipments.quote.failed')}</span>;
  if (!quote) return <span className="text-ink-faint">{t('shipments.quote.loading')}</span>;
  if (quote.kind === 'unavailable' || quote.fee_minor === null) {
    return (
      <span className="text-ink-muted">
        {t(`shipments.quote.reason.${quote.reason ?? 'courier_refused'}`)}
      </span>
    );
  }
  const parts = [
    t(quote.kind === 'estimate' ? 'shipments.quote.estimate' : 'shipments.quote.courier', {
      amount: formatBDT(quote.fee_minor),
    }),
  ];
  if (quote.fee_tier) parts.push(t(`shipments.quote.tier.${quote.fee_tier}`));
  if (quote.cod_charge_minor !== null && quote.cod_percent_bp !== null) {
    parts.push(
      t('shipments.quote.codCharge', {
        amount: formatBDT(quote.cod_charge_minor),
        percent: toTakaInput(quote.cod_percent_bp),
      }),
    );
  }
  return (
    <span className="font-mono tabular-nums">
      {parts.join(' · ')}
      {quote.total_minor !== null && quote.total_minor !== quote.fee_minor && (
        <span className="block text-ink-muted">
          {t('shipments.quote.total', { amount: formatBDT(quote.total_minor) })}
        </span>
      )}
    </span>
  );
}

/** The customer's own record with this shop, and their record across couriers, which is a paid
 * lookup (BDCourier) made only when the merchant presses Check. Information only: never blocks. */
function CustomerRecordLine({ order }: { order: Order }) {
  const { t } = useTranslation();
  const [record, setRecord] = useState<CustomerRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const customerId = order.customer_id;

  useEffect(() => {
    let cancelled = false;
    void call(() =>
      api.GET('/v1/customers/{customer_id}/delivery-record', {
        params: { path: { customer_id: customerId } },
      }),
    ).then((result) => {
      if (!cancelled && result.ok) setRecord(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  async function check() {
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.POST('/v1/customers/{customer_id}/delivery-record/check', {
        params: { path: { customer_id: customerId } },
      }),
    );
    setBusy(false);
    if (result.ok) setRecord(result.data);
    else setError(result.error);
  }

  const network = record?.network ?? null;
  return (
    <div>
      <p className="font-medium text-ink-muted">{t('shipments.form.customer')}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-ink">
        <DeliveryRecordChip record={order.customer_record} />
        {network ? (
          <span>
            {t('shipments.network.summary', {
              delivered: network.delivered,
              returned: network.returned,
              total: network.total,
            })}
            {Object.keys(network.by_courier).length > 0 && (
              <span className="block text-ink-muted">
                {Object.entries(network.by_courier)
                  .map(([courier, counts]) =>
                    t('shipments.network.courier', {
                      courier: t(`couriers.providers.${courier}`, { defaultValue: courier }),
                      delivered: counts.delivered,
                      returned: counts.returned,
                    }),
                  )
                  .join(' · ')}
              </span>
            )}
            <span className="block text-xs text-ink-faint">
              {t('shipments.network.checkedAt', { when: formatDateTime(network.fetched_at) })}
            </span>
          </span>
        ) : (
          record?.network_available && (
            <ActionButton size="sm" disabled={busy} onClick={() => void check()}>
              {busy ? t('common.pleaseWait') : t('shipments.network.check')}
            </ActionButton>
          )
        )}
      </div>
      {!network && record?.network_available && (
        <p className="mt-1 text-ink-faint">{t('shipments.network.hint')}</p>
      )}
      {error && <p className="mt-1 text-danger-ink">{error.message}</p>}
    </div>
  );
}
