import { useTranslation } from 'react-i18next';
import { Skeleton } from '../components/ui/Skeleton';
import { cx } from '../components/ui/cx';

/** The cards in lifecycle order. Each filters to exactly its one status, except All. */
export const STATUS_CARDS = [
  'all',
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'returned',
  'cancelled',
] as const;
export type StatusCard = (typeof STATUS_CARDS)[number];

/**
 * A row of status counts that filter the orders list. Toggle buttons in a labelled group, like
 * `FilterTabs`. `counts` is the all-time `by_status` map (absent status = zero); undefined while
 * loading or after a failure, which `failed` tells apart.
 */
export function StatusCards({
  active,
  counts,
  failed,
  onChange,
}: {
  /** The selected card, or null when an action pill is selected instead. */
  active: StatusCard | null;
  counts: Record<string, number> | undefined;
  failed: boolean;
  onChange: (value: StatusCard) => void;
}) {
  const { t } = useTranslation();
  const total = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : 0;
  return (
    // One segmented strip rather than seven cards: the counts read as a single line, so the list
    // starts higher. Too wide for a narrow screen, it scrolls sideways.
    <div
      role="group"
      aria-label={t('orders.statusCards')}
      className="flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-line bg-panel p-0.5 [scrollbar-width:none]"
    >
      {STATUS_CARDS.map((value) => {
        const selected = value === active;
        const count = counts ? (value === 'all' ? total : (counts[value] ?? 0)) : undefined;
        const label = t(`orders.tab.${value}`);
        const loading = !failed && count === undefined;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            aria-label={
              count === undefined ? label : `${label}, ${t('orders.cardCount', { count })}`
            }
            onClick={() => onChange(value)}
            className={cx(
              'flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-active motion-safe:transition-colors',
              selected
                ? 'bg-accent/20 font-medium text-ink'
                : 'text-ink-muted hover:bg-ink/5 hover:text-ink',
            )}
          >
            <span>{label}</span>
            {loading ? (
              <>
                <Skeleton className="h-3.5 w-4" />
                <span className="sr-only">{t('orders.loading')}</span>
              </>
            ) : (
              <span
                className={cx(
                  'text-xs tabular-nums',
                  selected ? 'text-ink' : count === 0 ? 'text-ink-faint/70' : 'text-ink-faint',
                )}
              >
                {count === undefined ? '—' : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
