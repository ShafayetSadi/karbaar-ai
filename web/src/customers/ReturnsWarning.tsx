import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import { ActionButton } from '../components/ui';
import { finishedParcels, type DeliveryRecord } from './DeliveryRecordChip';

/**
 * Before confirming or taking an order: this customer sent parcels back before. Counts only, and
 * never a block: the merchant decides. Offers to ask them for the delivery charge as
 * an advance from now on; `onAsked` lets the page refresh what shows the advance.
 */
export function ReturnsWarning({
  customerId,
  record,
  compact = false,
  onAsked,
}: {
  customerId: string;
  record: DeliveryRecord | null | undefined;
  compact?: boolean;
  onAsked?: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!record || record.returned === 0) return null;

  async function ask() {
    setBusy(true);
    setFailed(false);
    const result = await call(() =>
      api.PUT('/v1/customers/{customer_id}/advance', {
        params: { path: { customer_id: customerId } },
        body: { policy: 'delivery_fee', fixed_minor: null },
      }),
    );
    setBusy(false);
    if (result.ok) {
      setAsked(true);
      onAsked?.();
    } else {
      setFailed(true);
    }
  }

  return (
    <div role="status" className="space-y-2 rounded-md bg-warn p-3 text-sm text-warn-ink">
      <p>
        {t('customers.returns.warning', {
          returned: record.returned,
          total: finishedParcels(record),
        })}
        {!compact && ` ${t('customers.returns.decide')}`}
      </p>
      {asked ? (
        <p>{t('customers.returns.asked')}</p>
      ) : (
        <ActionButton size="sm" disabled={busy} onClick={() => void ask()}>
          {t('customers.returns.ask')}
        </ActionButton>
      )}
      {failed && <p role="alert">{t('customers.returns.failed')}</p>}
    </div>
  );
}
