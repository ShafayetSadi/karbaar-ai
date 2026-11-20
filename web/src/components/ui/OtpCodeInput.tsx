import { useRef } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { cx } from './cx';
import { fieldClass } from './forms';
import { otpDigits } from './phone';

function placeDigit(current: string, index: number, digit: string): string {
  const chars = Array.from({ length: 6 }, (_, i) => current[i] ?? '');
  chars[index] = digit;
  return chars.join('').replace(/\D/g, '').slice(0, 6);
}

/** Six boxes. Pasting or an SMS autofill of the whole code fills every box. Bangla digits are accepted. */
export function OtpCodeInput({
  value,
  onChange,
  label,
  digitLabel,
  disabled,
}: {
  value: string;
  onChange: (code: string) => void;
  label: string;
  digitLabel: (n: number) => string;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function focusAt(index: number) {
    refs.current[Math.max(0, Math.min(index, 5))]?.focus();
  }

  function apply(next: string, focusIndex: number) {
    const code = otpDigits(next);
    onChange(code);
    focusAt(focusIndex);
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = otpDigits(event.clipboardData.getData('text'));
    if (pasted.length === 0) return;
    event.preventDefault();
    apply(pasted, pasted.length - 1);
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !value[index] && index > 0) {
      event.preventDefault();
      apply(placeDigit(value, index - 1, ''), index - 1);
    }
    if (event.key === 'ArrowLeft') focusAt(index - 1);
    if (event.key === 'ArrowRight') focusAt(index + 1);
  }

  return (
    <div role="group" aria-label={label} className="flex justify-between gap-2">
      {Array.from({ length: 6 }, (_, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          value={value[index] ?? ''}
          aria-label={digitLabel(index + 1)}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={index === 0 ? 6 : 1}
          disabled={disabled}
          onPaste={onPaste}
          onKeyDown={(event) => onKeyDown(index, event)}
          onChange={(event) => {
            const entered = otpDigits(event.target.value);
            if (entered.length > 1) {
              apply(entered, entered.length - 1);
              return;
            }
            apply(placeDigit(value, index, entered), entered ? index + 1 : index);
          }}
          className={cx('h-12 min-w-0 flex-1 px-0 text-center font-mono text-lg', fieldClass)}
        />
      ))}
    </div>
  );
}
