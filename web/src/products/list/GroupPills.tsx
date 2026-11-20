import { useTranslation } from 'react-i18next';
import { cx } from '../../components/ui';
import type { Group } from '../groups';

/**
 * The shop's categories and collections as one scrolling row of toggle pills above the list.
 * Each set filters on its own: one category and one collection can be on at once.
 */
export function GroupPills({
  categories,
  collections,
  categoryId,
  collectionId,
  onFilter,
}: {
  categories: Group[];
  collections: Group[];
  categoryId: string;
  collectionId: string;
  onFilter: (key: 'category' | 'collection', value: string | null) => void;
}) {
  const { t } = useTranslation();
  if (categories.length === 0 && collections.length === 0) return null;
  return (
    <div className="flex items-center gap-4 overflow-x-auto pb-1 [scrollbar-width:none]">
      {categories.length > 0 && (
        <PillGroup
          label={t('products.filterCategories')}
          groups={categories}
          value={categoryId}
          onChange={(id) => onFilter('category', id)}
        />
      )}
      {categories.length > 0 && collections.length > 0 && (
        <span aria-hidden className="h-5 w-px shrink-0 bg-line" />
      )}
      {collections.length > 0 && (
        <PillGroup
          label={t('products.filterCollection')}
          groups={collections}
          value={collectionId}
          onChange={(id) => onFilter('collection', id)}
        />
      )}
    </div>
  );
}

function PillGroup({
  label,
  groups,
  value,
  onChange,
}: {
  label: string;
  groups: Group[];
  value: string;
  onChange: (id: string | null) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center gap-2">
      <span aria-hidden className="font-medium text-xs text-ink-faint">
        {label}
      </span>
      {groups.map((group) => {
        const on = value === group.id;
        return (
          <button
            key={group.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : group.id)}
            className={cx(
              'shrink-0 rounded-full border px-3 py-1 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-active motion-safe:transition-colors',
              on
                ? 'border-active/40 bg-accent/20 text-ink'
                : 'border-line bg-panel text-ink-muted hover:bg-panel-muted hover:text-ink',
            )}
          >
            {group.name}
          </button>
        );
      })}
    </div>
  );
}
