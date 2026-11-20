import { MediaImage } from '../components/MediaImage';
import { useStableSrc } from '../components/useStableSrc';
import { Check, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionButton, cx, fieldClass } from '../components/ui';
import { formatBDT, formatInteger } from '../i18n/format';
import type { PickedProduct } from './useProductCards';
import { useProductSearch, type Product } from './useProductSearch';

/**
 * Pick products to send as cards, the same cards the agent sends. Each shows its photo, price and
 * stock as the catalog has them now; the card itself is built by the API when it goes. Several can
 * be chosen; `onPick` gets them in the order selected.
 */
export function ProductPicker({
  room,
  added,
  onPick,
  onBack,
}: {
  /** How many more cards the reply can take. */
  room: number;
  /** Products already in the reply, shown as added. */
  added: string[];
  onPick: (products: PickedProduct[]) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { products, failed } = useProductSearch(query);
  const [chosen, setChosen] = useState<PickedProduct[]>([]);

  function toggle(product: PickedProduct) {
    setChosen((now) =>
      now.some((c) => c.id === product.id)
        ? now.filter((c) => c.id !== product.id)
        : now.length < room
          ? [...now, product]
          : now,
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-ink">{t('inbox.composer.products.title')}</h3>
        <button type="button" onClick={onBack} className="text-xs text-ink-muted underline">
          {t('inbox.composer.catalog.back')}
        </button>
      </div>
      <div className="relative">
        <Search aria-hidden className="absolute top-2.5 left-2.5 size-4 text-ink-faint" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('inbox.composer.catalog.search')}
          placeholder={t('inbox.composer.catalog.search')}
          className={cx(fieldClass, 'pl-8')}
        />
      </div>
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {failed && (
          <li role="alert" className="text-sm text-danger-ink">
            {t('inbox.composer.catalog.failed')}
          </li>
        )}
        {products && !failed && products.length === 0 && (
          <li className="text-sm text-ink-faint">{t('inbox.composer.products.empty')}</li>
        )}
        {(products ?? []).map((product) => {
          const inReply = added.includes(product.id);
          const order = chosen.findIndex((c) => c.id === product.id);
          return (
            <li key={product.id}>
              <ProductOption
                product={product}
                inReply={inReply}
                order={order < 0 ? null : order + 1}
                onToggle={toggle}
              />
            </li>
          );
        })}
      </ul>
      <ActionButton
        tone="primary"
        disabled={chosen.length === 0}
        onClick={() => onPick(chosen)}
        className="w-full justify-center"
      >
        {t('inbox.composer.products.add', { count: chosen.length })}
      </ActionButton>
    </div>
  );
}

function ProductOption({
  product,
  inReply,
  order,
  onToggle,
}: {
  product: Product;
  inReply: boolean;
  /** Its place among the products chosen so far, or null when not chosen. */
  order: number | null;
  onToggle: (product: PickedProduct) => void;
}) {
  const { t } = useTranslation();
  const image = product.images.find((i) => i.thumbnail_url || i.medium_url || i.url);
  const thumbnail = image?.thumbnail_url ?? image?.url ?? null;
  const { src, onError } = useStableSrc(thumbnail);
  const price = priceOf(product, t);
  return (
    <button
      type="button"
      aria-pressed={order !== null}
      aria-label={product.name}
      disabled={inReply}
      onClick={() =>
        onToggle({ id: product.id, name: product.name, image: src ?? thumbnail, price })
      }
      className={cx(
        'flex w-full items-center gap-2 rounded-md border-2 p-1 text-left hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-active disabled:opacity-60 disabled:hover:bg-transparent',
        order !== null ? 'border-active' : 'border-transparent',
      )}
    >
      {src ? (
        <MediaImage
          image={image}
          src={src}
          onError={onError}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          decoding="async"
          className="size-10 flex-none rounded object-cover"
        />
      ) : (
        <span aria-hidden className="size-10 flex-none rounded bg-panel-muted" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink">{product.name}</span>
        <span className="block truncate font-mono text-xs text-ink-muted">
          {[price, stockOf(product, t)].filter(Boolean).join(' · ')}
        </span>
      </span>
      {inReply ? (
        <span className="flex-none text-xs text-ink-faint">
          {t('inbox.composer.products.added')}
        </span>
      ) : (
        order !== null && (
          <span
            aria-hidden
            className="flex size-5 flex-none items-center justify-center rounded-full bg-active font-medium text-xs text-paper"
          >
            {order}
          </span>
        )
      )}
      {inReply && <Check aria-hidden className="size-4 flex-none text-ink-faint" />}
    </button>
  );
}

type T = ReturnType<typeof useTranslation>['t'];

function priceOf(product: Product, t: T): string | null {
  const prices = product.variants.filter((v) => v.status === 'active').map((v) => v.price_minor);
  if (prices.length === 0) return null;
  const lowest = formatBDT(Math.min(...prices));
  return prices.length > 1 ? t('products.from', { price: lowest }) : lowest;
}

function stockOf(product: Product, t: T): string | null {
  const { stock } = product;
  if (!stock) return product.track_inventory ? null : t('products.notTracked');
  if (stock.state === 'out') return t('products.stockOut');
  return t('products.onHand', { value: formatInteger(stock.on_hand_total) });
}
