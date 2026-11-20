import type { components } from '../api/schema';

type Product = components['schemas']['ProductRead'];

export function activeVariants(product: Product) {
  return product.variants.filter((v) => v.status === 'active');
}

/**
 * The price a list shows for a product: the lowest active price, and the lowest regular price to
 * strike through. The regular price is set only when every active variant has one and it is
 * above the price, so "from" stays honest. `several` says whether to show "from".
 */
export function listPrice(product: Product) {
  const variants = activeVariants(product);
  if (variants.length === 0) return null;
  const lowest = Math.min(...variants.map((v) => v.price_minor));
  const regulars = variants.map((v) => v.compare_at_price_minor);
  const regular = regulars.every((r) => r != null) ? Math.min(...(regulars as number[])) : null;
  return {
    lowest,
    regular: regular !== null && regular > lowest ? regular : null,
    several: variants.length > 1,
  };
}
