import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { components } from '../api/schema';
import { cx, fieldClass } from '../components/ui';
import { formatBDT } from '../i18n/format';
import { variantLabel } from './orderForm';

type Product = components['schemas']['ProductRead'];

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Search active products and pick one variant to add to an order. */
export function VariantPicker({
  onPick,
  onClose,
  initialQuery = '',
}: {
  onPick: (variant: { id: string; productId: string; label: string }) => void;
  onClose: () => void;
  initialQuery?: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);
  const search = useDebounced(query.trim(), 300);

  useEffect(() => {
    let cancelled = false;
    void call(() =>
      api.GET('/v1/products', {
        params: { query: { q: search || undefined, status: 'active', limit: 10 } },
      }),
    ).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setProducts(result.data.items);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [search]);

  return (
    <div className="space-y-2 rounded-md border border-line bg-panel-muted p-3">
      <div className="flex items-center gap-2">
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('orders.form.searchProducts')}
          aria-label={t('orders.form.searchProducts')}
          className={cx('min-w-0 flex-1 py-1.5! text-sm!', fieldClass)}
        />
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-ink-muted underline hover:text-ink"
        >
          {t('orders.form.closePicker')}
        </button>
      </div>
      {failed && (
        <p role="alert" className="text-sm text-danger-ink">
          {t('orders.form.productsFailed')}
        </p>
      )}
      {products?.length === 0 && (
        <p className="text-sm text-ink-faint">{t('orders.form.noProducts')}</p>
      )}
      <ul className="space-y-2">
        {products?.map((product) => {
          const variants = product.variants.filter((v) => v.status === 'active');
          return (
            <li key={product.id} className="text-sm">
              <p className="font-medium text-ink">{product.name}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {variants.map((variant) => {
                  const label = variantLabel(product.name, variant.option_values);
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      aria-label={t('orders.form.addVariant', { label })}
                      onClick={() => onPick({ id: variant.id, productId: product.id, label })}
                      className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs font-medium text-ink hover:border-active hover:bg-accent/10"
                    >
                      {Object.values(variant.option_values).join(' / ') || t('orders.form.default')}
                      {' · '}
                      {formatBDT(variant.price_minor)}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
