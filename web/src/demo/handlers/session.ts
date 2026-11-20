import { OWNER, PRODUCTS, SHOP, STAFF, minutesAgo } from '../cast';
import { DemoError, notFound, on } from '../router';

// Auth, features, team, and the signed-in member's preferences. State lives in module scope so a
// write followed by a read returns the new value; a reload starts the demo over.

export const merchantState = { name: SHOP.name as string };

const user = {
  avatar_url: null as string | null,
  email: OWNER.email as string,
  email_verified: true,
  id: OWNER.id as string,
  language: 'en' as 'bn' | 'en' | null,
  name: OWNER.name as string | null,
  phone: OWNER.phone as string | null,
  phone_verified: true,
};

const me = () => ({
  merchant: {
    name: merchantState.name,
    review_note: null,
    review_status: 'approved' as const,
    slug: SHOP.slug as string,
  },
  role: 'owner',
  user: { ...user },
});

on('get', '/v1/auth/me', () => me());

on('patch', '/v1/auth/me/profile', ({ body }) => {
  if (body.name !== undefined) user.name = body.name;
  if (body.phone !== undefined) user.phone = body.phone;
  if (body.name) {
    const member = members.find((m) => m.user_id === OWNER.id);
    if (member) member.name = body.name;
  }
  return me();
});

on('post', '/v1/auth/me/password', ({ body }) => {
  if (!body?.new_password || body.new_password.length < 8) {
    throw new DemoError(422, 'VALIDATION_ERROR', 'Choose a password of at least 8 characters.');
  }
  return null;
});

on('put', '/v1/auth/me/language', ({ body }) => {
  user.language = body.language;
  return me();
});

on('post', '/v1/auth/logout', () => null);

// Features -------------------------------------------------------------------------------------

type Feature = {
  key:
    | 'ai_monthly_allowance'
    | 'ai_drafting'
    | 'auto_mode_allowed'
    | 'catalog_import'
    | 'history_import'
    | 'page_connect_before_meta_live'
    | 'ai_daily_token_budget'
    | 'team_members_max'
    | 'products_max';
  kind: 'flag' | 'limit';
  value: boolean | number | null;
  current?: number | null;
};

const flag = (key: Feature['key'], value: boolean): Feature => ({ key, kind: 'flag', value });

on('get', '/v1/merchants/me/features', () => ({
  items: [
    flag('ai_drafting', true),
    // The demo's AI mode is drafts for approval; fully automatic replies stay off.
    flag('auto_mode_allowed', false),
    flag('catalog_import', false),
    flag('history_import', false),
    flag('page_connect_before_meta_live', true),
    { key: 'ai_monthly_allowance', kind: 'limit', value: null },
    { key: 'ai_daily_token_budget', kind: 'limit', value: null },
    { key: 'team_members_max', kind: 'limit', value: 5, current: members.length },
    { key: 'products_max', kind: 'limit', value: 200, current: PRODUCTS.length },
  ] satisfies Feature[],
}));

// Preferences ----------------------------------------------------------------------------------

const preferences = {
  email_on_assignment: true,
  push_on_assignment: true,
  push_on_draft: true,
  push_on_escalation: true,
};

on('get', '/v1/merchant/members/me/preferences', () => ({ ...preferences }));

on('patch', '/v1/merchant/members/me/preferences', ({ body }) => {
  for (const key of Object.keys(preferences) as (keyof typeof preferences)[]) {
    const next = body?.[key];
    if (typeof next === 'boolean') preferences[key] = next;
  }
  return { ...preferences };
});

// Team -----------------------------------------------------------------------------------------

const members = [
  {
    avatar_url: null as string | null,
    email: OWNER.email as string,
    joined_at: minutesAgo(60 * 24 * 120),
    name: OWNER.name as string,
    role: 'owner',
    user_id: OWNER.id as string,
  },
  {
    avatar_url: null as string | null,
    email: STAFF.email as string,
    joined_at: minutesAgo(60 * 24 * 45),
    name: STAFF.name as string,
    role: 'staff',
    user_id: STAFF.id as string,
  },
];

on('get', '/v1/merchant/members', () => ({ items: members.map((m) => ({ ...m })) }));

on('delete', '/v1/merchant/members/{user_id}', ({ params }) => {
  const index = members.findIndex((m) => m.user_id === params.user_id);
  const member = members[index];
  if (!member) throw notFound('Member');
  if (member.role === 'owner') {
    throw new DemoError(409, 'CONFLICT', 'The owner cannot be removed.');
  }
  members.splice(index, 1);
  return null;
});

let inviteNo = 0;
const invites: {
  created_at: string;
  email: string;
  expired: boolean;
  expires_at: string;
  id: string;
  role: string;
}[] = [];

on('get', '/v1/merchant/invites', () => ({ items: invites.map((i) => ({ ...i })) }));

on('post', '/v1/merchant/invites', ({ body }) => {
  const email = (body?.email ?? '').trim().toLowerCase();
  if (!email.includes('@')) {
    throw new DemoError(422, 'VALIDATION_ERROR', 'Enter a valid email address.');
  }
  inviteNo += 1;
  const invite = {
    created_at: new Date().toISOString(),
    email,
    expired: false,
    expires_at: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString(),
    id: `0197a000-0000-7000-8a00-${String(inviteNo).padStart(12, '0')}`,
    role: 'staff',
  };
  invites.unshift(invite);
  return { ...invite };
});

on('delete', '/v1/merchant/invites/{invite_id}', ({ params }) => {
  const index = invites.findIndex((i) => i.id === params.invite_id);
  if (index < 0) throw notFound('Invite');
  invites.splice(index, 1);
  return null;
});

// Push notifications ---------------------------------------------------------------------------

const devices: {
  active: boolean;
  created_at: string;
  current: boolean;
  id: string;
  label: string;
  last_sent_at: string | null;
}[] = [];
let deviceNo = 0;

on('get', '/v1/notifications/push/devices', () => ({ items: devices.map((d) => ({ ...d })) }));

// No push service in the demo: the page sees push as unavailable and hides the toggle.
on('get', '/v1/notifications/push/public-key', () => ({ available: false, public_key: null }));

on('post', '/v1/notifications/push/devices', ({ body }) => {
  deviceNo += 1;
  for (const d of devices) d.current = false;
  const device = {
    active: true,
    created_at: new Date().toISOString(),
    current: true,
    id: `0197a000-0000-7000-8b00-${String(deviceNo).padStart(12, '0')}`,
    label: body?.label ?? 'This browser',
    last_sent_at: null,
  };
  devices.push(device);
  return { ...device };
});

on('delete', '/v1/notifications/push/devices/{device_id}', ({ params }) => {
  const index = devices.findIndex((d) => d.id === params.device_id);
  if (index < 0) throw notFound('Device');
  devices.splice(index, 1);
  return null;
});

on('post', '/v1/notifications/push/devices/current/test', () => {
  const current = devices.find((d) => d.current);
  if (current) current.last_sent_at = new Date().toISOString();
  return null;
});
