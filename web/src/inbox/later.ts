/**
 * "Later" (snooze) times, always in Dhaka (UTC+6 all year, no daylight saving), whatever the
 * browser's own time zone. Pure, so the presets can be tested for a fixed "now".
 */

import { formatWeekdayDateTime, formatWeekdayTime } from '../i18n/format';

const DHAKA_OFFSET_MS = 6 * 60 * 60_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
/** The server refuses anything sooner than a minute or further than 90 days. */
export const MIN_LATER_MS = MINUTE;
export const MAX_LATER_MS = 90 * DAY;

export type LaterPreset = 'in30m' | 'in1h' | 'in3h' | 'tomorrow' | 'in3days' | 'inWeek';

/** How each preset's time reads: a time of day, a weekday and time, or a full date. */
export type LaterStyle = 'time' | 'weekday' | 'date';

export type LaterOption = { preset: LaterPreset; at: Date; style: LaterStyle };

/** 9:00 in Dhaka, `days` calendar days after the Dhaka day `now` falls on. */
function dhakaMorning(now: Date, days: number): Date {
  const wall = new Date(now.getTime() + DHAKA_OFFSET_MS);
  const morning = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + days, 9);
  return new Date(morning - DHAKA_OFFSET_MS);
}

export function laterOptions(now: Date): LaterOption[] {
  const after = (ms: number) => new Date(now.getTime() + ms);
  return [
    { preset: 'in30m', at: after(30 * MINUTE), style: 'time' },
    { preset: 'in1h', at: after(HOUR), style: 'time' },
    { preset: 'in3h', at: after(3 * HOUR), style: 'time' },
    { preset: 'tomorrow', at: dhakaMorning(now, 1), style: 'weekday' },
    { preset: 'in3days', at: dhakaMorning(now, 3), style: 'weekday' },
    { preset: 'inWeek', at: dhakaMorning(now, 7), style: 'date' },
  ];
}

/** A Dhaka time as a `datetime-local` value, `2026-10-11T09:00`. */
export function toDhakaInput(at: Date): string {
  return new Date(at.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 16);
}

/** A `datetime-local` value read as Dhaka time; null when it is not a complete one. */
export function fromDhakaInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - DHAKA_OFFSET_MS);
}

/** Whether the server will accept this time (with a little slack for the request's travel). */
export function isLaterAllowed(at: Date, now: Date): boolean {
  const ahead = at.getTime() - now.getTime();
  return ahead >= MIN_LATER_MS + 5_000 && ahead <= MAX_LATER_MS;
}

/** Put off until a time still ahead: hidden from Open until then. */
export function isSnoozed(snoozedUntil: string | null | undefined, now: number): boolean {
  return !!snoozedUntil && new Date(snoozedUntil).getTime() > now;
}

/** Was put off and its time has passed, and nobody has acted on it since. */
export function isBackFromLater(snoozedUntil: string | null | undefined, now: number): boolean {
  return !!snoozedUntil && new Date(snoozedUntil).getTime() <= now;
}

/** When a put-off conversation comes back: `Fri 9:00 AM` within the week, else with the date. */
export function formatLaterUntil(until: string, now: number): string {
  return new Date(until).getTime() - now < WEEK
    ? formatWeekdayTime(until)
    : formatWeekdayDateTime(until);
}
