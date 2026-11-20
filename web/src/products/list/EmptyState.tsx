import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../../components/ui';

/** An icon, a line or two, and what to do next, in place of an empty list. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  tone = 'neutral',
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  tone?: 'neutral' | 'ok';
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line bg-panel px-6 py-12 text-center">
      <span
        className={cx(
          'flex size-12 items-center justify-center rounded-full',
          tone === 'ok' ? 'bg-ok text-ok-ink' : 'bg-panel-muted text-ink-muted',
        )}
      >
        <Icon aria-hidden className="size-6" />
      </span>
      <p className="mt-4 font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-ink-muted">{hint}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
