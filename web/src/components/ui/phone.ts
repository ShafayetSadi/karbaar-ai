const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Bangla digits become ASCII. Other characters stay. */
export function asciiDigits(raw: string): string {
  let out = '';
  for (const ch of raw) {
    const index = BANGLA_DIGITS.indexOf(ch);
    out += index >= 0 ? String(index) : ch;
  }
  return out;
}

/**
 * The digits shown beside the fixed +880 prefix: `1XXXXXXXXX`, at most 10.
 * Accepts `01…`, `1…`, `+8801…`, `8801…` and Bangla digits.
 */
export function nationalMobileInput(raw: string): string {
  let digits = asciiDigits(raw).replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('880')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.replace(/\D/g, '').slice(0, 10);
}

const NATIONAL = /^1[3-9]\d{8}$/;

/** `+8801[3-9]XXXXXXXX`, or null when the number is not a Bangladesh mobile. */
export function bdMobileE164(raw: string): string | null {
  const national = nationalMobileInput(raw);
  if (!NATIONAL.test(national)) return null;
  return `+880${national}`;
}

/** Up to six code digits, with Bangla digits translated. */
export function otpDigits(raw: string): string {
  return asciiDigits(raw).replace(/\D/g, '').slice(0, 6);
}
