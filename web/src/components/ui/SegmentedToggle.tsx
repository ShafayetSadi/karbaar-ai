import type { LucideIcon } from 'lucide-react';
import { cx } from './cx';

export type Segment<T extends string> = { value: T; label: string; icon: LucideIcon };

/**
 * A small icon-only switch between views of the same content (table or grid). Toggle buttons
 * (`aria-pressed`) in a group, like `FilterTabs`; each option's `label` is its accessible name.
 */
export function SegmentedToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Segment<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-md border border-line bg-panel p-0.5"
    >
      {options.map(({ value: option, label: name, icon: Icon }) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            aria-label={name}
            title={name}
            onClick={() => onChange(option)}
            className={cx(
              'inline-flex size-7 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-active motion-safe:transition-colors',
              active ? 'bg-panel-muted text-ink' : 'text-ink-faint hover:text-ink',
            )}
          >
            <Icon aria-hidden className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
