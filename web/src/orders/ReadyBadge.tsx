import { useTranslation } from 'react-i18next';
import { Chip } from '../components/ui';
import { formatDate } from '../i18n/format';
import type { Order } from './orderForm';

/** "Pre-order" and "Ready by 24 Oct" for an order with lines that are not on the shelf. */
export function ReadyBadge({ order }: { order: Order }) {
  const { t } = useTranslation();
  const modes = new Set(order.items.map((item) => item.availability));
  const preOrder = modes.has('pre_order');
  const madeToOrder = modes.has('made_to_order');
  if (!preOrder && !madeToOrder && !order.ready_by) return null;
  return (
    <>
      {preOrder && <Chip tone="warn">{t('orders.availability.pre_order')}</Chip>}
      {madeToOrder && <Chip tone="warn">{t('orders.availability.made_to_order')}</Chip>}
      {order.ready_by && (
        <Chip tone="neutral">{t('orders.readyBy', { date: formatDate(order.ready_by) })}</Chip>
      )}
    </>
  );
}
