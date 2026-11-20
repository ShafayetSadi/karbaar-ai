import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cx } from './cx';

function readOpen(key: string | undefined, fallback: boolean) {
  if (!key) return fallback;
  try {
    const stored = localStorage.getItem(`section:${key}`);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    // Blocked storage: use the default.
  }
  return fallback;
}

/**
 * A collapsible side-panel section: icon, title, a mono summary and count on the right.
 * With `storageKey`, each viewer's open/closed choice is remembered on this device.
 */
export function Section({
  title,
  icon: Icon,
  summary,
  count,
  defaultOpen = true,
  storageKey,
  action,
  forceOpen = false,
  children,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  summary?: ReactNode;
  count?: number | null;
  defaultOpen?: boolean;
  storageKey?: string;
  /** A control beside the chevron (an edit pencil). Sits outside the trigger: no nested buttons. */
  action?: ReactNode;
  /** Show the content whatever the remembered choice, e.g. while an edit form is open. */
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpen(storageKey, defaultOpen));

  function toggle(next: boolean) {
    setOpen(next);
    if (!storageKey) return;
    try {
      localStorage.setItem(`section:${storageKey}`, next ? '1' : '0');
    } catch {
      // Not remembered; still toggles.
    }
  }

  return (
    <Collapsible.Root
      open={open || forceOpen}
      onOpenChange={toggle}
      className="relative border-b border-line"
    >
      <Collapsible.Trigger className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-panel-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-active">
        {Icon && <Icon aria-hidden className="size-4 text-ink-muted" />}
        <span className="flex-1 text-sm font-medium text-ink">{title}</span>
        {summary && <span className="truncate text-xs text-ink-faint">{summary}</span>}
        {count != null && count > 0 && (
          <span className="tabular-nums text-xs text-ink-muted">{count}</span>
        )}
        <ChevronDown
          aria-hidden
          className={cx(
            'size-4 text-ink-faint transition-transform',
            (open || forceOpen) && 'rotate-180',
          )}
        />
      </Collapsible.Trigger>
      {action && <div className="absolute top-2 right-10">{action}</div>}
      <Collapsible.Content className="px-4 pb-4">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}
