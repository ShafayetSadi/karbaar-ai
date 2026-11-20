import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { call } from '../api/call';
import { CustomerAdvance } from './CustomerAdvance';
import type { DeliveryRecord } from './DeliveryRecordChip';
import { CustomerOrders } from './CustomerOrders';
import { TeamNote } from './TeamNote';

/**
 * Everything the team knows about the customer, on the order itself: the private team note and
 * their other orders with how they ended. "Open the order, see everything".
 */
export function OrderCustomerContext({
  customerId,
  orderId,
  record,
  refresh = 0,
}: {
  customerId: string;
  orderId: string;
  record: DeliveryRecord | null;
  refresh?: number;
}) {
  const [customer, setCustomer] = useState<{ id: string; notes: string | null } | null>(null);

  const load = useCallback(async () => {
    const result = await call(() =>
      api.GET('/v1/customers/{customer_id}', { params: { path: { customer_id: customerId } } }),
    );
    // Erased or unreadable: the note is simply not shown.
    if (result.ok) setCustomer({ id: result.data.id, notes: result.data.notes ?? null });
  }, [customerId]);

  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- fetch on customer change
    void load();
  }, [load]);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel text-sm">
      {customer && <TeamNote customer={customer} onSaved={() => void load()} />}
      <CustomerAdvance key={refresh} customerId={customerId} storageKey="order.customerAdvance" />
      <CustomerOrders
        customerId={customerId}
        excludeOrderId={orderId}
        record={record}
        storageKey="order.customerOrders"
      />
    </div>
  );
}
