import { parseTaka } from '../i18n/format';

export type PriceMode = 'set' | 'amount' | 'percent';
export type Direction = 'down' | 'up';

export interface PriceChange {
  mode: PriceMode;
  amount_minor: number;
  /** Sent as a string so the server reads an exact decimal, never a float. */
  percent: string;
}

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/** What the bulk price form asks for, or null when the number cannot be read. */
export function priceChange(
  mode: PriceMode,
  direction: Direction,
  input: string,
): PriceChange | null {
  const sign = direction === 'down' ? -1 : 1;
  if (mode === 'percent') {
    const normalised = input.trim().replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)));
    const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(normalised);
    if (!match) return null;
    const value = `${match[1]}${match[2] ? `.${match[2]}` : ''}`;
    if (Number(value) === 0 || (direction === 'down' && Number(value) > 100)) return null;
    return { mode, amount_minor: 0, percent: `${sign < 0 ? '-' : ''}${value}` };
  }
  const minor = parseTaka(input);
  if (minor === null || (mode === 'amount' && minor === 0)) return null;
  return { mode, amount_minor: mode === 'set' ? minor : sign * minor, percent: '0' };
}
