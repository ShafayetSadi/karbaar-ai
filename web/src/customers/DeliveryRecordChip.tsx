import { useTranslation } from 'react-i18next';
import type { components } from '../api/schema';
import { Chip } from '../components/ui';

export type DeliveryRecord = components['schemas']['DeliveryRecordRead'];

/** Parcels that reached the customer or came back: the ones that say how they treat a COD order. */
export function finishedParcels(record: DeliveryRecord): number {
  return record.delivered + record.partial + record.returned;
}

/**
 * The customer's own record with this shop, as counts (ADR 0034): "2 returned of 5", or
 * "3 delivered". Nothing when they have no finished or cancelled order yet. Never a score.
 */
export function DeliveryRecordChip({ record }: { record: DeliveryRecord | null | undefined }) {
  const { t } = useTranslation();
  if (!record) return null;
  const finished = finishedParcels(record);
  if (finished === 0 && record.cancelled === 0) return null;
  const detail = t('customers.record.detail', {
    delivered: record.delivered,
    partial: record.partial,
    returned: record.returned,
    cancelled: record.cancelled,
  });
  return (
    <span title={detail} aria-label={detail}>
      <Chip tone={record.returned > 0 ? 'warn' : 'neutral'}>
        {record.returned > 0
          ? t('customers.record.returned', { returned: record.returned, total: finished })
          : finished > 0
            ? t('customers.record.delivered', { count: record.delivered + record.partial })
            : t('customers.record.cancelled', { count: record.cancelled })}
      </Chip>
    </span>
  );
}
