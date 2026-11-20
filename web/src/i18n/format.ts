import i18n from './index';

const TIME_ZONE = 'Asia/Dhaka';

// Bangla digits for `bn`, Latin digits for `en`.
function locale(): string {
  return i18n.language === 'bn' ? 'bn-BD' : 'en-BD';
}

/** Format integer minor units (poisha) as BDT, e.g. `৳1,250.50`. Display only: amounts stay integers everywhere else. */
export function formatBDT(minorUnits: number): string {
  return new Intl.NumberFormat(locale(), {
    style: 'currency',
    currency: 'BDT',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: minorUnits % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minorUnits / 100);
}

function asDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

/** Format a timestamp (ISO string or Date) in the merchant's Asia/Dhaka time zone. */
export function formatDateTime(value: string | Date): string {
  const date = asDate(value);
  const day = new Intl.DateTimeFormat(locale(), {
    dateStyle: 'medium',
    timeZone: TIME_ZONE,
  }).format(date);
  return `${day}, ${formatTime(date)}`;
}

/** Format a calendar date such as `2026-09-14` (a day in Dhaka) as a short date. */
export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeZone: TIME_ZONE }).format(
    new Date(`${isoDate}T12:00:00+06:00`),
  );
}

/**
 * A time of day in Dhaka, always 12-hour, e.g. `8:47 PM`. `timeStyle: 'short'` follows the
 * locale's hour cycle, and some clocks then print `20:47 PM`.
 */
export function formatTime(value: string | Date): string {
  return new Intl.DateTimeFormat(locale(), {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TIME_ZONE,
  }).format(asDate(value));
}

/** A weekday and time in Dhaka, e.g. `Fri 9:00 AM`. */
export function formatWeekdayTime(value: string | Date): string {
  return new Intl.DateTimeFormat(locale(), {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TIME_ZONE,
  }).format(asDate(value));
}

/** A weekday, date and time in Dhaka, e.g. `Thu, Oct 15, 9:00 AM`. */
export function formatWeekdayDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat(locale(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TIME_ZONE,
  }).format(asDate(value));
}

/** The calendar day (`2026-10-09`) a timestamp falls on in Dhaka; feeds `formatDate`. */
/** The Dhaka time of day as HH:MM, for comparing with the same time on another day. */
export function dhakaTime(value: Date | number): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: TIME_ZONE,
  }).format(value);
}

export function dhakaDay(value: string | Date | number): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: TIME_ZONE,
  }).format(typeof value === 'string' ? new Date(value) : value);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const UNITS = { en: { m: 'm', h: 'h', d: 'd' }, bn: { m: 'মি', h: 'ঘ', d: 'দি' } };

function units() {
  return i18n.language === 'bn' ? UNITS.bn : UNITS.en;
}

function elapsed(since: string | Date, now: number): number {
  return Math.max(0, now - (typeof since === 'string' ? new Date(since) : since).getTime());
}

/**
 * How long ago, compact: `1m`, `3h`, `2d` (Bangla digits and units for `bn`). From a week on it
 * is a short date instead. Never less than `1m`, so a fresh message does not read as zero.
 */
export function formatAge(since: string | Date, now = Date.now()): string {
  const ms = elapsed(since, now);
  const u = units();
  if (ms < HOUR) return `${formatInteger(Math.max(1, Math.floor(ms / MINUTE)))}${u.m}`;
  if (ms < DAY) return `${formatInteger(Math.floor(ms / HOUR))}${u.h}`;
  if (ms < 7 * DAY) return `${formatInteger(Math.floor(ms / DAY))}${u.d}`;
  return new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'short',
    timeZone: TIME_ZONE,
  }).format(typeof since === 'string' ? new Date(since) : since);
}

/** `formatAge` as a phrase, `3h ago`; from a week on it is just the date. */
export function formatAgo(since: string | Date, now = Date.now()): string {
  const age = formatAge(since, now);
  if (elapsed(since, now) >= 7 * DAY) return age;
  return i18n.language === 'bn' ? `${age} আগে` : `${age} ago`;
}

/** How long a customer has waited for a reply: `6m`, `1h 20m`, `2d 3h`. Two units at most. */
export function formatWaiting(since: string | Date, now = Date.now()): string {
  const ms = elapsed(since, now);
  const u = units();
  const n = formatInteger;
  if (ms < HOUR) return `${n(Math.max(1, Math.floor(ms / MINUTE)))}${u.m}`;
  if (ms < DAY) {
    const minutes = Math.floor((ms % HOUR) / MINUTE);
    const hours = `${n(Math.floor(ms / HOUR))}${u.h}`;
    return minutes ? `${hours} ${n(minutes)}${u.m}` : hours;
  }
  const hours = Math.floor((ms % DAY) / HOUR);
  const days = `${n(Math.floor(ms / DAY))}${u.d}`;
  return hours ? `${days} ${n(hours)}${u.h}` : days;
}

/** A compact duration remaining, e.g. `45m` or `1h 20m`, using the active language's digits. */
export function formatRemaining(until: string | Date, now = Date.now()): string {
  const ms = Math.max(0, (typeof until === 'string' ? new Date(until) : until).getTime() - now);
  const u = units();
  const n = formatInteger;
  if (ms < HOUR) return `${n(Math.max(1, Math.ceil(ms / MINUTE)))}${u.m}`;
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  const hours = `${n(Math.floor(ms / HOUR))}${u.h}`;
  return minutes ? `${hours} ${n(minutes)}${u.m}` : hours;
}

/** A Bangladesh number in E.164 (`+8801712345678`) as people write it: `01712-345678`. */
export function formatPhone(e164: string): string {
  const match = /^\+880(1\d{3})(\d{6})$/.exec(e164);
  return match ? `0${match[1]}-${match[2]}` : e164;
}

/** Format a ratio from 0 to 1 as a whole percent, e.g. `0.6` as `60%`. */
export function formatPercent(ratio: number): string {
  return new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: 0 }).format(
    ratio,
  );
}

/** Format a ratio that can pass 1, e.g. taps per card, with at most two decimals. */
export function formatDecimal(value: number): string {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(value);
}

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/**
 * Parse a taka amount typed by a person ("1,250", "1250.5", "১২৫০") into integer poisha.
 * Returns null for anything else, including more than two decimals: never round a price silently.
 */
export function parseTaka(input: string): number | null {
  const normalised = input
    .trim()
    .replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)))
    .replace(/,/g, '');
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(normalised);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/**
 * Parse a weight in kilograms typed by a person ("1.5", "0.25", "১.২") into whole grams.
 * Returns null for anything else, including more than three decimals (finer than a gram).
 */
export function parseKg(input: string): number | null {
  const normalised = input
    .trim()
    .replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)))
    .replace(/,/g, '');
  const match = /^(\d{1,5})(?:\.(\d{1,3}))?$/.exec(normalised);
  if (!match) return null;
  return Number(match[1]) * 1000 + Number((match[2] ?? '').padEnd(3, '0'));
}

/** Parse a whole number of units typed by a person ("5", "১২", "1,000"); null for anything else. */
export function parseCount(input: string): number | null {
  const normalised = input
    .trim()
    .replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)))
    .replace(/,/g, '');
  return /^\d{1,7}$/.test(normalised) ? Number(normalised) : null;
}

/** Integer poisha as the plain number a person edits ("1250" or "1250.50"), no symbol or commas. */
export function toTakaInput(minorUnits: number): string {
  const taka = Math.floor(minorUnits / 100);
  const poisha = minorUnits % 100;
  return poisha === 0 ? String(taka) : `${taka}.${String(poisha).padStart(2, '0')}`;
}

/** Format a whole number (units of stock) with the active language's digits and grouping. */
export function formatInteger(value: number): string {
  return new Intl.NumberFormat(locale()).format(value);
}

/**
 * Parse a stock change typed by a person ("5", "+5", "-3", "−3", "১২") into a non-zero integer.
 * Returns null for anything else, including decimals and zero.
 */
export function parseUnitChange(input: string): number | null {
  const normalised = input
    .trim()
    .replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)))
    .replace(/[−–]/g, '-')
    .replace(/,/g, '');
  const match = /^([+-]?)(\d{1,7})$/.exec(normalised);
  if (!match) return null;
  const units = Number(match[2]);
  if (units === 0) return null;
  return match[1] === '-' ? -units : units;
}

/** A Facebook locale such as `bn_BD` as a language name (no region) in the dashboard's language; the raw code if unknown. */
export function languageName(locale: string, displayLocale: string): string {
  try {
    return (
      new Intl.DisplayNames([displayLocale], { type: 'language' }).of(
        locale.split('_')[0] ?? locale,
      ) ?? locale
    );
  } catch {
    return locale;
  }
}

/** Format USD micro-units (the AI allowance), e.g. `$4.20`. Display only. */
export function formatUSDMicro(microUnits: number): string {
  return new Intl.NumberFormat(locale(), {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
  }).format(microUnits / 1_000_000);
}
