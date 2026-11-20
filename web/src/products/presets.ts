/**
 * Product types are form presets only: they pick which option names are suggested. No pricing,
 * stock or agent rule may read them.
 */
export const PRODUCT_TYPES = [
  'clothing',
  'beauty',
  'food',
  'electronics',
  'jewellery',
  'pre_order_import',
  'books',
  'other',
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

export const DEFAULT_TYPE: ProductType = 'other';

const OPTION_NAMES: Record<ProductType, string[]> = {
  clothing: ['Size', 'Colour'],
  beauty: ['Shade', 'Volume'],
  food: ['Weight'],
  electronics: ['Model', 'Colour'],
  jewellery: ['Model', 'Colour'],
  pre_order_import: ['Size', 'Colour'],
  books: [],
  other: [],
};

/** Option names suggested for a type; the merchant can rename or remove them. */
export function presetOptionNames(type: ProductType): string[] {
  return OPTION_NAMES[type];
}

const FACT_LABELS: Record<ProductType, string[]> = {
  clothing: ['Fabric', 'Fit', 'Care'],
  beauty: ['Brand', 'Origin', 'Expiry', 'Skin type'],
  food: ['Ingredients', 'Expiry'],
  electronics: ['Brand', 'Model', 'Warranty'],
  jewellery: ['Material', 'Plating'],
  pre_order_import: ['Brand', 'Origin'],
  books: ['Author', 'Publisher', 'Edition', 'Language'],
  other: [],
};

/** Fact labels suggested for a type as one-click chips; free text, so the merchant can rename. */
export function presetFactLabels(type: ProductType): string[] {
  return FACT_LABELS[type];
}

/** Size charts come first for types where customers ask "which size?" before anything else. */
export function sizeChartFirst(type: ProductType): boolean {
  return type === 'clothing' || type === 'jewellery';
}
