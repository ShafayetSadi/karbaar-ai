import type { components } from '../api/schema';
import type { ApiError } from '../api/errors';

export type ShopInfo = components['schemas']['ShopInfoRead'];
export type ShopInfoUpdate = Partial<components['schemas']['ShopInfoUpdate']>;
export type PaymentAccount = components['schemas']['PaymentAccountRead'];
export type Closure = components['schemas']['ShopClosureRead'];

/** The Bangladeshi week, Saturday first, as the API stores it. */
export const DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;
export type Day = (typeof DAYS)[number];
export type Range = [string, string];
export type Week = Record<Day, Range[]>;

export const MAX_RANGES = 3;
export const DEFAULT_RANGE: Range = ['10:00', '20:00'];
export const EXTRA_RANGE: Range = ['15:00', '20:00'];

/** The sections of the page; `topic` links from the questions page land on one of them. */
export type Section = 'hours' | 'payment' | 'returns';

/** Question topics a shop-info section answers, and the section each opens (KB3). */
export const SHOP_INFO_TOPICS: Record<string, Section> = {
  shop_info: 'hours',
  payment_method: 'payment',
  returns_exchange: 'returns',
};

/** Topics answered in Settings → Delivery options rather than here. */
export const DELIVERY_TOPICS = ['delivery_time', 'delivery_area'];

export function sectionOfTopic(topic: string | null): Section | null {
  return topic ? (SHOP_INFO_TOPICS[topic] ?? null) : null;
}

export function weekFrom(raw: ShopInfo['opening_hours']): Week | null {
  if (!raw) return null;
  return Object.fromEntries(
    DAYS.map((day) => [day, (raw[day] ?? []).map((r): Range => [r[0] ?? '', r[1] ?? ''])]),
  ) as Week;
}

export function defaultWeek(): Week {
  return applyToAll([DEFAULT_RANGE]);
}

export function applyToAll(ranges: Range[]): Week {
  return Object.fromEntries(
    DAYS.map((day) => [day, ranges.map((r): Range => [r[0], r[1]])]),
  ) as Week;
}

/** Whether all seven days have the same ranges; the page's "Same every day" shows then. */
export function isSameEveryDay(week: Week): boolean {
  const first = JSON.stringify(week.sat);
  return DAYS.every((day) => JSON.stringify(week[day]) === first);
}

export type Policy = { mode: 'none' | 'days'; days: string; conditions: string };

export function policyFrom(days: number | null, conditions: string | null): Policy {
  if (days === null || days === 0) return { mode: 'none', days: '', conditions: '' };
  return { mode: 'days', days: String(days), conditions: conditions ?? '' };
}

/** 0 means "not accepted", and a positive number is a day count; NaN is an unfinished number. */
export function policyDays(policy: Policy): number {
  if (policy.mode === 'none') return 0;
  const days = Number(policy.days);
  return Number.isInteger(days) && days >= 1 && days <= 60 ? days : Number.NaN;
}

export interface Draft {
  hours: Week | null;
  sameEveryDay: boolean;
  hoursNote: string;
  exchange: Policy;
  returns: Policy;
  refund: string;
}

export function draftFrom(info: ShopInfo): Draft {
  const hours = weekFrom(info.opening_hours);
  return {
    hours,
    sameEveryDay: hours ? isSameEveryDay(hours) : true,
    hoursNote: info.hours_note ?? '',
    exchange: policyFrom(info.exchange_days, info.exchange_conditions),
    returns: policyFrom(info.return_days, info.return_conditions),
    refund: info.refund_note ?? '',
  };
}

const text = (value: string) => value.trim() || null;

/** Only what differs from what the server holds; the PATCH leaves every other field alone. */
export function changesFrom(draft: Draft, info: ShopInfo): ShopInfoUpdate {
  const changes: ShopInfoUpdate = {};
  const set = <K extends keyof ShopInfoUpdate>(key: K, next: ShopInfoUpdate[K]) => {
    const current = (info as unknown as Record<string, unknown>)[key] ?? null;
    if (JSON.stringify(current) !== JSON.stringify(next ?? null)) changes[key] = next;
  };
  set('opening_hours', draft.hours);
  set('hours_note', text(draft.hoursNote));
  set('exchange_days', policyDays(draft.exchange));
  set(
    'exchange_conditions',
    draft.exchange.mode === 'days' ? text(draft.exchange.conditions) : null,
  );
  set('return_days', policyDays(draft.returns));
  set('return_conditions', draft.returns.mode === 'days' ? text(draft.returns.conditions) : null);
  set('refund_note', text(draft.refund));
  return changes;
}

const SECTION_OF_FIELD: Record<string, Section> = {
  opening_hours: 'hours',
  hours_note: 'hours',
  exchange_days: 'returns',
  exchange_conditions: 'returns',
  return_days: 'returns',
  return_conditions: 'returns',
  refund_note: 'returns',
};

export function sectionsChanged(changes: ShopInfoUpdate): Section[] {
  const sections = Object.keys(changes).flatMap((key) => SECTION_OF_FIELD[key] ?? []);
  return [...new Set(sections)];
}

/** What is answered in each section: `set` of `total` (the header's "2 of 3 set"). */
export function counts(
  info: ShopInfo,
  draft: Draft,
): Record<Section, { set: number; total: number }> {
  const flag = (value: boolean) => (value ? 1 : 0);
  return {
    hours: { set: flag(draft.hours !== null), total: 1 },
    payment: { set: flag(info.payment_accounts.length > 0), total: 1 },
    returns: {
      set: 2 + flag(draft.refund.trim() !== ''),
      total: 3,
    },
  };
}

/**
 * The API names a bad field at the start of its message ("opening_hours.mon[1]: Ranges must be in
 * order"). Split it so the hours editor can show it beside the day.
 */
export function fieldMessage(error: ApiError | null): { path: string; message: string } | null {
  const match = error?.message.match(/^([a-z_]+(?:\.[a-z]+)?(?:\[\d+\])?): (.+)$/);
  return match?.[1] && match[2] ? { path: match[1], message: match[2] } : null;
}

export function dayOfPath(path: string): Day | 'all' | null {
  const day = path.match(/^opening_hours\.([a-z]{3})/)?.[1];
  if (day && (DAYS as readonly string[]).includes(day)) return day as Day;
  return path === 'opening_hours' ? 'all' : null;
}
