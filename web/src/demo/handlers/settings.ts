import { DELIVERY_OPTIONS, PRODUCTS, SHOP, minutesAgo } from '../cast';
import { DemoError, notFound, on } from '../router';
import { merchantState } from './session';

// Shop settings, the Messenger connection, payment and delivery. Module-level state so a write
// followed by a read returns the new value; a reload starts the demo over.

on('patch', '/v1/merchant', ({ body }) => {
  const name = body?.name?.trim();
  if (!name) throw new DemoError(422, 'VALIDATION_ERROR', 'Enter a shop name.');
  merchantState.name = name;
  return {
    created_at: minutesAgo(60 * 24 * 120),
    id: SHOP.id,
    name,
    slug: SHOP.slug,
    status: 'active',
  };
});

// Simple settings ------------------------------------------------------------------------------

const advance = {
  default_advance_fixed_minor: null as number | null,
  default_advance_policy: 'delivery_fee' as 'none' | 'delivery_fee' | 'fixed' | 'full',
};

on('get', '/v1/merchant/advance-settings', () => ({ ...advance }));
on('put', '/v1/merchant/advance-settings', ({ body }) => {
  advance.default_advance_policy = body.default_advance_policy;
  advance.default_advance_fixed_minor =
    body.default_advance_policy === 'fixed' ? (body.default_advance_fixed_minor ?? null) : null;
  return { ...advance };
});

const ai = {
  ai_mode: 'draft' as 'off' | 'draft' | 'auto',
  ai_store_notes:
    'We deliver inside Dhaka in 1-2 days and outside Dhaka in 3-5 days. Cash on delivery is available; for bKash or Nagad, ask the customer to send the delivery charge first. No returns on mehedi cones and food items.' as
      | string
      | null,
  auto_mode_available: false,
  auto_mode_enabled_at: null as string | null,
  humanize_replies: true,
  order_receipt_enabled: true,
  product_cards_enabled: true,
  reply_languages: ['bangla', 'banglish', 'english'] as ('bangla' | 'banglish' | 'english')[],
  takeover_default_minutes: 60 as 30 | 60 | 360 | null,
  takeover_hint_dismissed_at: null as string | null,
};

on('get', '/v1/merchant/ai-settings', () => ({ ...ai }));
on('put', '/v1/merchant/ai-settings', ({ body }) => {
  // Fully automatic replies are not part of the demo: the merchant approves every draft.
  if (body.ai_mode) ai.ai_mode = body.ai_mode === 'auto' ? 'draft' : body.ai_mode;
  if (body.ai_store_notes !== undefined) ai.ai_store_notes = body.ai_store_notes;
  if (body.humanize_replies != null) ai.humanize_replies = body.humanize_replies;
  if (body.order_receipt_enabled != null) ai.order_receipt_enabled = body.order_receipt_enabled;
  if (body.product_cards_enabled != null) ai.product_cards_enabled = body.product_cards_enabled;
  if (body.reply_languages) ai.reply_languages = body.reply_languages;
  if (body.takeover_default_minutes !== undefined) {
    ai.takeover_default_minutes = body.takeover_default_minutes;
  }
  if (body.dismiss_takeover_hint) ai.takeover_hint_dismissed_at = new Date().toISOString();
  return { ...ai };
});

const followUp = { follow_up_delay_minutes: 120, follow_up_enabled: true };
on('get', '/v1/merchant/follow-up-settings', () => ({ ...followUp }));
on('put', '/v1/merchant/follow-up-settings', ({ body }) => {
  followUp.follow_up_enabled = body.follow_up_enabled;
  if (body.follow_up_delay_minutes != null) {
    followUp.follow_up_delay_minutes = body.follow_up_delay_minutes;
  }
  return { ...followUp };
});

const confirmation = { order_confirmation_enabled: true };
on('get', '/v1/merchant/order-confirmation-settings', () => ({ ...confirmation }));
on('put', '/v1/merchant/order-confirmation-settings', ({ body }) => {
  confirmation.order_confirmation_enabled = body.order_confirmation_enabled;
  return { ...confirmation };
});

const shipping = {
  shipping_update_delivered_enabled: true,
  shipping_update_out_for_delivery_enabled: true,
  shipping_update_shipped_enabled: true,
};
on('get', '/v1/merchant/shipping-message-settings', () => ({ ...shipping }));
on('put', '/v1/merchant/shipping-message-settings', ({ body }) => {
  for (const key of Object.keys(shipping) as (keyof typeof shipping)[]) {
    const next = body?.[key];
    if (typeof next === 'boolean') shipping[key] = next;
  }
  return { ...shipping };
});

const stock = { low_stock_threshold: 5 };
on('get', '/v1/merchant/stock-settings', () => ({ ...stock }));
on('put', '/v1/merchant/stock-settings', ({ body }) => {
  stock.low_stock_threshold = body.low_stock_threshold;
  return { ...stock };
});

// No allowance meter in the demo: the shop is not capped.
on('get', '/v1/merchant/ai-usage', () => ({
  allowance_micro_usd: null,
  pause: null,
  remaining_micro_usd: null,
  resets_at: null,
}));

// Message previews -----------------------------------------------------------------------------

const sample = PRODUCTS[0]!;
const taka = (minor: number) => `৳${(minor / 100).toLocaleString('en-US')}`;

on('get', '/v1/merchant/order-confirmation-preview', () => ({
  request: {
    buttons: ['Confirm order', 'Cancel'],
    order_number: 'NG-1042',
    template_text:
      'আপনার অর্ডার {order_number} এর মোট {total}। কনফার্ম করতে নিচের বাটনে চাপ দিন।',
    text: 'আপনার অর্ডার NG-1042 এর মোট ৳1,870। কনফার্ম করতে নিচের বাটনে চাপ দিন।',
  },
}));

on('get', '/v1/merchant/order-receipt-preview', () => ({
  receipt: {
    currency: 'BDT',
    details_text: 'Cash on delivery · Mirpur, Dhaka',
    items: [
      {
        image_url: null,
        price: taka(sample.priceMinor),
        quantity: 1,
        subtitle: 'Size L · White',
        title: sample.name,
      },
    ],
    order_id: '0197a000-0000-7000-8500-000000001042',
    order_number: 'NG-1042',
    payment_method: 'Cash on delivery',
    recipient_name: 'Nusrat Jahan',
    shipping: taka(DELIVERY_OPTIONS[0].feeMinor),
    subtotal: taka(sample.priceMinor),
    total: taka(sample.priceMinor + DELIVERY_OPTIONS[0].feeMinor),
  },
}));

on('get', '/v1/merchant/product-card-preview', () => ({
  card: {
    buttons: [
      { payload: 'ORDER_THIS', title: 'Order this', url: null },
      { payload: 'SEE_MORE', title: 'See more', url: null },
    ],
    image_url: null,
    product_id: sample.id,
    subtitle: `${taka(sample.priceMinor)} · In stock`,
    title: sample.name,
  },
}));

// Support access -------------------------------------------------------------------------------

const grants: {
  ended_at: string | null;
  ended_by: 'you' | 'staff' | null;
  expires_at: string;
  granted_at: string;
  id: string;
  reason: string;
  staff_name: string;
  status: 'active' | 'ended' | 'expired';
}[] = [
  {
    ended_at: null,
    ended_by: null,
    expires_at: new Date(Date.now() + 20 * 3_600_000).toISOString(),
    granted_at: minutesAgo(240),
    id: '0197a000-0000-7000-8c00-000000000001',
    reason: 'Help setting up the Facebook Page connection',
    staff_name: 'Demo Support',
    status: 'active',
  },
  {
    ended_at: minutesAgo(60 * 24 * 9),
    ended_by: 'staff',
    expires_at: minutesAgo(60 * 24 * 8),
    granted_at: minutesAgo(60 * 24 * 10),
    id: '0197a000-0000-7000-8c00-000000000002',
    reason: 'Checking a delivery fee question',
    staff_name: 'Demo Support',
    status: 'ended',
  },
];

on('get', '/v1/merchant/support-access', () => ({ items: grants.map((g) => ({ ...g })) }));
on('post', '/v1/merchant/support-access/{grant_id}/revoke', ({ params }) => {
  const grant = grants.find((g) => g.id === params.grant_id);
  if (!grant) throw notFound('Support access');
  if (grant.status === 'active') {
    grant.status = 'ended';
    grant.ended_by = 'you';
    grant.ended_at = new Date().toISOString();
  }
  return { ...grant };
});

// Messenger ------------------------------------------------------------------------------------

const connect = () => ({
  channel: 'messenger',
  connected_at: minutesAgo(60 * 24 * 30),
  external_account_id: SHOP.facebookPageId as string,
  id: '0197a000-0000-7000-8d00-000000000001',
  last_error: null,
  last_webhook_received_at: minutesAgo(3),
  missing_permissions: [] as string[],
  name: SHOP.facebookPageName as string,
  subscription_check_outcome: 'ok' as const,
  subscription_checked_at: minutesAgo(30),
  subscription_missing_fields: [] as string[],
  subscription_read_contract: 'messages, messaging_postbacks, message_reads',
  subscription_state: 'configured' as const,
  subscription_verified_at: minutesAgo(30),
  token_status: 'active',
});

let connection: ReturnType<typeof connect> | null = connect();

on('get', '/v1/channels/messenger', () => (connection ? { ...connection } : null));
on('get', '/v1/channels/messenger/pages', () => ({
  pages: [{ id: SHOP.facebookPageId, name: SHOP.facebookPageName }],
}));
on('post', '/v1/channels/messenger/connect', () => {
  connection = connect();
  connection.connected_at = new Date().toISOString();
  return { ...connection };
});
on('delete', '/v1/channels/messenger', () => {
  connection = null;
  return null;
});

// Payment and delivery -------------------------------------------------------------------------

type Account = {
  account_kind: 'personal' | 'merchant' | 'agent' | null;
  details: string | null;
  id: string;
  method: 'bkash' | 'nagad' | 'rocket' | 'bank';
  note: string | null;
  number: string | null;
  position: number;
};

const accounts: Account[] = [
  {
    account_kind: 'merchant',
    details: null,
    id: '0197a000-0000-7000-8e00-000000000001',
    method: 'bkash',
    note: null,
    number: '+8801700000000',
    position: 0,
  },
  {
    account_kind: 'personal',
    details: null,
    id: '0197a000-0000-7000-8e00-000000000002',
    method: 'nagad',
    note: 'Send Money only',
    number: '+8801800000000',
    position: 1,
  },
];
let accountNo = accounts.length;
let paymentNote: string | null =
  'ডেলিভারি চার্জ আগে bKash/Nagad এ পাঠিয়ে বাকি টাকা পণ্য হাতে পেয়ে দিন (COD)।';

const renumber = () => accounts.forEach((a, i) => (a.position = i));

on('get', '/v1/payment-and-delivery', () => ({
  cod_available: true,
  default_advance: {
    fixed_minor: advance.default_advance_fixed_minor,
    policy: advance.default_advance_policy,
  },
  delivery_options: DELIVERY_OPTIONS.map((o, i) => ({
    created_at: minutesAgo(60 * 24 * 100),
    currency: 'BDT',
    delivery_days_max: Number(o.days.split('-')[1]),
    delivery_days_min: Number(o.days.split('-')[0]),
    fee_minor: o.feeMinor,
    id: o.id,
    is_active: true,
    name: o.name,
    position: i,
    updated_at: minutesAgo(60 * 24 * 10),
    zone_hint: i === 0 ? 'Dhaka city' : 'All other districts',
  })),
  payment_accounts: accounts.map((a) => ({ ...a })),
  payment_note: paymentNote,
}));

on('put', '/v1/payment-and-delivery/payment-note', ({ body }) => {
  paymentNote = body.payment_note?.trim() ? body.payment_note : null;
  return { payment_note: paymentNote, warnings: [] };
});

on('post', '/v1/shop-info/payment-accounts', ({ body }) => {
  accountNo += 1;
  const account: Account = {
    account_kind: body.account_kind ?? null,
    details: body.details ?? null,
    id: `0197a000-0000-7000-8e00-${String(accountNo).padStart(12, '0')}`,
    method: body.method,
    note: body.note ?? null,
    number: body.number ?? null,
    position: accounts.length,
  };
  accounts.push(account);
  return { ...account };
});

// Registered before `/{account_id}` so "order" is not read as an id.
on('put', '/v1/shop-info/payment-accounts/order', ({ body }) => {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const ordered = body.ids.flatMap((id) => byId.get(id) ?? []);
  const rest = accounts.filter((a) => !body.ids.includes(a.id));
  accounts.splice(0, accounts.length, ...ordered, ...rest);
  renumber();
  return accounts.map((a) => ({ ...a }));
});

on('patch', '/v1/shop-info/payment-accounts/{account_id}', ({ params, body }) => {
  const account = accounts.find((a) => a.id === params.account_id);
  if (!account) throw notFound('Payment account');
  if (body.account_kind !== undefined) account.account_kind = body.account_kind;
  if (body.details !== undefined) account.details = body.details;
  if (body.note !== undefined) account.note = body.note;
  if (body.number !== undefined) account.number = body.number;
  return { ...account };
});

on('delete', '/v1/shop-info/payment-accounts/{account_id}', ({ params }) => {
  const index = accounts.findIndex((a) => a.id === params.account_id);
  if (index < 0) throw notFound('Payment account');
  accounts.splice(index, 1);
  renumber();
  return null;
});

// Courier and storefront: both off in the demo -------------------------------------------------

on('get', '/v1/courier-connections', () => ({ items: [] }));

on('get', '/v1/storefront/settings', () => ({
  address_text: null,
  buy_it_now_enabled: false,
  contact_email: null,
  contact_phone: null,
  default_language: 'bn' as const,
  facebook_url: null,
  handle: null,
  instagram_url: null,
  logo_media_id: null,
  low_stock_messages_enabled: false,
  messenger_url: null,
  name: merchantState.name,
  seo_description: null,
  seo_title: null,
  shop_url: null,
  status: 'draft' as const,
  tagline: null,
  web_chat_enabled: false,
  whatsapp_phone: null,
}));
