import type { ReactNode } from 'react';
import { cx } from './cx';

export type FilterTab<T extends string> = {
  value: T;
  label: ReactNode;
  /** Shown beside the label; omitted when null or undefined. */
  count?: number | null;
  countLabel?: string;
  /**
   * `warn` is an amber pill, for something to do; `neutral` and `plain` are bare numbers and
   * `alert` a bare number in amber.
   */
  countTone?: 'neutral' | 'warn' | 'plain' | 'alert';
};

/**
 * Pill filter tabs over a single list: the chosen one has a lime tint, the one place besides
 * primary buttons, the active nav icon and focus rings where the accent shows. They are toggle buttons (`aria-pressed`) in a
 * group, not ARIA tabs: every option filters the same list instead of switching panels.
 */
export function FilterTabs<T extends string>({
  label,
  value,
  tabs,
  onChange,
  fill = false,
}: {
  label: string;
  value: T;
  tabs: FilterTab<T>[];
  onChange: (value: T) => void;
  /** Equal-width tabs spread across the whole row instead of a scrolling strip. */
  fill?: boolean;
}) {
  if (fill) {
    return (
      <div
        role="group"
        aria-label={label}
        className="grid auto-cols-fr grid-flow-col gap-1 px-2 pb-2"
      >
        {tabs.map((tab) => {
          const active = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(tab.value)}
              className={cx(
                'flex items-center justify-center gap-1 rounded-md px-1.5 py-1 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-active',
                active
                  ? 'bg-accent/20 font-medium text-ink'
                  : 'text-ink-muted hover:bg-ink/5 hover:text-ink',
              )}
            >
              {tab.label}
              <TabCount tab={tab} active={active} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    // A row too wide for a narrow pane scrolls sideways rather than wrapping.
    <div
      role="group"
      aria-label={label}
      className="flex gap-1 overflow-x-auto py-1 [scrollbar-width:none]"
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.value)}
            className={cx(
              'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-active',
              active
                ? 'bg-accent/20 font-medium text-ink'
                : 'text-ink-muted hover:bg-ink/5 hover:text-ink',
            )}
          >
            {tab.label}
            <TabCount tab={tab} active={active} />
          </button>
        );
      })}
    </div>
  );
}

function TabCount<T extends string>({ tab, active }: { tab: FilterTab<T>; active: boolean }) {
  if (tab.count == null) return null;
  return (
    <span
      aria-label={tab.countLabel}
      className={cx(
        'tabular-nums text-xs leading-5',
        tab.countTone === 'warn' &&
          'rounded border border-warn-ink/25 bg-warn px-1.5 text-warn-ink',
        tab.countTone === 'alert' && 'text-warn-ink',
        // Neutral counts are bare numbers too: a box inside the pill would crowd it.
        (tab.countTone === 'plain' || (tab.countTone ?? 'neutral') === 'neutral') &&
          (active ? 'text-ink-muted' : 'text-ink-faint'),
      )}
    >
      {tab.count}
    </span>
  );
}
