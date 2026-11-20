import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import { ActionButton, Chip, Field, cx, type ChipTone } from '../components/ui';
import { formatBDT, formatDateTime } from '../i18n/format';
import { CourierProgress } from './CourierProgress';
import { BookCourier } from './BookCourier';
import type { Order } from './orderForm';
import {
  canBook,
  canMarkBooked,
  canRefresh,
  inFlight,
  outcomeUnknown,
  toKg,
  type CourierConnection,
  type Shipment,
  type ShipmentStatus,
} from './shipments';

// Booking runs in the background: read the shipment again until the courier answered.
const POLL_MS = 3000;
const POLL_TRIES = 20;

const TONES: Record<ShipmentStatus, ChipTone> = {
  requested: 'neutral',
  booking: 'neutral',
  booked: 'ai',
  unknown: 'warn',
  booking_failed: 'danger',
  in_transit: 'ai',
  delivered: 'ok',
  partially_delivered: 'warn',
  returned: 'danger',
  cancelled: 'neutral',
};

/**
 * The order's courier booking: book a confirmed order, then follow the parcel. Shows
 * the newest attempt with its timeline; the merchant can ask the courier now, record a booking
 * found in the courier's panel, or book again.
 */
export function CourierPanel({
  order,
  onOrderChanged,
}: {
  order: Order;
  onOrderChanged: () => void;
}) {
  const { t } = useTranslation();
  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [connections, setConnections] = useState<CourierConnection[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [booking, setBooking] = useState(false);
  const tries = useRef(0);
  const orderId = order.id;

  const loadShipments = useCallback(async () => {
    const result = await call(() =>
      api.GET('/v1/orders/{order_id}/shipments', { params: { path: { order_id: orderId } } }),
    );
    if (result.ok) setShipments(result.data.items);
    return result.ok ? result.data.items : null;
  }, [orderId]);

  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- fetch on order change
    void loadShipments();
    void call(() => api.GET('/v1/courier-connections')).then((result) => {
      if (result.ok) setConnections(result.data.items);
      else if (result.error.code === 'COURIER_UNAVAILABLE') setUnavailable(true);
      else setConnections([]);
    });
  }, [loadShipments]);

  const latest = shipments?.[0] ?? null;
  const waiting = latest !== null && inFlight(latest);

  useEffect(() => {
    if (!waiting) {
      tries.current = 0;
      return;
    }
    if (tries.current >= POLL_TRIES) return;
    const timer = window.setTimeout(() => {
      tries.current += 1;
      void loadShipments().then((items) => {
        // The booking finished: the order moved to processing (or stayed, if it failed).
        if (items?.[0] && !inFlight(items[0])) onOrderChanged();
      });
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [waiting, latest, loadShipments, onOrderChanged]);

  function replaced(shipment: Shipment) {
    setShipments((current) => [shipment, ...(current ?? []).filter((s) => s.id !== shipment.id)]);
    onOrderChanged();
  }

  if (shipments === null || (connections === null && !unavailable)) return null;
  const bookable = canBook(order, latest);
  // Nothing to show: never booked, and this order cannot be.
  if (latest === null && !bookable) return null;
  if (latest === null && unavailable) return null;

  const active = (connections ?? []).filter((c) => c.status === 'active');
  const again = latest !== null && bookable;

  return (
    <div className="space-y-4 rounded-lg border border-line bg-panel p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-ink">{t('shipments.title')}</h2>

      {latest && (
        <ShipmentCard shipment={latest} connections={connections ?? []} onChanged={replaced} />
      )}
      {shipments.length > 1 && (
        <p className="text-sm text-ink-faint">
          {t('shipments.earlier', { count: shipments.length - 1 })}
        </p>
      )}

      {bookable &&
        !unavailable &&
        (active.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {t('shipments.noCourier')}{' '}
            <Link to="/settings" className="font-medium text-active hover:underline">
              {t('shipments.connectInSettings')}
            </Link>
          </p>
        ) : booking ? (
          <BookCourier
            order={order}
            connections={active}
            again={again}
            onBooked={(shipment) => {
              setBooking(false);
              replaced(shipment);
            }}
            onCancel={() => setBooking(false)}
          />
        ) : (
          <div className="space-y-2">
            {again && latest && outcomeUnknown(latest) && (
              <p className="text-sm text-warn-ink">{t('shipments.bookAgainHint')}</p>
            )}
            <ActionButton tone="primary" onClick={() => setBooking(true)}>
              {again ? t('shipments.bookAgain') : t('shipments.book')}
            </ActionButton>
          </div>
        ))}
    </div>
  );
}

function ShipmentCard({
  shipment,
  connections,
  onChanged,
}: {
  shipment: Shipment;
  connections: CourierConnection[];
  onChanged: (shipment: Shipment) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [marking, setMarking] = useState(false);
  const label = connections.find((c) => c.id === shipment.connection_id)?.label;

  async function refresh() {
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.POST('/v1/shipments/{shipment_id}/refresh', {
        params: { path: { shipment_id: shipment.id } },
      }),
    );
    setBusy(false);
    if (result.ok) onChanged(result.data);
    else setError(result.error);
  }

  async function markBooked(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = (name: string) => {
      const typed = form.get(name);
      return typeof typed === 'string' ? typed.trim() : '';
    };
    const consignment = value('consignment_id');
    const tracking = value('tracking_code');
    if (!consignment) return;
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.POST('/v1/shipments/{shipment_id}/mark-booked', {
        params: { path: { shipment_id: shipment.id } },
        body: { consignment_id: consignment, tracking_code: tracking || null },
      }),
    );
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setMarking(false);
    onChanged(result.data);
  }

  return (
    <section aria-label={t('shipments.cardLabel')} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">
          {t(`couriers.providers.${shipment.provider}`)}
          {label && label !== t(`couriers.providers.${shipment.provider}`) && (
            <span className="text-ink-faint"> · {label}</span>
          )}
        </span>
        <Chip tone={TONES[shipment.status]}>{t(`shipments.status.${shipment.status}`)}</Chip>
        {shipment.on_hold && <Chip tone="warn">{t('shipments.onHold')}</Chip>}
        {shipment.delivery_failed && <Chip tone="warn">{t('shipments.deliveryFailed')}</Chip>}
        {shipment.is_partial && <Chip tone="warn">{t('orders.outcome.partialChip')}</Chip>}
      </div>

      {shipment.needs_review_reason && (
        <p role="status" className="rounded-md bg-warn p-3 text-sm text-warn-ink">
          {t(`shipments.review.${shipment.needs_review_reason}`)}
        </p>
      )}
      {shipment.status === 'booking_failed' && shipment.failure_message && (
        <p className="rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('shipments.failed', { reason: shipment.failure_message })}
        </p>
      )}
      {inFlight(shipment) && <p className="text-sm text-ink-muted">{t('shipments.booking')}</p>}

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
        {shipment.tracking_code && (
          <>
            <dt className="text-ink-faint">{t('shipments.tracking')}</dt>
            <dd className="font-mono text-ink">{shipment.tracking_code}</dd>
          </>
        )}
        {shipment.consignment_id && shipment.consignment_id !== shipment.tracking_code && (
          <>
            <dt className="text-ink-faint">{t('shipments.consignment')}</dt>
            <dd className="font-mono text-ink">{shipment.consignment_id}</dd>
          </>
        )}
        <dt className="text-ink-faint">{t('shipments.cod')}</dt>
        <dd className="font-mono text-ink tabular-nums">{formatBDT(shipment.cod_amount_minor)}</dd>
        {shipment.collected_amount_minor !== null && (
          <>
            <dt className="text-ink-faint">{t('shipments.collected')}</dt>
            <dd className="font-mono text-ink tabular-nums">
              {formatBDT(shipment.collected_amount_minor)}
            </dd>
          </>
        )}
        {shipment.courier_fee_minor !== null && (
          <>
            <dt className="text-ink-faint">{t('shipments.fee')}</dt>
            <dd className="font-mono text-ink tabular-nums">
              {formatBDT(shipment.courier_fee_minor)}
            </dd>
          </>
        )}
        <dt className="text-ink-faint">{t('shipments.parcel')}</dt>
        <dd className="text-ink">
          {t('shipments.parcelDetail', {
            weight: toKg(shipment.weight_grams),
            type: t(`shipments.deliveryType.${shipment.delivery_type}`),
          })}
        </dd>
        {shipment.recipient.address && (
          <>
            <dt className="text-ink-faint">{t('shipments.sentAddress')}</dt>
            <dd className="break-words text-ink">{shipment.recipient.address}</dd>
          </>
        )}
        {shipment.note && (
          <>
            <dt className="text-ink-faint">{t('shipments.note')}</dt>
            <dd className="break-words text-ink">{shipment.note}</dd>
          </>
        )}
      </dl>

      {shipment.progress && <CourierProgress report={shipment.progress} />}

      {shipment.events.length > 0 && (
        <ol
          aria-label={t('shipments.timeline')}
          className="space-y-1 border-l border-line pl-4 text-sm"
        >
          {shipment.events.map((event, index) => (
            <li key={index} className={cx(!event.applied && 'text-ink-faint')}>
              <span className="tabular-nums text-xs text-ink-faint">
                {event.source === 'webhook' || event.source === 'poll'
                  ? event.courier_occurred_at
                    ? formatDateTime(event.courier_occurred_at)
                    : t('courierProgress.timeUnknown')
                  : formatDateTime(event.occurred_at)}
              </span>{' '}
              <span className={cx(event.applied ? 'text-ink' : 'text-ink-faint')}>
                {event.milestone === 'out_for_delivery'
                  ? t('courierProgress.outForDelivery')
                  : event.status
                    ? t(`shipments.status.${event.status}`, { defaultValue: event.status })
                    : (event.raw_status ?? '')}
              </span>
              {event.collected_amount_minor !== null &&
                ` · ${t('shipments.collectedAmount', { amount: formatBDT(event.collected_amount_minor) })}`}
              {event.message && <span className="text-ink-muted"> · {event.message}</span>}
              <span className="text-ink-faint"> · {t(`shipments.source.${event.source}`)}</span>
            </li>
          ))}
        </ol>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {error.message}
        </p>
      )}

      {marking ? (
        <form onSubmit={markBooked} className="space-y-3 rounded-md bg-panel-muted p-4">
          <p className="text-sm text-ink-muted">{t('shipments.markBookedHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t('shipments.consignment')}
              name="consignment_id"
              required
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
            />
            <Field
              label={t('shipments.trackingOptional')}
              name="tracking_code"
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="flex gap-2">
            <ActionButton type="submit" tone="primary" disabled={busy}>
              {t('shipments.markBookedSave')}
            </ActionButton>
            <ActionButton onClick={() => setMarking(false)}>{t('common.cancel')}</ActionButton>
          </div>
        </form>
      ) : (
        (canRefresh(shipment) || canMarkBooked(shipment)) && (
          <div className="flex flex-wrap gap-2">
            {canRefresh(shipment) && (
              <ActionButton disabled={busy} onClick={() => void refresh()}>
                {busy ? t('common.pleaseWait') : t('shipments.refresh')}
              </ActionButton>
            )}
            {canMarkBooked(shipment) && (
              <ActionButton disabled={busy} onClick={() => setMarking(true)}>
                {t('shipments.markBooked')}
              </ActionButton>
            )}
          </div>
        )
      )}
    </section>
  );
}
