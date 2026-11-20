import { MediaImage } from '../../components/MediaImage';
import { useStableSrc } from '../../components/useStableSrc';
import { ImageOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Chip, cx } from '../../components/ui';
import { formatBDT, formatInteger } from '../../i18n/format';
import { leadTimeRange } from '../availability';
import { activeVariants, listPrice } from '../listPrice';
import type { Product } from '../ProductsPage';

/** The first image's small copy, or a quiet placeholder. `className` sizes it. */
export function ProductThumb({
  product,
  className,
  sizes,
}: {
  product: Product;
  className: string;
  sizes?: string;
}) {
  const image = product.images.find((i) => i.thumbnail_url || i.medium_url || i.url);
  const thumbnail = image?.thumbnail_url ?? image?.url;
  const { src, onError } = useStableSrc(thumbnail);
  if (!src) {
    return (
      <span
        className={cx(
          'flex flex-none items-center justify-center bg-panel-muted text-ink-faint',
          className,
        )}
      >
        <ImageOff aria-hidden className="size-5" />
      </span>
    );
  }
  return (
    <MediaImage
      image={image}
      sizes={sizes}
      src={src}
      onError={onError}
      alt=""
      loading="lazy"
      decoding="async"
      className={cx('flex-none bg-panel-muted object-cover', className)}
    />
  );
}

/** "from ৳1,500", with the regular price struck through when there is an honest one. */
export function PriceText({ product, className }: { product: Product; className?: string }) {
  const { t } = useTranslation();
  const price = listPrice(product);
  if (!price) return null;
  return (
    <span className={cx('font-mono font-medium text-ink tabular-nums', className)}>
      {price.regular !== null && (
        <s className="mr-2 font-normal text-ink-faint">{formatBDT(price.regular)}</s>
      )}
      {price.several
        ? t('products.from', { price: formatBDT(price.lowest) })
        : formatBDT(price.lowest)}
    </span>
  );
}

/** Units on hand across the active variants, and how many variants are sold out. */
export function StockLine({ product, className }: { product: Product; className?: string }) {
  const { t } = useTranslation();
  const { stock } = product;
  if (!stock) {
    return product.track_inventory ? null : (
      <span className={cx('text-xs text-ink-faint', className)}>{t('products.notTracked')}</span>
    );
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 font-mono text-xs tabular-nums',
        stock.state === 'out'
          ? 'text-danger-ink'
          : stock.state === 'low'
            ? 'text-warn-ink'
            : 'text-ink-muted',
        className,
      )}
    >
      <span
        aria-hidden
        className={cx(
          'size-1.5 flex-none rounded-full',
          stock.state === 'out'
            ? 'bg-danger-ink'
            : stock.state === 'low'
              ? 'bg-warn-ink'
              : 'bg-ok-ink',
        )}
      />
      <span>
        {t('products.onHand', { value: formatInteger(stock.on_hand_total) })}
        {stock.variants_out > 0 &&
          stock.active_variants > 1 &&
          ` · ${t('products.variantsOut', { value: formatInteger(stock.variants_out) })}`}
      </span>
    </span>
  );
}

/** What needs the merchant's eye: stock state, availability other than in stock, archived. */
export function ProductChips({ product }: { product: Product }) {
  const { t } = useTranslation();
  const chips = [
    product.status === 'archived' && <Chip key="archived">{t('products.archivedBadge')}</Chip>,
    product.stock?.state === 'out' && (
      <Chip key="out" tone="danger">
        {t('products.stockOut')}
      </Chip>
    ),
    product.stock?.state === 'low' && (
      <Chip key="low" tone="warn">
        {t('products.stockLow')}
      </Chip>
    ),
    product.availability !== 'in_stock' && (
      <Chip key="availability" tone="warn">
        {t(`availability.chip.${product.availability}`, {
          days: leadTimeRange(product.lead_time_days_min, product.lead_time_days_max),
        })}
      </Chip>
    ),
  ].filter(Boolean);
  if (chips.length === 0) return null;
  return <span className="flex flex-wrap gap-1">{chips}</span>;
}

/** "Clothing · 2 variants", the faint line under a product's name. */
export function ProductMeta({ product }: { product: Product }) {
  const { t } = useTranslation();
  const count = activeVariants(product).length;
  return (
    <span className="flex flex-wrap gap-x-1.5 text-xs text-ink-faint">
      {product.product_type !== 'other' && (
        <>
          <span>{t(`productType.${product.product_type}`)}</span>
          <span aria-hidden>·</span>
        </>
      )}
      <span>{t('products.variants', { count })}</span>
    </span>
  );
}
