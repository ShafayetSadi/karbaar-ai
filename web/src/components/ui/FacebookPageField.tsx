import type { InputHTMLAttributes } from 'react';
import { RequiredMark, fieldClass } from './forms';
import { cx } from './cx';

/** A pasted Facebook Page link. The hint shows the shape we accept; the page itself is not fetched. */
export function FacebookPageField({
  label,
  hint,
  error,
  ...input
}: { label: string; hint: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const hintId = `${input.name ?? 'facebook'}-hint`;
  return (
    <div>
      <label className="block text-sm font-medium text-ink-muted">
        {label}
        {input.required && <RequiredMark />}
        <input
          {...input}
          aria-invalid={error ? true : undefined}
          aria-describedby={hintId}
          placeholder={hint}
          className={cx('mt-1 block w-full', fieldClass)}
        />
      </label>
      <span id={hintId} className="mt-1 block text-xs font-normal text-ink-faint">
        {hint}
      </span>
      {error && <span className="mt-1 block text-sm font-normal text-danger-ink">{error}</span>}
    </div>
  );
}
