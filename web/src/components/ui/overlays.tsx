import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as RadixPopover from '@radix-ui/react-popover';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { Check, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from './cx';

const SURFACE = 'z-50 rounded-lg border border-line bg-panel text-ink shadow-lg';

/** A floating panel anchored to `trigger` (a single focusable element). */
export function Popover({
  trigger,
  children,
  align = 'start',
  className,
  open,
  onOpenChange,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal
        container={document.querySelector<HTMLElement>('dialog[data-modal="true"]') ?? undefined}
      >
        <RadixPopover.Content
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cx(
            SURFACE,
            'max-h-[var(--radix-popover-content-available-height)] max-w-[calc(100vw-1rem)] overflow-y-auto p-3',
            className,
          )}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

export type MenuOption<T extends string> = { value: T; label: ReactNode; hint?: ReactNode };

/** A single-choice dropdown menu, e.g. the handler filter or the language switcher. */
export function SelectMenu<T extends string>({
  trigger,
  options,
  value,
  onChange,
  align = 'start',
}: {
  trigger: ReactNode;
  options: MenuOption<T>[];
  value: T;
  onChange: (value: T) => void;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal
        container={document.querySelector<HTMLElement>('dialog[data-modal="true"]') ?? undefined}
      >
        <DropdownMenu.Content align={align} sideOffset={6} className={cx(SURFACE, 'min-w-44 p-1')}>
          <DropdownMenu.RadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
            {options.map((option) => (
              <DropdownMenu.RadioItem
                key={option.value}
                value={option.value}
                className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-panel-muted"
              >
                <span className="flex size-4 items-center justify-center">
                  <DropdownMenu.ItemIndicator>
                    <Check aria-hidden className="size-4" />
                  </DropdownMenu.ItemIndicator>
                </span>
                <span className="flex-1">{option.label}</span>
                {option.hint && <span className="text-xs text-ink-faint">{option.hint}</span>}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * A menu of actions behind `trigger`, e.g. a row's or a page's `⋯`. Children are `MenuItem`s.
 */
export function Menu({
  trigger,
  children,
  align = 'end',
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal
        container={document.querySelector<HTMLElement>('dialog[data-modal="true"]') ?? undefined}
      >
        <DropdownMenu.Content align={align} sideOffset={6} className={cx(SURFACE, 'min-w-44 p-1')}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * One action in a `Menu`. With `asChild` the single child (a link) becomes the item, so a
 * navigation stays a real link.
 */
export function MenuItem({
  icon: Icon,
  onSelect,
  asChild,
  disabled,
  children,
}: {
  icon?: LucideIcon;
  onSelect?: () => void;
  asChild?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  const className =
    'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink outline-none select-none data-[highlighted]:bg-panel-muted data-[disabled]:text-ink-faint';
  if (asChild) {
    return (
      <DropdownMenu.Item asChild onSelect={onSelect} disabled={disabled} className={className}>
        {children}
      </DropdownMenu.Item>
    );
  }
  return (
    <DropdownMenu.Item onSelect={onSelect} disabled={disabled} className={className}>
      {Icon && <Icon aria-hidden className="size-4 text-ink-muted" />}
      {children}
    </DropdownMenu.Item>
  );
}

/** Wrap the app once so tooltips share one open/close delay. */
export const TooltipProvider = RadixTooltip.Provider;

export function Tooltip({
  content,
  children,
  side = 'right',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal
        container={document.querySelector<HTMLElement>('dialog[data-modal="true"]') ?? undefined}
      >
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 rounded-md bg-ink px-2 py-1 text-xs text-paper shadow"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
