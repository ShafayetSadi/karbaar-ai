import { MediaImage } from '../components/MediaImage';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProductCards } from './useProductCards';

const CONTROL =
  'rounded-full bg-ink/70 p-0.5 text-paper hover:bg-ink focus-visible:outline-2 focus-visible:outline-active';

/**
 * The product cards chosen for the next reply, after its images: small previews in the order the
 * customer gets them, each removable and movable. Scrolls sideways rather than wrapping, so ten
 * cards stay one row at phone width.
 */
export function CardTray({ cards }: { cards: ProductCards }) {
  const { t } = useTranslation();
  if (cards.items.length === 0) return null;
  const last = cards.items.length - 1;
  return (
    <ul
      aria-label={t('inbox.composer.cardTray')}
      className="mb-2 flex max-w-full snap-x gap-2 overflow-x-auto pb-1"
    >
      {cards.items.map((product, i) => (
        <li
          key={product.id}
          className="relative w-24 shrink-0 snap-start overflow-hidden rounded-lg border border-line bg-panel"
        >
          {product.image ? (
            <MediaImage src={product.image} alt="" className="h-16 w-full object-cover" />
          ) : (
            <div aria-hidden className="h-16 w-full bg-panel-muted" />
          )}
          <div className="px-1.5 py-1">
            <p className="truncate text-xs text-ink">{product.name}</p>
            {product.price && (
              <p className="truncate font-mono text-[0.65rem] text-ink-muted">{product.price}</p>
            )}
          </div>
          <button
            type="button"
            aria-label={t('inbox.composer.remove', { name: product.name })}
            onClick={() => cards.remove(product.id)}
            className={`absolute top-0.5 right-0.5 ${CONTROL}`}
          >
            <X aria-hidden className="size-3.5" />
          </button>
          <div className="absolute top-0.5 left-0.5 flex gap-0.5">
            {i > 0 && (
              <button
                type="button"
                aria-label={t('inbox.composer.moveEarlier', { name: product.name })}
                onClick={() => cards.move(product.id, -1)}
                className={CONTROL}
              >
                <ChevronLeft aria-hidden className="size-3.5" />
              </button>
            )}
            {i < last && (
              <button
                type="button"
                aria-label={t('inbox.composer.moveLater', { name: product.name })}
                onClick={() => cards.move(product.id, 1)}
                className={CONTROL}
              >
                <ChevronRight aria-hidden className="size-3.5" />
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
