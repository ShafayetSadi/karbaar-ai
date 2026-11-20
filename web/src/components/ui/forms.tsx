import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ApiError } from '../../api/errors';
import { AuthLayout } from './AuthLayout';
import { cx } from './cx';

/**
 * The look of a text input, textarea or select; add the width and margin where it is used.
 * 16px on phones, where iOS zooms into smaller inputs on focus; 14px from sm.
 */
export const fieldClass =
  'rounded-md border border-line bg-panel px-3 py-1.5 text-base font-normal sm:text-sm text-ink placeholder:text-ink-faint focus:border-active focus:ring-1 focus:ring-active focus:outline-none aria-[invalid=true]:border-danger-ink';

/** The star on a required field. CSS content keeps it out of the label's text and the input's name. */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="after:ml-0.5 after:content-['*'] after:text-danger-ink" />
  );
}

export function Field({
  label,
  error,
  ...input
}: { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm font-medium text-ink-muted">
      {label}
      {input.required && <RequiredMark />}
      <input
        {...input}
        aria-invalid={error ? true : undefined}
        className={cx('mt-1 block w-full', fieldClass)}
      />
      {error && <span className="mt-1 block text-sm font-normal text-danger-ink">{error}</span>}
    </label>
  );
}

export function Button({
  busy,
  children,
  ...props
}: { busy?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { t } = useTranslation();
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className="w-full rounded-md border border-accent-strong bg-accent px-4 py-2 font-medium text-accent-ink hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-active disabled:opacity-60"
    >
      {busy ? t('common.pleaseWait') : children}
    </button>
  );
}

export function FormError({ error }: { error: ApiError | null }) {
  // Field-level messages are shown next to their inputs; the rest goes here.
  if (!error || (error.code === 'VALIDATION_ERROR' && Object.keys(error.fields).length > 0)) {
    return null;
  }
  return (
    <p role="alert" className="rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
      {error.message}
    </p>
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <AuthLayout
      headline={t('auth.aside.headline')}
      sentence={t('auth.aside.sentence')}
      footer={footer}
    >
      <h1 className="text-2xl font-semibold text-ink [overflow-wrap:break-word] sm:text-3xl">
        {title}
      </h1>
      {subtitle && <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>}
      <div className="mt-8 space-y-4">{children}</div>
    </AuthLayout>
  );
}

/** `state` rides along in the router's history entry, for a page to read on arrival. */
export function TextLink({
  to,
  state,
  children,
}: {
  to: string;
  state?: unknown;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      state={state}
      className="rounded font-medium text-active underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-active"
    >
      {children}
    </Link>
  );
}
