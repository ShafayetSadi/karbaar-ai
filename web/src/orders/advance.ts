import { can } from './orderActions';
import type { Order } from './orderForm';

export const ADVANCE_METHODS = ['bkash', 'nagad', 'rocket', 'bank', 'cash', 'other'] as const;
export type AdvanceMethod = (typeof ADVANCE_METHODS)[number];

export function canRecordAdvance(order: Pick<Order, 'allowed_actions'>): boolean {
  return can(order, 'record_advance');
}

/** The order asked for an advance that has not been recorded in full yet and can still take it. */
export function advancePending(order: Pick<Order, 'allowed_actions' | 'advance'>): boolean {
  return canRecordAdvance(order) && order.advance.received_minor < order.advance.required_minor;
}

/** How much of the required advance is still missing (never negative). */
export function advanceMissing(order: Pick<Order, 'advance'>): number {
  return Math.max(0, order.advance.required_minor - order.advance.received_minor);
}
