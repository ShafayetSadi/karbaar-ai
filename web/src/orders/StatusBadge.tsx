import { useTranslation } from 'react-i18next';
import { Chip, type ChipTone } from '../components/ui';
import type { OrderStatus } from './orderForm';

const TONES: Record<OrderStatus, ChipTone> = {
  pending: 'warn',
  on_hold: 'warn',
  confirmed: 'ok',
  processing: 'ai',
  ready_to_ship: 'ai',
  shipped: 'ai',
  delivered: 'ok',
  cancelled: 'neutral',
  // A return costs the merchant money: it should stand out from a plain cancellation.
  returned: 'danger',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return <Chip tone={TONES[status]}>{t(`orders.status.${status}`)}</Chip>;
}
