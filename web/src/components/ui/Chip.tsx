import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from './cx';

const TONES = {
  neutral: 'border-line bg-panel-muted text-ink-muted',
  ai: 'border-ai-ink/20 bg-ai text-ai-ink',
  team: 'border-team-ink/20 bg-team text-team-ink',
  warn: 'border-warn-ink/25 bg-warn text-warn-ink',
  ok: 'border-ok-ink/20 bg-ok text-ok-ink',
  danger: 'border-danger-ink/25 bg-danger text-danger-ink',
};

export type ChipTone = keyof typeof TONES;

/** A small status label: handler, wait time, escalation reason, counts. */
export function Chip({
  tone = 'neutral',
  icon: Icon,
  mono,
  className,
  children,
}: {
  tone?: ChipTone;
  icon?: LucideIcon;
  mono?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs leading-none font-medium whitespace-nowrap',
        mono && 'font-mono',
        TONES[tone],
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-3" />}
      {children}
    </span>
  );
}

/** A keyboard hint, like the `/` that focuses search. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-xs text-ink-muted">
      {children}
    </kbd>
  );
}
