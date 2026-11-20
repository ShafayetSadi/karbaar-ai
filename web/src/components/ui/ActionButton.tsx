import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ComponentProps } from 'react';
import { cx } from './cx';

const TONES = {
  neutral: 'border-line bg-panel text-ink hover:bg-panel-muted',
  primary: 'border-accent-strong bg-accent text-accent-ink hover:bg-accent-strong',
  danger: 'border-danger-ink/30 bg-panel text-danger-ink hover:bg-danger',
  'soft-ai': 'border-ai-ink/25 bg-ai text-ai-ink hover:border-ai-ink/50',
  'soft-ok': 'border-ok-ink/25 bg-ok text-ok-ink hover:border-ok-ink/50',
  ghost: 'border-transparent text-ink-muted hover:bg-panel-muted hover:text-ink',
};

const SIZES = {
  sm: 'gap-1 px-2 py-1 text-xs',
  md: 'gap-1.5 px-3 py-1.5 text-sm',
};

export type ActionTone = keyof typeof TONES;

/** The classes of an `ActionButton`, for a link that should look like one. */
export function actionButtonClass({
  tone = 'neutral',
  size = 'md',
}: { tone?: ActionTone; size?: keyof typeof SIZES } = {}) {
  return cx(
    'inline-flex items-center justify-center rounded-md border font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-active disabled:opacity-60',
    TONES[tone],
    SIZES[size],
  );
}

/** A compact button for in-page actions; `Button` is the full-width form submit. */
export function ActionButton({
  tone = 'neutral',
  size = 'md',
  icon: Icon,
  className,
  children,
  ...props
}: {
  tone?: ActionTone;
  size?: keyof typeof SIZES;
  icon?: LucideIcon;
} & ComponentProps<'button'>) {
  return (
    <button type="button" {...props} className={cx(actionButtonClass({ tone, size }), className)}>
      {Icon && <Icon aria-hidden className={size === 'sm' ? 'size-3.5' : 'size-4'} />}
      {children}
    </button>
  );
}

/** A square icon-only button; `label` is its accessible name and tooltip text. */
export function IconButton({
  icon: Icon,
  label,
  className,
  ...props
}: { icon: LucideIcon; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cx(
        'inline-flex size-8 items-center justify-center rounded-md border border-line bg-panel text-ink-muted hover:bg-panel-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-active disabled:opacity-60',
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}
