import type { InputHTMLAttributes } from 'react';
import { RequiredMark } from './forms';
import { cx } from './cx';
import { nationalMobileInput } from './phone';

// `fieldClass` includes `rounded-md`, which fights a one-sided radius. This is the same look.
const inputClass =
  'w-full rounded-l-none rounded-r-md border border-line bg-panel px-3 py-2 text-base font-normal text-ink placeholder:text-ink-faint focus:border-active focus:ring-1 focus:ring-active focus:outline-none aria-[invalid=true]:border-danger-ink';

/** A Bangladesh mobile, with a fixed +880 prefix. The value is the national digits (`1XXXXXXXXX`). */
export function PhoneField({
  label,
  error,
  value,
  onChange,
  ...input
}: {
  label: string;
  error?: string;
  value: string;
  onChange: (national: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  return (
    <label className="block text-sm font-medium text-ink-muted">
      {label}
      {input.required && <RequiredMark />}
      <span className="mt-1 flex">
        <span
          aria-hidden="true"
          className="inline-flex items-center rounded-l-md border border-r-0 border-line bg-panel-muted px-3 font-mono text-sm text-ink"
        >
          +880
        </span>
        <input
          {...input}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={value}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(nationalMobileInput(e.target.value))}
          className={cx(inputClass, input.className)}
        />
      </span>
      {error && <span className="mt-1 block text-sm font-normal text-danger-ink">{error}</span>}
    </label>
  );
}
