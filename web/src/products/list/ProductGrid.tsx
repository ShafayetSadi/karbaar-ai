import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Skeleton, cx } from '../../components/ui';
import type { Product } from '../ProductsPage';
import { ProductChips, ProductThumb } from './cells';
import { QuickPrice } from './QuickPrice';
import { QuickStock } from './QuickStock';
import { shiftKeyOf, type Selection } from './ProductTable';
import { RowMenu } from './RowMenu';

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

/** The photo view: a card per product, for shops that know their products by the picture. */
export function ProductGrid({
  items,
  selection,
  onDuplicate,
  website = false,
}: {
  website?: boolean;
  items: Product[];
  selection: Selection;
  onDuplicate: (product: Product) => void;
}) {
  const { t } = useTranslation();
  const { selected, onSelect } = selection;
  const selecting = selected.size > 0;

  return (
    <ul className={GRID}>
      {items.map((product, index) => {
        const on = selected.has(product.id);
        return (
          <li
            key={product.id}
            className={cx(
              'group relative flex flex-col overflow-hidden rounded-xl border bg-panel motion-safe:transition-shadow hover:shadow-md',
              on ? 'border-active ring-1 ring-active' : 'border-line',
            )}
          >
            <ProductThumb
              sizes="(max-width: 640px) 50vw, 320px"
              product={product}
              className="aspect-square w-full"
            />
            <div className="flex flex-1 flex-col gap-1 p-3">
              {/* The link's box covers the card, so the whole card opens the product. */}
              <Link
                to={`/products/${product.id}`}
                state={{ fromList: true }}
                className="line-clamp-2 text-sm font-medium text-ink after:absolute after:inset-0 focus-visible:outline-none after:focus-visible:outline-2 after:focus-visible:-outline-offset-2 after:focus-visible:outline-active after:rounded-xl"
              >
                {product.name}
              </Link>
              {/* Above the card-wide link, so they open their own popovers. */}
              <span className="relative z-10 self-start">
                <QuickPrice product={product} className="text-sm" />
              </span>
              <span className="relative z-10 self-start">
                <QuickStock product={product} />
              </span>
              <ProductChips product={product} website={website} />
            </div>
            <input
              type="checkbox"
              aria-label={t('products.select', { name: product.name })}
              checked={on}
              onChange={(e) => onSelect(index, e.target.checked, shiftKeyOf(e))}
              className={cx(
                'absolute top-2 left-2 z-10 size-4',
                selecting
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100',
              )}
            />
            <RowMenu product={product} onDuplicate={onDuplicate} card />
          </li>
        );
      })}
    </ul>
  );
}

export function GridSkeleton({ cards = 10 }: { cards?: number }) {
  return (
    <div aria-hidden className={GRID}>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-line bg-panel">
          <Skeleton className="aspect-square w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
