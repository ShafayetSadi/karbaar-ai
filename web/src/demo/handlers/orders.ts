import type { components } from '../../api/schema';
import { dhakaDay, dhakaTime } from '../../i18n/format';
import {
  CUSTOMERS,
  DELIVERY_OPTIONS,
  PRODUCTS,
  conversationIdOf,
  minutesAgo,
  type CastCustomer,
  type CastProduct,
  type CastVariant,
} from '../cast';
import { DemoError, notFound, on } from '../router';

// Owner: orders-agent. Orders, quotes, shipments, order counts, analytics, address areas.
// Orders live in `orders`, newest first. Every total is computed from its lines by `price()`.

type Order = components['schemas']['OrderRead'];
type OrderStatus = Order['status'];
type Action = Order['allowed_actions'][number];
type Confirmation = NonNullable<Order['confirmation']>;
type Source = 'messenger' | 'dashboard' | 'storefront' | 'web_chat';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const CURRENCY = 'BDT' as const;

const iso = (ms: number) => new Date(ms).toISOString();
const addMin = (isoTime: string, minutes: number) =>
  iso(Math.min(Date.now(), new Date(isoTime).getTime() + minutes * MIN));

// ---------------------------------------------------------------- catalog lookups

const variantIndex = new Map<string, { product: CastProduct; variant: CastVariant }>();
for (const product of PRODUCTS)
  for (const variant of product.variants) variantIndex.set(variant.id, { product, variant });

/** The variant of `name` whose options include every entry of `options`. */
function pick(name: string, options: Record<string, string> = {}): CastVariant {
  const product = PRODUCTS.find((p) => p.name === name);
  const variant = product?.variants.find((v) =>
    Object.entries(options).every(([k, value]) => v.options[k] === value),
  );
  if (!variant) throw new Error(`demo: no variant ${name} ${JSON.stringify(options)}`);
  return variant;
}

const variantLabel = (variant: CastVariant) => Object.values(variant.options).join(' / ');

// ---------------------------------------------------------------- money

interface Line {
  variantId: string;
  quantity: number;
}

function deliveryFor(optionId: string) {
  const option = DELIVERY_OPTIONS.find((o) => o.id === optionId);
  if (!option) throw new DemoError(422, 'VALIDATION_ERROR', 'Unknown delivery option.');
  return option;
}

const deliveryForDistrict = (district: string | null | undefined) =>
  district?.trim().toLowerCase() === 'dhaka' ? DELIVERY_OPTIONS[0] : DELIVERY_OPTIONS[1];

function priceLines(lines: Line[]): { items: Order['items']; subtotal: number } {
  if (lines.length === 0) throw new DemoError(422, 'VALIDATION_ERROR', 'Add at least one item.');
  const items = lines.map((line): Order['items'][number] => {
    const found = variantIndex.get(line.variantId);
    if (!found) throw new DemoError(422, 'VALIDATION_ERROR', 'Unknown product variant.');
    if (!Number.isInteger(line.quantity) || line.quantity < 1)
      throw new DemoError(422, 'VALIDATION_ERROR', 'Quantity must be at least 1.');
    return {
      availability: 'in_stock',
      lead_time_days_max: null,
      lead_time_days_min: null,
      line_total_minor: found.product.priceMinor * line.quantity,
      list_price_minor: found.product.priceMinor,
      product_name: found.product.name,
      quantity: line.quantity,
      tier_min_quantity: null,
      unit_price_minor: found.product.priceMinor,
      variant_id: found.variant.id,
      variant_label: variantLabel(found.variant),
    };
  });
  return { items, subtotal: items.reduce((sum, item) => sum + item.line_total_minor, 0) };
}

// ---------------------------------------------------------------- order store

let orderSeq = 1000;
let idSeq = 0;
const nextId = () => `0197a000-0000-7000-8500-${String(++idSeq).padStart(12, '0')}`;

const orders: Order[] = [];

interface Spec {
  customer: CastCustomer;
  lines: Line[];
  status: OrderStatus;
  minutes: number;
  source: Source;
  advanceMinor?: number;
  discountMinor?: number;
  note?: string;
  cancelReason?: string;
  returnReceived?: boolean;
  confirmation?: Confirmation['status'];
  needsCall?: boolean;
}

function allowedActions(order: Pick<Order, 'status' | 'advance' | 'return_received_at'>): Action[] {
  const noAdvance = order.advance.received_minor === 0;
  switch (order.status) {
    case 'pending':
      return noAdvance ? ['confirm', 'cancel', 'record_advance'] : ['confirm', 'cancel'];
    case 'confirmed':
      return noAdvance ? ['mark_shipped', 'cancel', 'record_advance'] : ['mark_shipped', 'cancel'];
    case 'shipped':
      return ['mark_delivered', 'mark_returned'];
    case 'returned':
      return order.return_received_at ? [] : ['receive_return'];
    default:
      return [];
  }
}

const recordOf = (customerId: string): NonNullable<Order['customer_record']> => {
  const mine = orders.filter((o) => o.customer_id === customerId);
  const count = (status: OrderStatus) => mine.filter((o) => o.status === status).length;
  return {
    cancelled: count('cancelled'),
    delivered: count('delivered'),
    in_progress: mine.filter((o) => ['pending', 'confirmed', 'shipped'].includes(o.status)).length,
    partial: mine.filter((o) => o.is_partial_delivery).length,
    returned: count('returned'),
  };
};

function finish(order: Order): Order {
  order.allowed_actions = allowedActions(order);
  order.cod_amount_minor = Math.max(0, order.total_minor - order.advance.received_minor);
  order.updated_at = new Date().toISOString();
  return order;
}

function build(spec: Spec): Order {
  const { customer } = spec;
  const { items, subtotal } = priceLines(spec.lines);
  const delivery = deliveryForDistrict(customer.district);
  const discount = spec.discountMinor ?? 0;
  const total = subtotal + delivery.feeMinor - discount;
  const advance = spec.advanceMinor ?? 0;
  const created = minutesAgo(spec.minutes);
  const reached = (statuses: OrderStatus[]) => statuses.includes(spec.status);
  const confirmed = reached(['confirmed', 'shipped', 'delivered', 'returned']);
  const shipped = reached(['shipped', 'delivered', 'returned']);
  orderSeq += 1;
  const order: Order = {
    advance: {
      method: advance > 0 ? 'bkash' : null,
      received_at: advance > 0 ? addMin(created, 10) : null,
      received_minor: advance,
      reference: advance > 0 ? `DEMO${orderSeq}TX` : null,
      required_minor: advance,
    },
    allowed_actions: [],
    cancel_reason: spec.status === 'cancelled' ? (spec.cancelReason ?? 'Cancelled by shop') : null,
    cancelled_at: spec.status === 'cancelled' ? addMin(created, 90) : null,
    cod_amount_minor: 0,
    collected_amount_minor: spec.status === 'delivered' ? total - advance : null,
    confirmation: spec.confirmation
      ? {
          needs_call_at: spec.needsCall ? addMin(created, 60) : null,
          needs_call_reason: spec.needsCall ? 'no_response' : null,
          reminded_at: null,
          requested_at: created,
          resolved_at: null,
          status: spec.needsCall ? 'needs_call' : spec.confirmation,
        }
      : null,
    confirmed_at: confirmed ? addMin(created, 25) : null,
    conversation_id: spec.source === 'messenger' ? conversationIdOf(customer.id) : null,
    coupon_code: null,
    created_at: created,
    created_by_user_id: null,
    credit: spec.source === 'messenger' ? 'agent' : spec.source === 'storefront' ? 'storefront' : 'team',
    currency: CURRENCY,
    customer: {
      address: {
        area: customer.area,
        district: customer.district,
        line: customer.addressLine,
        raw_text: `${customer.addressLine}, ${customer.area}, ${customer.district}`,
      },
      name: customer.name,
      phone: customer.phone,
    },
    customer_id: customer.id,
    customer_note: spec.note ?? null,
    customer_record: null,
    delivered_at: spec.status === 'delivered' ? addMin(created, 3 * 24 * 60) : null,
    delivery: { fee_minor: delivery.feeMinor, name: delivery.name, option_id: delivery.id },
    discount_minor: discount,
    id: nextId(),
    is_partial_delivery: false,
    items,
    notes: null,
    number: orderSeq,
    outcome_source: shipped ? 'merchant' : null,
    payment_method: advance > 0 ? 'bkash_advance_cod' : 'cod',
    phone_verified_at: spec.source === 'dashboard' ? null : addMin(created, 2),
    processing_at: null,
    ready_by: confirmed && !shipped ? dhakaDay(new Date(created).getTime() + 3 * DAY) : null,
    return_condition: spec.status === 'returned' && spec.returnReceived ? 'good' : null,
    return_received_at: spec.status === 'returned' && spec.returnReceived ? addMin(created, 8 * 24 * 60) : null,
    returned_at: spec.status === 'returned' ? addMin(created, 6 * 24 * 60) : null,
    savings_minor: discount,
    shipment: null,
    shipped_at: shipped ? addMin(created, 24 * 60) : null,
    shipped_source: shipped ? 'merchant' : null,
    shipping_notifications: [],
    source: spec.source,
    status: spec.status,
    subtotal_minor: subtotal,
    total_minor: total,
    updated_at: created,
  };
  return finish(order);
}

const [nusrat, tanvir, sumaiya, mahmudul, raisa, arif, sadia, imran] = CUSTOMERS as [
  CastCustomer, CastCustomer, CastCustomer, CastCustomer, CastCustomer, CastCustomer, CastCustomer, CastCustomer,
];
const h = (hours: number) => hours * 60;
const d = (days: number) => days * 24 * 60;
const line = (variant: CastVariant, quantity = 1): Line => ({ variantId: variant.id, quantity });

const SEED: Spec[] = [
  // Awaiting confirmation.
  { customer: nusrat, status: 'pending', minutes: 35, source: 'messenger', confirmation: 'requested',
    lines: [line(pick('Cotton Panjabi', { Size: 'M', Colour: 'White' })), line(pick('Silk Scarf', { Colour: 'Rose' }))] },
  { customer: sumaiya, status: 'pending', minutes: h(3), source: 'messenger', confirmation: 'requested', needsCall: true,
    advanceMinor: 100000, note: 'বিকাশে অগ্রিম পাঠিয়েছি।', lines: [line(pick('জামদানি শাড়ি', { Colour: 'লাল' }))] },
  // Confirmed, to be shipped.
  { customer: raisa, status: 'confirmed', minutes: d(1), source: 'messenger',
    lines: [line(pick('Rose Face Cream'), 2), line(pick('Gold-plated Earrings', { Colour: 'Gold' }))] },
  { customer: tanvir, status: 'confirmed', minutes: d(2), source: 'messenger', advanceMinor: 50000,
    lines: [line(pick('Linen Shirt', { Size: 'L', Colour: 'Sky' }), 2)] },
  { customer: mahmudul, status: 'confirmed', minutes: d(2) + h(10), source: 'dashboard', discountMinor: 20000,
    lines: [line(pick('Wireless Earbuds', { Colour: 'Black' }))] },
  // Shipped.
  { customer: arif, status: 'shipped', minutes: d(3), source: 'messenger',
    lines: [line(pick('থ্রি-পিস (লন)', { Size: 'M' })), line(pick('সুতি ওড়না', { Colour: 'হলুদ' }))] },
  { customer: nusrat, status: 'shipped', minutes: d(4), source: 'messenger', advanceMinor: 60000,
    lines: [line(pick('Handbag', { Colour: 'Black' }))] },
  // Delivered.
  { customer: sumaiya, status: 'delivered', minutes: d(5), source: 'dashboard',
    lines: [line(pick('Kolhapuri Sandals', { Size: '41' })), line(pick('মেহেদি কোন'), 2)] },
  { customer: raisa, status: 'delivered', minutes: d(6), source: 'messenger', advanceMinor: 80000,
    lines: [line(pick('Silk Scarf', { Colour: 'Teal' }), 2)] },
  { customer: tanvir, status: 'delivered', minutes: d(7), source: 'messenger',
    lines: [line(pick('Cotton Panjabi', { Size: 'L', Colour: 'Navy' }), 2)] },
  { customer: sadia, status: 'delivered', minutes: d(8), source: 'messenger',
    lines: [line(pick('আমসত্ত্ব (৫০০ গ্রাম)'), 2), line(pick('মেহেদি কোন'))] },
  // Cancelled.
  { customer: mahmudul, status: 'cancelled', minutes: d(6) + h(5), source: 'messenger', cancelReason: 'Customer changed their mind',
    lines: [line(pick('Leather Wallet', { Colour: 'Black' }))] },
  { customer: imran, status: 'cancelled', minutes: d(9), source: 'messenger', cancelReason: 'Customer unreachable',
    lines: [line(pick('Handbag', { Colour: 'Tan' }))] },
  // Returned, parcel not yet back.
  { customer: arif, status: 'returned', minutes: d(9) + h(12), source: 'messenger', note: 'সাইজ ঠিক হয়নি।',
    lines: [line(pick('Linen Shirt', { Size: 'M', Colour: 'Sand' }))] },
];

// Oldest first so numbers rise with age, then newest first in the store.
for (const spec of [...SEED].sort((a, b) => b.minutes - a.minutes)) orders.unshift(build(spec));
for (const order of orders) order.customer_record = recordOf(order.customer_id);

const byId = (id: string) => orders.find((o) => o.id === id) ?? null;
const requireOrder = (id: string) => byId(id) ?? (() => { throw notFound('Order'); })();
const newestFirst = () => [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at));

/** Contract for other handler files: a customer's orders, newest first. */
export function ordersOfCustomer(customerId: string): Order[] {
  return newestFirst().filter((o) => o.customer_id === customerId);
}

const refreshRecords = () => {
  for (const order of orders) order.customer_record = recordOf(order.customer_id);
};

// ---------------------------------------------------------------- state machine

function invalid(order: Order, what: string): DemoError {
  return new DemoError(409, 'INVALID_TRANSITION', `Order #${order.number} is ${order.status}: it cannot be ${what}.`);
}

type Transition = 'confirm' | 'cancel' | 'ship' | 'deliver' | 'return' | 'receive_return';
const FROM: Record<Transition, OrderStatus[]> = {
  confirm: ['pending'],
  cancel: ['pending', 'confirmed'],
  ship: ['confirmed'],
  deliver: ['shipped'],
  return: ['shipped'],
  receive_return: ['returned'],
};
const VERB: Record<Transition, string> = {
  confirm: 'confirmed',
  cancel: 'cancelled',
  ship: 'marked shipped',
  deliver: 'marked delivered',
  return: 'marked returned',
  receive_return: 'received back',
};

function move(
  order: Order,
  transition: Transition,
  extra: { reason?: string; partial?: boolean; collected?: number | null; condition?: 'good' | 'damaged' } = {},
): Order {
  if (!FROM[transition].includes(order.status) || (transition === 'receive_return' && order.return_received_at))
    throw invalid(order, VERB[transition]);
  const now = new Date().toISOString();
  switch (transition) {
    case 'confirm':
      order.status = 'confirmed';
      order.confirmed_at = now;
      order.ready_by = dhakaDay(Date.now() + 2 * DAY);
      if (order.confirmation) order.confirmation = { ...order.confirmation, status: 'confirmed', resolved_at: now, needs_call_reason: null };
      break;
    case 'cancel':
      order.status = 'cancelled';
      order.cancelled_at = now;
      order.cancel_reason = extra.reason ?? null;
      order.ready_by = null;
      if (order.confirmation && order.confirmation.status !== 'confirmed')
        order.confirmation = { ...order.confirmation, status: 'cancelled', resolved_at: now };
      break;
    case 'ship':
      order.status = 'shipped';
      order.shipped_at = now;
      order.shipped_source = 'merchant';
      order.outcome_source = 'merchant';
      order.ready_by = null;
      break;
    case 'deliver':
      order.status = 'delivered';
      order.delivered_at = now;
      order.is_partial_delivery = extra.partial ?? false;
      order.collected_amount_minor = extra.partial
        ? (extra.collected ?? 0)
        : order.total_minor - order.advance.received_minor;
      order.outcome_source = 'merchant';
      break;
    case 'return':
      order.status = 'returned';
      order.returned_at = now;
      order.outcome_source = 'merchant';
      break;
    case 'receive_return':
      order.return_received_at = now;
      order.return_condition = extra.condition ?? 'good';
      break;
  }
  refreshRecords();
  return finish(order);
}

on('post', '/v1/orders/{order_id}/confirm', ({ params }) =>
  move(requireOrder(params.order_id ?? ''), 'confirm'),
);
on('post', '/v1/orders/{order_id}/cancel', ({ params, body }) =>
  move(requireOrder(params.order_id ?? ''), 'cancel', { reason: body.reason }),
);
on('post', '/v1/orders/{order_id}/shipped', ({ params }) =>
  move(requireOrder(params.order_id ?? ''), 'ship'),
);
on('post', '/v1/orders/{order_id}/delivered', ({ params, body }) =>
  move(requireOrder(params.order_id ?? ''), 'deliver', { partial: body.partial, collected: body.collected_minor }),
);
on('post', '/v1/orders/{order_id}/returned', ({ params }) =>
  move(requireOrder(params.order_id ?? ''), 'return'),
);
on('post', '/v1/orders/{order_id}/return-received', ({ params, body }) =>
  move(requireOrder(params.order_id ?? ''), 'receive_return', { condition: body?.condition }),
);

/** Record an advance payment (bKash and friends) received before dispatch. */
on('post', '/v1/orders/{order_id}/advance', ({ params, body }) => {
  const order = requireOrder(params.order_id ?? '');
  if (!['pending', 'confirmed'].includes(order.status)) throw invalid(order, 'given an advance');
  if (!Number.isInteger(body.amount_minor) || body.amount_minor <= 0 || body.amount_minor > order.total_minor)
    throw new DemoError(422, 'VALIDATION_ERROR', 'The advance must be more than zero and at most the order total.');
  order.advance = {
    method: body.method,
    received_at: new Date().toISOString(),
    received_minor: body.amount_minor,
    reference: body.reference,
    required_minor: Math.max(order.advance.required_minor, body.amount_minor),
  };
  return finish(order);
});

on('post', '/v1/orders/outcomes', ({ body }) => {
  const transition: Transition = { shipped: 'ship', delivered: 'deliver', returned: 'return' }[body.outcome] as Transition;
  const accepted: string[] = [];
  const refused: { code: string; message: string; order_id: string }[] = [];
  for (const id of body.order_ids) {
    const order = byId(id);
    if (!order) {
      refused.push({ code: 'NOT_FOUND', message: 'Order not found.', order_id: id });
      continue;
    }
    try {
      move(order, transition);
      accepted.push(id);
    } catch (error) {
      if (!(error instanceof DemoError)) throw error;
      refused.push({ code: error.code, message: error.message, order_id: id });
    }
  }
  return { accepted, refused };
});

// ---------------------------------------------------------------- reads

const PAGE_DEFAULT = 25;

function matches(order: Order, query: URLSearchParams): boolean {
  const status = query.get('status');
  if (status && order.status !== status) return false;
  const customerId = query.get('customer_id');
  if (customerId && order.customer_id !== customerId) return false;
  const source = query.get('source');
  if (source && order.source !== source) return false;
  const readyBy = query.get('ready_by_before');
  if (readyBy && !(order.ready_by !== null && order.ready_by < readyBy)) return false;
  const confirmation = query.get('confirmation');
  if (confirmation && order.confirmation?.status !== confirmation) return false;
  if (query.get('shipment') === 'needs_review' && order.shipment?.needs_review_reason == null) return false;
  const q = query.get('q')?.trim().toLowerCase();
  if (q) {
    const haystack = [
      String(order.number),
      `#${order.number}`,
      order.customer.name ?? '',
      order.customer.phone ?? '',
      order.customer.address.area ?? '',
      ...order.items.map((i) => i.product_name),
    ]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

on('get', '/v1/orders', ({ query }) => {
  const rows = newestFirst().filter((o) => matches(o, query));
  if (query.get('sort') === 'oldest') rows.reverse();
  const limit = Math.min(Math.max(Number(query.get('limit')) || PAGE_DEFAULT, 1), 100);
  const offset = Math.max(Number(query.get('cursor')) || 0, 0);
  const page = rows.slice(offset, offset + limit);
  return {
    items: page.map((order) => ({ ...order, other_lines: 0, thumbnail_url: null })),
    next_cursor: offset + limit < rows.length ? String(offset + limit) : null,
  };
});

on('get', '/v1/orders/counts', ({ query }) => {
  const byStatus: Record<string, number> = {};
  for (const order of orders) byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;
  const readyBy = query.get('ready_by_before');
  return {
    by_status: byStatus,
    needs_review: 0,
    ready_soon: orders.filter(
      (o) => o.status === 'confirmed' && o.ready_by !== null && readyBy !== null && o.ready_by < readyBy,
    ).length,
    to_call: orders.filter((o) => o.confirmation?.status === 'needs_call').length,
    to_chase: chaseItems().length,
  };
});

on('get', '/v1/orders/{order_id}', ({ params }) => requireOrder(params.order_id ?? ''));

// ---------------------------------------------------------------- quote and create

function quote(
  lines: Line[],
  deliveryOptionId: string,
): components['schemas']['OrderQuoteRead'] {
  const { items, subtotal } = priceLines(lines);
  const delivery = deliveryFor(deliveryOptionId);
  return {
    advance_required_minor: 0,
    allowed_delivery_option_ids: DELIVERY_OPTIONS.map((o) => o.id),
    cod_amount_minor: subtotal + delivery.feeMinor,
    coupon_code: null,
    currency: CURRENCY,
    delivery_fee_minor: delivery.feeMinor,
    delivery_name: delivery.name,
    delivery_option_id: delivery.id,
    discount_minor: 0,
    lines: items.map((i) => ({
      line_total_minor: i.line_total_minor,
      list_price_minor: i.list_price_minor ?? i.unit_price_minor,
      quantity: i.quantity,
      tier_min_quantity: null,
      unit_price_minor: i.unit_price_minor,
      variant_id: i.variant_id,
    })),
    savings_minor: 0,
    subtotal_minor: subtotal,
    total_minor: subtotal + delivery.feeMinor,
  };
}

const toLines = (items: { variant_id: string; quantity: number }[]): Line[] =>
  items.map((i) => ({ variantId: i.variant_id, quantity: i.quantity }));

on('post', '/v1/orders/quote', ({ body }) => quote(toLines(body.items), body.delivery_option_id));

on('post', '/v1/orders', ({ body }) => {
  const priced = quote(toLines(body.items), body.delivery_option_id);
  if (body.expected_total_minor != null && body.expected_total_minor !== priced.total_minor)
    throw new DemoError(409, 'QUOTE_CHANGED', 'The total changed. Review the order and try again.');
  const known = CUSTOMERS.find((c) => c.phone === body.phone);
  const customerId = known?.id ?? crypto.randomUUID();
  const fromChat = body.conversation_id ?? (known ? null : null);
  const { items } = priceLines(toLines(body.items));
  const now = new Date().toISOString();
  orderSeq += 1;
  const advance = Math.min(body.expected_advance_minor ?? 0, priced.total_minor);
  const order: Order = {
    advance: { method: null, received_at: null, received_minor: 0, reference: null, required_minor: advance },
    allowed_actions: [],
    cancel_reason: null,
    cancelled_at: null,
    cod_amount_minor: 0,
    collected_amount_minor: null,
    confirmation: null,
    confirmed_at: null,
    conversation_id: fromChat,
    coupon_code: null,
    created_at: now,
    created_by_user_id: null,
    credit: 'team',
    currency: CURRENCY,
    customer: {
      address: {
        area: body.area ?? null,
        district: body.district ?? null,
        line: body.address_line ?? null,
        raw_text: body.address_raw,
      },
      name: body.customer_name ?? known?.name ?? null,
      phone: body.phone,
    },
    customer_id: customerId,
    customer_note: null,
    customer_record: null,
    delivered_at: null,
    delivery: { fee_minor: priced.delivery_fee_minor, name: priced.delivery_name, option_id: priced.delivery_option_id },
    discount_minor: priced.discount_minor,
    id: nextId(),
    is_partial_delivery: false,
    items,
    notes: body.notes ?? null,
    number: orderSeq,
    outcome_source: null,
    payment_method: 'cod',
    phone_verified_at: null,
    processing_at: null,
    ready_by: null,
    return_condition: null,
    return_received_at: null,
    returned_at: null,
    savings_minor: priced.savings_minor,
    shipment: null,
    shipped_at: null,
    shipped_source: null,
    shipping_notifications: [],
    source: fromChat ? 'messenger' : 'dashboard',
    status: 'pending',
    subtotal_minor: priced.subtotal_minor,
    total_minor: priced.total_minor,
    updated_at: now,
  };
  orders.unshift(finish(order));
  refreshRecords();
  return order;
});

// ---------------------------------------------------------------- status link

const links = new Map<string, { token: string; expiresAt: number }>();
function statusLink(orderId: string, reset: boolean): components['schemas']['StatusLink'] {
  const order = requireOrder(orderId);
  let link = links.get(order.id);
  if (!link || reset || link.expiresAt < Date.now())
    link = { token: crypto.randomUUID().replaceAll('-', '').slice(0, 16), expiresAt: Date.now() + 7 * DAY };
  links.set(order.id, link);
  return {
    expired: false,
    expires_at: iso(link.expiresAt),
    url: `https://demo.nakshighor.test/order/${link.token}`,
  };
}
on('post', '/v1/orders/{order_id}/status-link', ({ params }) => statusLink(params.order_id ?? '', false));
on('post', '/v1/orders/{order_id}/status-link/reset', ({ params }) => statusLink(params.order_id ?? '', true));

// ---------------------------------------------------------------- shipments (courier is not in the demo)

const noCourier = () =>
  new DemoError(501, 'DEMO_UNAVAILABLE', 'Courier booking is not available in the demo. Book in the courier panel.');

on('get', '/v1/orders/{order_id}/shipments', ({ params }) => {
  requireOrder(params.order_id ?? '');
  return { items: [] };
});
on('post', '/v1/orders/{order_id}/shipments', () => {
  throw noCourier();
});
on('post', '/v1/shipments/quote', () => {
  throw noCourier();
});
on('post', '/v1/shipments/bulk', () => {
  throw noCourier();
});
on('post', '/v1/shipments/{shipment_id}/mark-booked', () => {
  throw noCourier();
});
on('post', '/v1/shipments/{shipment_id}/refresh', () => {
  throw noCourier();
});

// ---------------------------------------------------------------- analytics

/** Whole-number hash of a date string, so synthetic chat figures are stable for a day. */
const hash = (text: string) => [...text].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 9973, 7);

function dayMetrics(date: string, until: string | null): components['schemas']['DayMetricsRead'] {
  const placed = orders.filter(
    (o) => dhakaDay(o.created_at) === date && (!until || dhakaTime(new Date(o.created_at)) <= until),
  );
  const on = (stamp: string | null) => stamp !== null && dhakaDay(stamp) === date;
  const delivered = orders.filter((o) => on(o.delivered_at));
  // Chats are not an order fact: every customer who ordered chatted, plus a stable synthetic number
  // of browsers who did not.
  const seed = hash(date);
  const chats = new Set(placed.map((o) => o.customer_id)).size + 2 + (seed % 4);
  const replied = chats - (seed % 2);
  const aiOnly = Math.round(replied * 0.6);
  const withHelp = Math.round(replied * 0.25);
  return {
    chats,
    chats_ai_only: aiOnly,
    chats_ai_with_help: withHelp,
    chats_person_only: Math.max(0, replied - aiOnly - withHelp),
    currency: CURRENCY,
    date,
    delivered_value_minor: delivered.reduce((sum, o) => sum + o.total_minor, 0),
    messages_received: chats * 4,
    order_value_minor: placed.reduce((sum, o) => sum + o.total_minor, 0),
    orders: placed.length,
    orders_cancelled: orders.filter((o) => on(o.cancelled_at)).length,
    orders_confirmed: orders.filter((o) => on(o.confirmed_at)).length,
    orders_delivered: delivered.length,
    orders_returned: orders.filter((o) => on(o.returned_at)).length,
    replied_chats: replied,
    replies_ai: aiOnly * 3 + withHelp * 2,
    replies_ai_edited: withHelp,
    replies_person: withHelp * 2 + Math.max(0, replied - aiOnly - withHelp) * 3,
    system_messages: placed.length * 2,
  };
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end && out.length < 92; t += DAY)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

on('get', '/v1/analytics/overview', ({ query }) => {
  const from = query.get('from') ?? dhakaDay(Date.now());
  const to = query.get('to') ?? from;
  const until = query.get('until');
  const days = datesBetween(from, to).map((date) => dayMetrics(date, date === to ? until : null));
  const sum = (pick: (day: (typeof days)[number]) => number) => days.reduce((n, day) => n + pick(day), 0);
  const orderCount = sum((x) => x.orders);
  const replied = sum((x) => x.replied_chats);
  const aiOnly = sum((x) => x.chats_ai_only);
  return {
    days,
    from,
    to,
    totals: {
      ai_only_share: replied > 0 ? aiOnly / replied : null,
      cancellation_rate: orderCount > 0 ? sum((x) => x.orders_cancelled) / orderCount : null,
      chats: sum((x) => x.chats),
      chats_ai_only: aiOnly,
      chats_ai_with_help: sum((x) => x.chats_ai_with_help),
      chats_person_only: sum((x) => x.chats_person_only),
      currency: CURRENCY,
      delivered_value_minor: sum((x) => x.delivered_value_minor),
      messages_received: sum((x) => x.messages_received),
      order_value_minor: sum((x) => x.order_value_minor),
      orders: orderCount,
      orders_cancelled: sum((x) => x.orders_cancelled),
      orders_confirmed: sum((x) => x.orders_confirmed),
      orders_delivered: sum((x) => x.orders_delivered),
      orders_returned: sum((x) => x.orders_returned),
      replies_ai: sum((x) => x.replies_ai),
      replies_ai_edited: sum((x) => x.replies_ai_edited),
      replies_person: sum((x) => x.replies_person),
      system_messages: sum((x) => x.system_messages),
    },
  };
});

/** Customers who showed interest and went quiet without an open order. */
function chaseItems(): components['schemas']['ChaseItemRead'][] {
  const open = new Set(orders.filter((o) => ['pending', 'confirmed', 'shipped'].includes(o.status)).map((o) => o.customer_id));
  const wanted: [CastCustomer, string, number, 'tap' | 'asked'][] = [
    [imran, 'Wireless Earbuds', 190, 'asked'],
    [sadia, 'জামদানি শাড়ি', 60 * 20, 'tap'],
  ];
  return wanted
    .filter(([customer]) => !open.has(customer.id))
    .map(([customer, productName, minutes, type]) => {
      const product = PRODUCTS.find((p) => p.name === productName);
      return {
        assignee_name: null,
        assignee_user_id: null,
        conversation_id: conversationIdOf(customer.id),
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone,
        follow_up_sent: false,
        products: product
          ? [{ currency: CURRENCY, name: product.name, price_now_minor: product.priceMinor, product_id: product.id, variant_id: null }]
          : [],
        signal_at: minutesAgo(minutes),
        signal_type: type,
        window_open: minutes < 24 * 60,
      };
    });
}

on('get', '/v1/analytics/to-chase', ({ query }) => {
  const items = query.get('mine') === 'true' ? [] : chaseItems();
  return { items, next_cursor: null, total_count: items.length };
});

// ---------------------------------------------------------------- address areas

const area = (kind: 'thana' | 'upazila', name: string, name_bn: string) => ({ kind, name, name_bn });

on('get', '/v1/address-areas', () => [
  { district: 'Dhaka', district_bn: 'ঢাকা', areas: [
    area('thana', 'Dhanmondi', 'ধানমন্ডি'), area('thana', 'Mirpur', 'মিরপুর'), area('thana', 'Uttara', 'উত্তরা'),
    area('thana', 'Bashundhara', 'বসুন্ধরা'), area('thana', 'Gulshan', 'গুলশান'), area('thana', 'Mohammadpur', 'মোহাম্মদপুর'),
  ] },
  { district: 'Chattogram', district_bn: 'চট্টগ্রাম', areas: [
    area('thana', 'Agrabad', 'আগ্রাবাদ'), area('thana', 'Pahartali', 'পাহাড়তলী'), area('thana', 'Kotwali', 'কোতোয়ালী'),
    area('upazila', 'Hathazari', 'হাটহাজারী'),
  ] },
  { district: 'Sylhet', district_bn: 'সিলেট', areas: [
    area('thana', 'Zindabazar', 'জিন্দাবাজার'), area('thana', 'Ambarkhana', 'আম্বরখানা'), area('upazila', 'Beanibazar', 'বিয়ানীবাজার'),
  ] },
  { district: 'Rajshahi', district_bn: 'রাজশাহী', areas: [
    area('thana', 'Shaheb Bazar', 'সাহেব বাজার'), area('thana', 'Boalia', 'বোয়ালিয়া'), area('upazila', 'Paba', 'পবা'),
  ] },
  { district: 'Khulna', district_bn: 'খুলনা', areas: [
    area('thana', 'Sonadanga', 'সোনাডাঙ্গা'), area('thana', 'Khalishpur', 'খালিশপুর'), area('upazila', 'Dumuria', 'ডুমুরিয়া'),
  ] },
  { district: 'Gazipur', district_bn: 'গাজীপুর', areas: [
    area('thana', 'Tongi', 'টঙ্গী'), area('upazila', 'Kaliakair', 'কালিয়াকৈর'), area('upazila', 'Gazipur Sadar', 'গাজীপুর সদর'),
  ] },
]);
