import type { ChangeEvent, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Skeleton, cx } from '../../components/ui';
import { useMediaQuery } from '../../components/useMediaQuery';
import type { Product } from '../ProductsPage';
import { ProductChips, ProductMeta, ProductThumb } from './cells';
import { QuickPrice } from './QuickPrice';
import { QuickStock } from './QuickStock';
import { RowMenu } from './RowMenu';

export type Selection = {
  selected: ReadonlySet<string>;
  /** `range` is a shift-click: select or clear everything since the last click. */
  onSelect: (index: number, on: boolean, range: boolean) => void;
  onSelectAll: (on: boolean) => void;
};

export function shiftKeyOf(e: ChangeEvent<HTMLInputElement>) {
  // A checkbox's change comes from a click, which says whether Shift was held.
  return 'shiftKey' in e.nativeEvent && e.nativeEvent.shiftKey === true;
}

/**
 * Clicks on these inside a row act on their own, not open the product. So do clicks in a menu or
 * popover opened from the row: React bubbles them through the portal, but they aren't in the row.
 */
function fromControl(e: MouseEvent) {
  const target = e.target as HTMLElement;
  return (
    !e.currentTarget.contains(target) || target.closest('a, button, input, label, select') !== null
  );
}

/** The default view: one dense row per product, easy to scan for price and stock. */
export function ProductTable({
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
  const navigate = useNavigate();
  // Narrow screens fold price and stock under the name instead of giving them columns.
  const wide = useMediaQuery('(min-width: 48rem)');
  const { selected, onSelect, onSelectAll } = selection;
  const all = items.length > 0 && items.every((p) => selected.has(p.id));
  const some = !all && items.some((p) => selected.has(p.id));

  return (
    <table className="w-full overflow-clip rounded-xl border border-line bg-panel text-sm">
      <thead className="sticky top-0 z-10 bg-panel shadow-[inset_0_-1px_0_var(--color-line)]">
        <tr className="text-left font-medium text-xs text-ink-faint">
          <th scope="col" className="w-10 py-2.5 pl-4">
            <input
              type="checkbox"
              aria-label={t('products.selectAll')}
              checked={all}
              ref={(el) => {
                if (el) el.indeterminate = some;
              }}
              onChange={(e) => onSelectAll(e.target.checked)}
            />
          </th>
          <th scope="col" className="px-3 py-2.5 font-medium">
            {t('products.columnProduct')}
          </th>
          {wide && (
            <>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                {t('products.columnPrice')}
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                {t('products.columnStock')}
              </th>
            </>
          )}
          <th scope="col" className="w-12 pr-3">
            <span className="sr-only">{t('products.columnActions')}</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {items.map((product, index) => {
          const on = selected.has(product.id);
          return (
            <tr
              key={product.id}
              onClick={(e) => {
                if (!fromControl(e)) void navigate(`/products/${product.id}`);
              }}
              className={cx(
                'group cursor-pointer motion-safe:transition-colors',
                on
                  ? 'bg-panel-muted shadow-[inset_2px_0_0_var(--color-active)]'
                  : 'hover:bg-panel-muted/60',
              )}
            >
              <td className="py-3 pl-4 align-middle">
                <input
                  type="checkbox"
                  aria-label={t('products.select', { name: product.name })}
                  checked={on}
                  onChange={(e) => onSelect(index, e.target.checked, shiftKeyOf(e))}
                />
              </td>
              {/* max-w-0 stops a long name from widening the table; it truncates instead. */}
              <td className="w-full max-w-0 px-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <ProductThumb product={product} className="size-12 rounded-lg ring-1 ring-line" />
                  <div className="min-w-0 space-y-1">
                    <Link
                      to={`/products/${product.id}`}
                      state={{ fromList: true }}
                      className="block truncate font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-active"
                    >
                      {product.name}
                    </Link>
                    <ProductMeta product={product} />
                    {!wide && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <QuickPrice product={product} className="text-sm" />
                        <QuickStock product={product} />
                      </div>
                    )}
                    <ProductChips product={product} website={website} />
                  </div>
                </div>
              </td>
              {wide && (
                <>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <QuickPrice product={product} />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <QuickStock product={product} />
                  </td>
                </>
              )}
              <td className="pr-3 text-right">
                <RowMenu product={product} onDuplicate={onDuplicate} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Placeholder rows while the first page loads. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden className="divide-y divide-line rounded-xl border border-line bg-panel">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-4" />
          <Skeleton className="size-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-3.5 w-20 max-md:hidden" />
          <Skeleton className="h-3 w-24 max-md:hidden" />
        </div>
      ))}
    </div>
  );
}
