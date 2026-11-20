import type { components } from '../../api/schema';
import { DELIVERY_OPTIONS, PRODUCTS, minutesAgo } from '../cast';
import { DemoError, notFound, on } from '../router';

// Owner: catalog-agent. Products, variants, stock, categories, collections, delivery options.
// Module-level state: mutations last until the page reloads. Stock only changes through
// `recordStockMovement`, which writes a movement and recomputes the level.

type S = components['schemas'];
type Product = S['ProductRead'];
type Variant = S['VariantRead'];
type Group = S['GroupRead'];
type Movement = S['MovementRead'];
type DeliveryOption = S['DeliveryOptionRead'];
type Image = S['ImageRead'];

const LOW_STOCK_AT = 5;
const DAY = 24 * 60;

// ---------------------------------------------------------------- ids

let idCounter = 1000;
const newId = (kind: string) =>
  `0197a000-0000-7000-9${kind}00-${String((idCounter += 1)).padStart(12, '0')}`;

const bad = (message: string) => new DemoError(422, 'VALIDATION_ERROR', message);

// ---------------------------------------------------------------- images

function coverImage(name: string, hue: number, position = 0): Image {
  const letter = Array.from(name.trim())[0] ?? '?';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">` +
    `<rect width="400" height="400" fill="hsl(${hue} 45% 82%)"/>` +
    `<text x="200" y="250" font-family="sans-serif" font-size="180" font-weight="600" ` +
    `text-anchor="middle" fill="hsl(${hue} 40% 32%)">${letter.replace(/[<>&]/g, '')}</text></svg>`;
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return {
    id: newId('1'),
    media_id: newId('2'),
    position,
    role: 'gallery',
    variant_id: null,
    url,
    thumbnail_url: url,
    medium_url: url,
    large_url: url,
    width: 400,
    height: 400,
    placeholder_color: `hsl(${hue} 45% 82%)`,
  };
}

// ---------------------------------------------------------------- groups

const CATEGORY_IDS = {
  panjabi: '0197a000-0000-7000-8500-000000000001',
  saree: '0197a000-0000-7000-8500-000000000002',
  threePiece: '0197a000-0000-7000-8500-000000000003',
  menswear: '0197a000-0000-7000-8500-000000000004',
  accessories: '0197a000-0000-7000-8500-000000000005',
  beauty: '0197a000-0000-7000-8500-000000000006',
} as const;

const COLLECTION_IDS = {
  eid: '0197a000-0000-7000-8600-000000000001',
  gifts: '0197a000-0000-7000-8600-000000000002',
} as const;

const makeGroup = (id: string, name: string, position: number, aliases: string[]) => ({
  id,
  name,
  position,
  aliases,
  status: 'active',
  created_at: minutesAgo(60 * DAY),
  updated_at: minutesAgo(30 * DAY),
});

type GroupRow = Omit<Group, 'product_count'>;

const categories: GroupRow[] = [
  makeGroup(CATEGORY_IDS.panjabi, 'Panjabi', 0, ['পাঞ্জাবি', 'punjabi']),
  makeGroup(CATEGORY_IDS.saree, 'Saree', 1, ['শাড়ি', 'sari']),
  makeGroup(CATEGORY_IDS.threePiece, 'Three-piece', 2, ['থ্রি-পিস', '3 piece']),
  makeGroup(CATEGORY_IDS.menswear, 'Menswear', 3, []),
  makeGroup(CATEGORY_IDS.accessories, 'Accessories', 4, ['এক্সেসরিজ']),
  makeGroup(CATEGORY_IDS.beauty, 'Beauty', 5, ['বিউটি']),
];

const collections: GroupRow[] = [
  makeGroup(COLLECTION_IDS.eid, 'Eid collection', 0, ['ঈদ কালেকশন', 'eid']),
  makeGroup(COLLECTION_IDS.gifts, 'Gifts under ৳1,000', 1, ['gift']),
];

/** Cast product name -> its category and collections. */
const CATEGORY_OF: Record<string, string> = {
  'Cotton Panjabi': CATEGORY_IDS.panjabi,
  'জামদানি শাড়ি': CATEGORY_IDS.saree,
  'Linen Shirt': CATEGORY_IDS.menswear,
  'থ্রি-পিস (লন)': CATEGORY_IDS.threePiece,
  'Denim Jacket': CATEGORY_IDS.menswear,
  'Silk Scarf': CATEGORY_IDS.accessories,
  'সুতি ওড়না': CATEGORY_IDS.threePiece,
  'Leather Wallet': CATEGORY_IDS.accessories,
  Handbag: CATEGORY_IDS.accessories,
  'Kolhapuri Sandals': CATEGORY_IDS.accessories,
  'Rose Face Cream': CATEGORY_IDS.beauty,
  'মেহেদি কোন': CATEGORY_IDS.beauty,
  'Gold-plated Earrings': CATEGORY_IDS.accessories,
  'Wireless Earbuds': CATEGORY_IDS.accessories,
};

const COLLECTIONS_OF: Record<string, string[]> = {
  'Cotton Panjabi': [COLLECTION_IDS.eid],
  'জামদানি শাড়ি': [COLLECTION_IDS.eid],
  'থ্রি-পিস (লন)': [COLLECTION_IDS.eid],
  'Silk Scarf': [COLLECTION_IDS.eid, COLLECTION_IDS.gifts],
  'সুতি ওড়না': [COLLECTION_IDS.gifts],
  'Leather Wallet': [COLLECTION_IDS.gifts],
  'Rose Face Cream': [COLLECTION_IDS.gifts],
  'মেহেদি কোন': [COLLECTION_IDS.eid, COLLECTION_IDS.gifts],
  'Gold-plated Earrings': [COLLECTION_IDS.eid, COLLECTION_IDS.gifts],
};

// ---------------------------------------------------------------- delivery options

const days = (range: string): [number | null, number | null] => {
  const [min, max] = range.split('-').map(Number);
  return [min ?? null, max ?? min ?? null];
};

const deliveryOptions: DeliveryOption[] = DELIVERY_OPTIONS.map((option, position) => {
  const [min, max] = days(option.days);
  return {
    id: option.id,
    name: option.name,
    fee_minor: option.feeMinor,
    currency: 'BDT',
    delivery_days_min: min,
    delivery_days_max: max,
    is_active: true,
    position,
    zone_hint: position === 0 ? 'inside_dhaka' : 'outside_dhaka',
    created_at: minutesAgo(60 * DAY),
    updated_at: minutesAgo(30 * DAY),
  };
});

// ---------------------------------------------------------------- stock

const onHand = new Map<string, number>();
/** Newest first. */
const movements: Movement[] = [];

/**
 * The only way stock changes: records a movement and recomputes the level. Throws
 * INSUFFICIENT_STOCK rather than going below zero. Exported for the orders handler.
 */
export function recordStockMovement(
  variantId: string,
  delta: number,
  reason: string,
  note: string | null = null,
  orderId: string | null = null,
  actorType = 'user',
): { level: S['LevelRead']; movement: Movement } {
  if (!onHand.has(variantId)) throw notFound('Variant');
  if (!Number.isInteger(delta) || delta === 0) throw bad('Change must be a non-zero whole number.');
  const after = (onHand.get(variantId) ?? 0) + delta;
  if (after < 0) {
    throw new DemoError(409, 'INSUFFICIENT_STOCK', 'Stock cannot go below zero.');
  }
  onHand.set(variantId, after);
  const movement: Movement = {
    id: newId('3'),
    variant_id: variantId,
    delta,
    on_hand_after: after,
    reason,
    note,
    order_id: orderId,
    actor_type: actorType,
    created_at: new Date().toISOString(),
  };
  movements.unshift(movement);
  return { level: { variant_id: variantId, on_hand: after }, movement };
}

// ---------------------------------------------------------------- products

const priceFields = (v: Pick<Variant, 'price_minor' | 'compare_at_price_minor'>) => {
  const regular = v.compare_at_price_minor;
  if (regular && regular > v.price_minor) {
    return {
      discount_minor: regular - v.price_minor,
      discount_percent: Math.round(((regular - v.price_minor) / regular) * 100),
    };
  }
  return { discount_minor: null, discount_percent: null };
};

function makeVariant(
  input: Partial<S['VariantInput']> & { price_minor: number },
  sku: string,
): Variant {
  const variant: Variant = {
    id: newId('4'),
    sku: input.sku || sku,
    option_values: input.option_values ?? {},
    price_minor: input.price_minor,
    compare_at_price_minor: input.compare_at_price_minor ?? null,
    currency: 'BDT',
    price_tiers: [...(input.price_tiers ?? [])].sort((a, b) => a.min_quantity - b.min_quantity),
    weight_grams: input.weight_grams ?? null,
    length_mm: input.length_mm ?? null,
    width_mm: input.width_mm ?? null,
    height_mm: input.height_mm ?? null,
    status: 'active',
  };
  return Object.assign(variant, priceFields(variant));
}

const allDeliveryIds = () => deliveryOptions.map((o) => o.id);

const products: Product[] = PRODUCTS.map((cast, index) => {
  const created = minutesAgo(DAY * (2 + index * 2));
  const variants = cast.variants.map((v): Variant => {
    onHand.set(v.id, v.stock);
    return {
      id: v.id,
      sku: v.sku,
      option_values: { ...v.options },
      price_minor: cast.priceMinor,
      compare_at_price_minor: null,
      currency: 'BDT',
      price_tiers: [],
      weight_grams: null,
      length_mm: null,
      width_mm: null,
      height_mm: null,
      status: 'active',
      discount_minor: null,
      discount_percent: null,
    };
  });
  return {
    id: cast.id,
    name: cast.name,
    description: cast.description,
    product_type: cast.productType,
    aliases: [...cast.aliases],
    attributes: [],
    availability: 'in_stock',
    advance_policy: 'inherit',
    advance_fixed_minor: null,
    lead_time_days_min: null,
    lead_time_days_max: null,
    ready_window: null,
    min_order_quantity: 1,
    max_order_quantity: null,
    category_id: CATEGORY_OF[cast.name] ?? null,
    collection_ids: [...(COLLECTIONS_OF[cast.name] ?? [])],
    delivery_option_ids: allDeliveryIds(),
    images: [coverImage(cast.name, (index * 47 + 12) % 360)],
    post_links: [],
    size_chart: [],
    show_on_storefront: true,
    status: 'active',
    track_inventory: true,
    stock: null,
    variants,
    visual_terms: [],
    created_at: created,
    updated_at: created,
  };
});

// A little realistic variety on top of the cast's id/price/stock.
function seedExtras() {
  const byName = (name: string) => products.find((p) => p.name === name);
  const scarf = byName('Silk Scarf');
  scarf?.variants.forEach((v) => Object.assign(v, { compare_at_price_minor: 110000 }, priceFields({ price_minor: v.price_minor, compare_at_price_minor: 110000 })));
  byName('মেহেদি কোন')?.variants.forEach((v) => {
    v.price_tiers = [
      { min_quantity: 6, unit_price_minor: 13500 },
      { min_quantity: 12, unit_price_minor: 12000 },
    ];
  });
  const panjabi = byName('Cotton Panjabi');
  if (panjabi) {
    panjabi.visual_terms = ['embroidered collar', 'cotton'];
    panjabi.size_chart = [
      { size: 'M', chest_in: { min: '38', max: '40' }, height_cm: { min: 165, max: 172 }, measurements: [] },
      { size: 'L', chest_in: { min: '40', max: '42' }, height_cm: { min: 170, max: 178 }, measurements: [] },
      { size: 'XL', chest_in: { min: '42', max: '44' }, height_cm: { min: 175, max: 184 }, measurements: [] },
    ];
  }
  const jamdani = byName('জামদানি শাড়ি');
  if (jamdani) {
    jamdani.availability = 'made_to_order';
    jamdani.lead_time_days_min = 7;
    jamdani.lead_time_days_max = 14;
    jamdani.post_links = [
      { id: newId('5'), kind: 'post', external_id: '100000000000001_900000000000001', permalink: null },
    ];
  }
}
seedExtras();

// Opening stock for every variant that starts with some.
for (const product of products) {
  for (const v of product.variants) {
    const level = onHand.get(v.id) ?? 0;
    if (level > 0) {
      movements.push({
        id: newId('3'),
        variant_id: v.id,
        delta: level,
        on_hand_after: level,
        reason: 'initial',
        note: null,
        order_id: null,
        actor_type: 'user',
        created_at: minutesAgo(DAY * 20),
      });
    }
  }
}
movements.sort((a, b) => b.created_at.localeCompare(a.created_at));

function stockOf(p: Product): Product['stock'] {
  if (!p.track_inventory) return null;
  const active = p.variants.filter((v) => v.status === 'active');
  const levels = active.map((v) => onHand.get(v.id) ?? 0);
  const total = levels.reduce((a, b) => a + b, 0);
  const out = levels.filter((n) => n <= 0).length;
  const state = active.length > 0 && total <= 0 ? 'out' : levels.some((n) => n <= LOW_STOCK_AT) ? 'low' : 'ok';
  return { active_variants: active.length, on_hand_total: total, variants_out: out, state };
}

const live = (p: Product): Product => structuredClone({ ...p, stock: stockOf(p) });

/** Contract for other handler files: the live product list (mutations show up here). */
export function allProducts(): Product[] {
  return products.map(live);
}

function find(id: string | undefined): Product {
  const product = products.find((p) => p.id === id);
  if (!product) throw notFound('Product');
  return product;
}

function findVariant(product: Product, variantId: string | undefined): Variant {
  const variant = product.variants.find((v) => v.id === variantId);
  if (!variant) throw notFound('Variant');
  return variant;
}

const touch = (p: Product) => {
  p.updated_at = new Date().toISOString();
  return live(p);
};

function productMatches(p: Product, query: URLSearchParams, withSearch: boolean): boolean {
  const status = query.get('status') ?? 'active';
  if (status !== 'all' && p.status !== status) return false;
  const type = query.get('product_type');
  if (type && p.product_type !== type) return false;
  const availability = query.get('availability');
  if (availability && p.availability !== availability) return false;
  const category = query.get('category_id');
  if (category && p.category_id !== category) return false;
  const collection = query.get('collection_id');
  if (collection && !p.collection_ids.includes(collection)) return false;
  if (!withSearch) return true;
  const stock = query.get('stock');
  if (stock && stockOf(p)?.state !== stock) return false;
  const q = (query.get('q') ?? '').trim().toLowerCase();
  if (q) {
    const haystack = [
      p.name,
      p.description ?? '',
      ...p.aliases,
      ...p.variants.flatMap((v) => [v.sku ?? '', ...Object.values(v.option_values)]),
    ]
      .join(' ')
      .toLowerCase();
    if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
  }
  return true;
}

on('get', '/v1/products', ({ query }) => {
  const matched = products.filter((p) => productMatches(p, query, true));
  if (query.get('sort') === 'stock') {
    matched.sort((a, b) => (stockOf(a)?.on_hand_total ?? Infinity) - (stockOf(b)?.on_hand_total ?? Infinity));
  } else {
    matched.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const limit = Math.min(Math.max(Number(query.get('limit')) || 20, 1), 100);
  const start = Math.max(Number(query.get('cursor')) || 0, 0);
  const page = matched.slice(start, start + limit).map(live);
  if (query.get('images') === 'cover') {
    for (const p of page) p.images = p.images.slice(0, 1);
  }
  const next = start + limit;
  return { items: page, next_cursor: next < matched.length ? String(next) : null };
});

on('get', '/v1/products/stock-counts', ({ query }) => {
  const matched = products.filter((p) => productMatches(p, query, false));
  const states = matched.map((p) => stockOf(p)?.state);
  return {
    out_of_stock: states.filter((s) => s === 'out').length,
    low_stock: states.filter((s) => s === 'low').length,
  };
});

on('get', '/v1/products/{product_id}', ({ params }) => live(find(params.product_id)));

on('post', '/v1/products', ({ body }) => {
  const name = body.name?.trim();
  if (!name) throw bad('Name is required.');
  if (!body.variants?.length) throw bad('Add at least one variant.');
  if (body.category_id && !categories.some((c) => c.id === body.category_id)) throw notFound('Category');
  const now = new Date().toISOString();
  const serial = String(products.length + 1).padStart(4, '0');
  const product: Product = {
    id: newId('0'),
    name,
    description: body.description ?? null,
    product_type: body.product_type,
    aliases: body.aliases ?? [],
    attributes: body.attributes ?? [],
    availability: body.availability,
    advance_policy: body.advance_policy,
    advance_fixed_minor: body.advance_fixed_minor ?? null,
    lead_time_days_min: body.lead_time_days_min ?? null,
    lead_time_days_max: body.lead_time_days_max ?? null,
    ready_window: null,
    min_order_quantity: body.min_order_quantity,
    max_order_quantity: body.max_order_quantity ?? null,
    category_id: body.category_id ?? null,
    collection_ids: [],
    delivery_option_ids: allDeliveryIds(),
    images: [],
    post_links: [],
    size_chart: [],
    show_on_storefront: true,
    status: 'active',
    track_inventory: body.track_inventory ?? body.availability === 'in_stock',
    stock: null,
    variants: [],
    visual_terms: [],
    created_at: now,
    updated_at: now,
  };
  body.variants.forEach((input, i) => {
    const variant = makeVariant(input, `NG-${serial}-${i + 1}`);
    product.variants.push(variant);
    onHand.set(variant.id, 0);
  });
  products.push(product);
  product.variants.forEach((variant, i) => {
    const initial = body.variants[i]?.initial_stock ?? 0;
    if (initial > 0) recordStockMovement(variant.id, initial, 'initial');
  });
  return live(product);
});

on('patch', '/v1/products/{product_id}', ({ params, body }) => {
  const p = find(params.product_id);
  if (body.name !== undefined && body.name !== null) {
    if (!body.name.trim()) throw bad('Name is required.');
    p.name = body.name.trim();
  }
  if (body.description !== undefined) p.description = body.description;
  if (body.aliases != null) p.aliases = body.aliases;
  if (body.attributes != null) p.attributes = body.attributes;
  if (body.availability != null) p.availability = body.availability;
  if (body.advance_policy != null) p.advance_policy = body.advance_policy;
  if (body.advance_fixed_minor !== undefined) p.advance_fixed_minor = body.advance_fixed_minor;
  if (body.category_id !== undefined) {
    if (body.category_id && !categories.some((c) => c.id === body.category_id)) throw notFound('Category');
    p.category_id = body.category_id;
  }
  if (body.lead_time_days_min !== undefined) p.lead_time_days_min = body.lead_time_days_min;
  if (body.lead_time_days_max !== undefined) p.lead_time_days_max = body.lead_time_days_max;
  if (body.min_order_quantity != null) p.min_order_quantity = body.min_order_quantity;
  if (body.max_order_quantity !== undefined) p.max_order_quantity = body.max_order_quantity;
  if (body.product_type != null) p.product_type = body.product_type;
  if (body.status != null) p.status = body.status;
  if (body.track_inventory != null) p.track_inventory = body.track_inventory;
  return touch(p);
});

on('delete', '/v1/products/{product_id}', ({ params }) => {
  const p = find(params.product_id);
  products.splice(products.indexOf(p), 1);
  return null;
});

on('post', '/v1/products/{product_id}/duplicate', ({ params }) => {
  const source = find(params.product_id);
  const now = new Date().toISOString();
  const copy: Product = {
    ...structuredClone(source),
    id: newId('0'),
    name: `${source.name} (copy)`,
    status: 'active',
    post_links: [],
    created_at: now,
    updated_at: now,
  };
  const serial = String(products.length + 1).padStart(4, '0');
  copy.variants = source.variants.map((v, i) => {
    const variant = { ...structuredClone(v), id: newId('4'), sku: `NG-${serial}-${i + 1}` };
    onHand.set(variant.id, 0);
    return variant;
  });
  copy.images = source.images.map((img) => ({ ...img, id: newId('1') }));
  products.push(copy);
  return live(copy);
});

on('post', '/v1/products/bulk', ({ body }) => {
  const selected = body.product_ids.map((id) => find(id));
  for (const p of selected) {
    switch (body.action) {
      case 'archive':
        p.status = 'archived';
        break;
      case 'unarchive':
        p.status = 'active';
        break;
      case 'set_category':
        if (body.category_id && !categories.some((c) => c.id === body.category_id)) throw notFound('Category');
        p.category_id = body.category_id ?? null;
        break;
      case 'add_to_collection':
        if (!collections.some((c) => c.id === body.collection_id)) throw notFound('Collection');
        if (body.collection_id && !p.collection_ids.includes(body.collection_id)) {
          p.collection_ids.push(body.collection_id);
        }
        break;
      case 'remove_from_collection':
        p.collection_ids = p.collection_ids.filter((id) => id !== body.collection_id);
        break;
      case 'set_availability':
        if (!body.availability) throw bad('Choose an availability.');
        p.availability = body.availability;
        p.lead_time_days_min = body.lead_time_days_min ?? null;
        p.lead_time_days_max = body.lead_time_days_max ?? null;
        break;
    }
    p.updated_at = new Date().toISOString();
  }
  return { updated: selected.length };
});

on('post', '/v1/products/bulk-price', ({ body }) => {
  const { change } = body;
  const lines: S['PriceLineRead'][] = [];
  for (const id of body.product_ids) {
    const p = find(id);
    for (const v of p.variants.filter((x) => x.status === 'active')) {
      const old = v.price_minor;
      const raw =
        change.mode === 'set'
          ? change.amount_minor
          : change.mode === 'amount'
            ? old + change.amount_minor
            : Math.round(old * (1 + Number(change.percent) / 100));
      const next = Math.round(raw);
      const regular = body.keep_old_as_regular && next < old ? old : v.compare_at_price_minor;
      const label = Object.values(v.option_values).join(' / ');
      lines.push({
        product_id: p.id,
        product_name: p.name,
        variant_id: v.id,
        label,
        old_price_minor: old,
        new_price_minor: next,
        old_regular_minor: v.compare_at_price_minor,
        new_regular_minor: regular,
        problem: next <= 0 ? 'The new price must be above zero.' : null,
      });
    }
  }
  const applied = !body.preview && lines.every((l) => !l.problem);
  if (applied) {
    for (const line of lines) {
      const p = find(line.product_id);
      const v = findVariant(p, line.variant_id);
      v.price_minor = line.new_price_minor;
      v.compare_at_price_minor = line.new_regular_minor;
      Object.assign(v, priceFields(v));
      p.updated_at = new Date().toISOString();
    }
  }
  return { applied, lines };
});

// ---------------------------------------------------------------- variants

on('post', '/v1/products/{product_id}/variants', ({ params, body }) => {
  const p = find(params.product_id);
  const serial = String(products.indexOf(p) + 1).padStart(4, '0');
  const variant = makeVariant(body, `NG-${serial}-${p.variants.length + 1}`);
  p.variants.push(variant);
  onHand.set(variant.id, 0);
  if ((body.initial_stock ?? 0) > 0) recordStockMovement(variant.id, body.initial_stock ?? 0, 'initial');
  return touch(p);
});

on('patch', '/v1/products/{product_id}/variants/{variant_id}', ({ params, body }) => {
  const p = find(params.product_id);
  const v = findVariant(p, params.variant_id);
  if (body.price_minor != null) {
    if (body.price_minor < 0) throw bad('Price cannot be negative.');
    v.price_minor = body.price_minor;
  }
  if (body.compare_at_price_minor !== undefined) v.compare_at_price_minor = body.compare_at_price_minor;
  if (body.option_values != null) v.option_values = body.option_values;
  if (body.price_tiers != null) {
    v.price_tiers = [...body.price_tiers].sort((a, b) => a.min_quantity - b.min_quantity);
  }
  if (body.sku !== undefined) v.sku = body.sku;
  if (body.status != null) v.status = body.status;
  if (body.weight_grams !== undefined) v.weight_grams = body.weight_grams;
  if (body.length_mm !== undefined) v.length_mm = body.length_mm;
  if (body.width_mm !== undefined) v.width_mm = body.width_mm;
  if (body.height_mm !== undefined) v.height_mm = body.height_mm;
  Object.assign(v, priceFields(v));
  return touch(p);
});

on('post', '/v1/products/{product_id}/rename-option', ({ params, body }) => {
  const p = find(params.product_id);
  const next = body.new_name.trim();
  if (!next) throw bad('Option name is required.');
  for (const v of p.variants) {
    if (body.old_name in v.option_values) {
      v.option_values = Object.fromEntries(
        Object.entries(v.option_values).map(([k, val]) => [k === body.old_name ? next : k, val]),
      );
    }
  }
  return touch(p);
});

// ---------------------------------------------------------------- tiers, size chart, delivery

on('put', '/v1/products/{product_id}/price-tiers', ({ params, body }) => {
  const p = find(params.product_id);
  const tiers = [...body.tiers].sort((a, b) => a.min_quantity - b.min_quantity);
  for (const v of p.variants) v.price_tiers = tiers.map((t) => ({ ...t }));
  return touch(p);
});

on('put', '/v1/products/{product_id}/variants/{variant_id}/price-tiers', ({ params, body }) => {
  const p = find(params.product_id);
  findVariant(p, params.variant_id).price_tiers = [...body.tiers].sort(
    (a, b) => a.min_quantity - b.min_quantity,
  );
  return touch(p);
});

on('put', '/v1/products/{product_id}/size-chart', ({ params, body }) => {
  const p = find(params.product_id);
  p.size_chart = body.rows.map((row) => ({
    size: row.size,
    chest_in: row.chest_in ? { min: String(row.chest_in.min), max: String(row.chest_in.max) } : null,
    height_cm: row.height_cm ?? null,
    weight_kg: row.weight_kg ?? null,
    measurements: (row.measurements ?? []).map((m) => ({
      label: m.label,
      unit: m.unit,
      value: String(m.value),
    })),
  }));
  return touch(p);
});

on('put', '/v1/products/{product_id}/delivery-options', ({ params, body }) => {
  const p = find(params.product_id);
  for (const id of body.delivery_option_ids) {
    if (!deliveryOptions.some((o) => o.id === id)) throw notFound('Delivery option');
  }
  p.delivery_option_ids = [...body.delivery_option_ids];
  return touch(p);
});

// ---------------------------------------------------------------- images, post links, terms

on('post', '/v1/products/{product_id}/images', ({ params, body }) => {
  const p = find(params.product_id);
  const image = coverImage(p.name, (p.images.length * 53 + 200) % 360, p.images.length);
  image.media_id = body.media_id;
  image.role = body.role;
  image.variant_id = body.variant_id ?? null;
  p.images.push(image);
  return touch(p);
});

on('delete', '/v1/products/{product_id}/images/{image_id}', ({ params }) => {
  const p = find(params.product_id);
  if (!p.images.some((i) => i.id === params.image_id)) throw notFound('Image');
  p.images = p.images.filter((i) => i.id !== params.image_id).map((i, position) => ({ ...i, position }));
  return touch(p);
});

on('post', '/v1/products/{product_id}/post-links', ({ params, body }) => {
  const p = find(params.product_id);
  const externalId = body.external_id.trim();
  if (!externalId) throw bad('Post id is required.');
  if (p.post_links.some((l) => l.external_id === externalId)) {
    throw new DemoError(409, 'CONFLICT', 'This post is already linked.');
  }
  p.post_links.push({
    id: newId('5'),
    kind: body.kind,
    external_id: externalId,
    permalink: body.permalink ?? null,
  });
  return touch(p);
});

on('delete', '/v1/products/{product_id}/post-links/{link_id}', ({ params }) => {
  const p = find(params.product_id);
  if (!p.post_links.some((l) => l.id === params.link_id)) throw notFound('Post link');
  p.post_links = p.post_links.filter((l) => l.id !== params.link_id);
  return touch(p);
});

on('post', '/v1/products/{product_id}/visual-terms/hide', ({ params, body }) => {
  const p = find(params.product_id);
  p.visual_terms = (p.visual_terms ?? []).filter((t) => t !== body.term);
  return touch(p);
});

// ---------------------------------------------------------------- categories, collections

const withCounts = (rows: GroupRow[], countOf: (id: string) => number): Group[] =>
  rows.map((row) => ({ ...row, product_count: countOf(row.id) }));

const groupList = (rows: GroupRow[], query: URLSearchParams, countOf: (id: string) => number) => {
  const status = query.get('status') ?? 'active';
  const items = withCounts(rows, countOf).filter((g) => status === 'all' || g.status === status);
  return { items: items.sort((a, b) => a.position - b.position) };
};

on('get', '/v1/categories', ({ query }) =>
  groupList(categories, query, (id) => products.filter((p) => p.status === 'active' && p.category_id === id).length),
);

on('get', '/v1/collections', ({ query }) =>
  groupList(
    collections,
    query,
    (id) => products.filter((p) => p.status === 'active' && p.collection_ids.includes(id)).length,
  ),
);

// ---------------------------------------------------------------- inventory

on('get', '/v1/inventory/levels', ({ query }) => ({
  items: query.getAll('variant_id').map((id) => {
    if (!onHand.has(id)) throw notFound('Variant');
    return { variant_id: id, on_hand: onHand.get(id) ?? 0 };
  }),
}));

on('get', '/v1/inventory/movements', ({ query }) => {
  const variant = query.get('variant_id');
  const matched = movements.filter((m) => !variant || m.variant_id === variant);
  const limit = Math.min(Math.max(Number(query.get('limit')) || 20, 1), 100);
  const start = Math.max(Number(query.get('cursor')) || 0, 0);
  const next = start + limit;
  return {
    items: matched.slice(start, next).map((m) => ({ ...m })),
    next_cursor: next < matched.length ? String(next) : null,
  };
});

on('post', '/v1/inventory/variants/{variant_id}/adjust', ({ params, body }) =>
  recordStockMovement(params.variant_id ?? '', body.delta, body.reason, body.note ?? null),
);

on('post', '/v1/inventory/adjustments', ({ body }) => {
  if (body.items.length === 0) throw bad('Nothing to adjust.');
  // All or nothing: check every variant's running total before writing any movement.
  const running = new Map<string, number>();
  for (const item of body.items) {
    if (!onHand.has(item.variant_id)) throw notFound('Variant');
    if (!Number.isInteger(item.delta) || item.delta === 0) throw bad('Change must be a non-zero whole number.');
    const next = (running.get(item.variant_id) ?? onHand.get(item.variant_id) ?? 0) + item.delta;
    if (next < 0) throw new DemoError(409, 'INSUFFICIENT_STOCK', 'Stock cannot go below zero.');
    running.set(item.variant_id, next);
  }
  const done = body.items.map((item) =>
    recordStockMovement(item.variant_id, item.delta, 'manual_adjust', body.note ?? null),
  );
  return { levels: done.map((d) => d.level), movements: done.map((d) => d.movement) };
});

// ---------------------------------------------------------------- delivery options

on('get', '/v1/delivery/options', ({ query }) => ({
  items: deliveryOptions
    .filter((o) => query.get('active_only') !== 'true' || o.is_active)
    .sort((a, b) => a.position - b.position)
    .map((o) => ({ ...o })),
}));

on('get', '/v1/delivery/options/allowed', ({ query }) => {
  const variantIds = query.getAll('variant_id');
  const owners = variantIds.map((id) => {
    const owner = products.find((p) => p.variants.some((v) => v.id === id));
    if (!owner) throw notFound('Variant');
    return owner;
  });
  const allowed = deliveryOptions
    .filter((o) => o.is_active && owners.every((p) => p.delivery_option_ids.includes(o.id)))
    .map((o) => o.id);
  return { allowed_delivery_option_ids: allowed };
});

on('post', '/v1/delivery/options', ({ body }) => {
  const name = body.name.trim();
  if (!name) throw bad('Name is required.');
  if (body.fee_minor < 0) throw bad('Fee cannot be negative.');
  const now = new Date().toISOString();
  const option: DeliveryOption = {
    id: newId('6'),
    name,
    fee_minor: body.fee_minor,
    currency: 'BDT',
    delivery_days_min: body.delivery_days_min ?? null,
    delivery_days_max: body.delivery_days_max ?? null,
    is_active: true,
    position: deliveryOptions.length,
    zone_hint: body.zone_hint ?? null,
    created_at: now,
    updated_at: now,
  };
  deliveryOptions.push(option);
  return { ...option };
});

on('patch', '/v1/delivery/options/{option_id}', ({ params, body }) => {
  const option = deliveryOptions.find((o) => o.id === params.option_id);
  if (!option) throw notFound('Delivery option');
  if (body.name != null) {
    if (!body.name.trim()) throw bad('Name is required.');
    option.name = body.name.trim();
  }
  if (body.fee_minor != null) {
    if (body.fee_minor < 0) throw bad('Fee cannot be negative.');
    option.fee_minor = body.fee_minor;
  }
  if (body.delivery_days_min !== undefined) option.delivery_days_min = body.delivery_days_min;
  if (body.delivery_days_max !== undefined) option.delivery_days_max = body.delivery_days_max;
  if (body.is_active != null) option.is_active = body.is_active;
  if (body.position != null) option.position = body.position;
  if (body.zone_hint !== undefined) option.zone_hint = body.zone_hint;
  option.updated_at = new Date().toISOString();
  return { ...option };
});

// ---------------------------------------------------------------- media

const UPLOAD_UNAVAILABLE = 'Image upload is not available in the demo.';

on('post', '/v1/media/uploads', () => {
  throw new DemoError(501, 'DEMO_UNAVAILABLE', UPLOAD_UNAVAILABLE);
});

on('post', '/v1/media/{media_id}/complete', () => {
  throw new DemoError(501, 'DEMO_UNAVAILABLE', UPLOAD_UNAVAILABLE);
});
