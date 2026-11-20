import type { Order } from './orderForm';

/** What the merchant may do to an order; the API decides and lists it as `allowed_actions`. */
export type OrderAction = Order['allowed_actions'][number];

/** Whether the API lists `action` for this order right now (the dashboard keeps no copy of the rules). */
export function can(order: Pick<Order, 'allowed_actions'>, action: OrderAction): boolean {
  return order.allowed_actions.includes(action);
}
