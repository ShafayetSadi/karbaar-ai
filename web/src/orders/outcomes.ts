import { can, type OrderAction } from './orderActions';
import type { Order } from './orderForm';

/** The outcome buttons, in the order they show. */
export type OutcomeAction = 'shipped' | 'delivered' | 'returned' | 'return-received';

/** The API action each outcome button performs. */
const OUTCOME_ACTION: Record<OutcomeAction, OrderAction> = {
  shipped: 'mark_shipped',
  delivered: 'mark_delivered',
  returned: 'mark_returned',
  'return-received': 'receive_return',
};

/** What the merchant can mark next: the outcome buttons the order's `allowed_actions` list. */
export function outcomeActions(order: Pick<Order, 'allowed_actions'>): OutcomeAction[] {
  return (Object.keys(OUTCOME_ACTION) as OutcomeAction[]).filter((outcome) =>
    can(order, OUTCOME_ACTION[outcome]),
  );
}

/** The bulk bar's outcome buttons: shipped, delivered, returned. */
export const BULK_OUTCOMES = ['shipped', 'delivered', 'returned'] as const;
export type BulkOutcome = (typeof BULK_OUTCOMES)[number];

/** Whether the order qualifies for this bulk outcome button. */
export function canMarkOutcome(
  order: Pick<Order, 'allowed_actions'>,
  outcome: BulkOutcome,
): boolean {
  return can(order, OUTCOME_ACTION[outcome]);
}

/** Keeps one Idempotency-Key per distinct request across retries, so a timeout never marks twice.
 * Forget the key once the server answered (anything but a network error). */
export function keyKeeper() {
  let held: { fingerprint: string; key: string } | null = null;
  return {
    key(fingerprint: string): string {
      if (held?.fingerprint !== fingerprint) held = { fingerprint, key: crypto.randomUUID() };
      return held.key;
    },
    settle(networkError: boolean) {
      if (!networkError) held = null;
    },
  };
}
