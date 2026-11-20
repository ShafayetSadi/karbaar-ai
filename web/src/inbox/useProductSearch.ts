import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { call } from '../api/call';
import type { components } from '../api/schema';

export type Product = components['schemas']['ProductRead'];

/**
 * Active products matching `query`, for the composer's pickers. Typing waits a moment so each
 * keystroke is not a search; an answer for an earlier query is dropped.
 */
export function useProductSearch(query: string, images: 'cover' | 'all' = 'cover') {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(
      () => {
        void call(() =>
          api.GET('/v1/products', {
            params: {
              query: { q: query.trim() || null, status: 'active', limit: 20, images },
            },
          }),
        ).then((result) => {
          if (!current) return;
          setFailed(!result.ok);
          if (result.ok) setProducts(result.data.items);
        });
      },
      query ? 250 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, images]);

  return { products, failed };
}
