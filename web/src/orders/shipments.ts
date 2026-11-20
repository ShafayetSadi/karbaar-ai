import type { components } from '../api/schema';
import { can } from './orderActions';
import type { Order } from './orderForm';

export type Shipment = components['schemas']['ShipmentRead'];
export type ShipmentStatus = Shipment['status'];
export type CourierConnection = components['schemas']['CourierConnectionRead'];
export type DeliveryType = Shipment['delivery_type'];
export type Quote = components['schemas']['ShipmentQuoteRead'];

/** What each courier offers. The API refuses anything else with
 * `DELIVERY_TYPE_UNSUPPORTED`; this only keeps the choice from offering it. */
export const DELIVERY_TYPES: Record<string, DeliveryType[]> = {
  pathao: ['standard', 'on_demand'],
  steadfast: ['standard', 'point_pickup'],
};

// The courier still has nothing for us: the booking runs in the background.
const IN_FLIGHT: ShipmentStatus[] = ['requested', 'booking'];
const FINISHED: ShipmentStatus[] = [
  'booking_failed',
  'cancelled',
  'delivered',
  'partially_delivered',
  'returned',
];

/** Booking is still running in the background; read the shipment again shortly. */
export function inFlight(shipment: Pick<Shipment, 'status'>): boolean {
  return IN_FLIGHT.includes(shipment.status);
}

/** A failed booking, or one closed by the courier before it moved: the order can be booked anew. */
function closed(shipment: Pick<Shipment, 'status'>): boolean {
  return shipment.status === 'booking_failed' || shipment.status === 'cancelled';
}

/** The booking's outcome was never learnt and the courier gave no id: the merchant checks the
 * courier's panel, then either records the parcel or books again (the API closes this attempt). */
export function outcomeUnknown(
  shipment: Pick<Shipment, 'needs_review_reason' | 'consignment_id'>,
): boolean {
  return shipment.needs_review_reason === 'booking_outcome_unknown' && !shipment.consignment_id;
}

/** Whether the order can be booked now, given its newest shipment (the order's own part is `book_courier`). */
export function canBook(
  order: Pick<Order, 'allowed_actions'>,
  latest: Pick<Shipment, 'status' | 'needs_review_reason' | 'consignment_id'> | null,
): boolean {
  if (!can(order, 'book_courier')) return false;
  return latest === null || closed(latest) || outcomeUnknown(latest);
}

/** "Mark as booked": only for a booking whose outcome is unknown, or one the courier has without an id. */
export function canMarkBooked(shipment: Shipment): boolean {
  if (shipment.status === 'booking' || shipment.status === 'unknown') return true;
  // Found by our reference (Steadfast), so booked, but the courier's id is still missing.
  return (
    (shipment.status === 'booked' || shipment.status === 'in_transit') &&
    shipment.consignment_id === null
  );
}

/** "Refresh": ask the courier now. Needs the courier's id, except Steadfast, which finds a parcel by
 * our reference while its booking is unresolved. */
export function canRefresh(shipment: Shipment): boolean {
  if (FINISHED.includes(shipment.status) || shipment.status === 'requested') return false;
  if (shipment.consignment_id) return true;
  return (
    shipment.provider === 'steadfast' &&
    (shipment.status === 'booking' || shipment.status === 'unknown')
  );
}

/** Weight typed in kilograms ("0.8", "১.৫") as whole grams; null for anything else. */
export function parseKg(input: string): number | null {
  const digits = '০১২৩৪৫৬৭৮৯';
  const normalised = input.trim().replace(/[০-৯]/g, (d) => String(digits.indexOf(d)));
  const match = /^(\d{1,2})(?:\.(\d{1,3}))?$/.exec(normalised);
  if (!match) return null;
  const grams = Number(match[1]) * 1000 + Number((match[2] ?? '').padEnd(3, '0'));
  return grams > 0 ? grams : null;
}

/** Grams as the kilograms a person reads and edits ("0.8"). */
export function toKg(grams: number): string {
  return String(grams / 1000);
}
