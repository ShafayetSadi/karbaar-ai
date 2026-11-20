import { ImageOff, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MediaImage } from '../components/MediaImage';
import { useStableSrc } from '../components/useStableSrc';
import { initials } from '../inbox/initials';
import type { OrderRow } from './orderForm';

/** The first line's photo, or a neutral placeholder, with "+N" when the order has more lines. */
export function OrderThumb({ order }: { order: OrderRow }) {
  const { t } = useTranslation();
  const { src, onError } = useStableSrc(order.thumbnail_url);
  const first = order.items[0]?.product_name;
  return (
    <span className="relative inline-block shrink-0">
      {src ? (
        <MediaImage
          src={src}
          alt={t('orders.thumbAlt', { product: first ?? '' })}
          onError={onError}
          className="size-10 rounded-md border border-line bg-panel-muted object-cover"
        />
      ) : (
        <span
          role="img"
          aria-label={t('orders.noPhoto')}
          className="flex size-10 items-center justify-center rounded-md border border-line bg-panel-muted text-ink-faint"
        >
          <ImageOff aria-hidden className="size-4" />
        </span>
      )}
      {order.other_lines > 0 && (
        <span className="absolute -right-1.5 -bottom-1.5 rounded-full bg-ink px-1.5 text-[0.65rem] leading-4 font-medium text-panel tabular-nums ring-2 ring-panel">
          <span aria-hidden>+{order.other_lines}</span>
          <span className="sr-only">{t('orders.moreLines', { count: order.other_lines })}</span>
        </span>
      )}
    </span>
  );
}

/** One neutral style for every customer: their first two initials, or a person icon with no name. */
export function CustomerInitials({ name }: { name: string | null }) {
  const named = Boolean(name?.trim());
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-panel-muted text-xs font-medium text-ink-muted"
    >
      {named ? initials(name) : <User data-testid="no-name-icon" className="size-4" />}
    </span>
  );
}
