import { LayoutGrid, Rows3, SlidersHorizontal, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ActionButton,
  Popover,
  SegmentedToggle,
  Tooltip,
  cx,
  fieldClass,
} from '../../components/ui';
import { SearchBox } from '../../inbox/SearchBox';
import { PRODUCT_TYPES, type ProductType } from '../presets';
import type { ViewMode } from './useViewMode';

/** The API refuses longer searches. */
const MAX_SEARCH = 200;

export type ListFilters = {
  q: string;
  type: ProductType | '';
  sort: 'newest' | 'stock';
};

/**
 * Search, the filters that rarely change (type, sort) behind one button, the view
 * switch, and a removable chip for each filter in effect.
 */
export function ListToolbar({
  filters,
  onSearch,
  onFilter,
  onClear,
  view,
  onView,
}: {
  filters: ListFilters;
  onSearch: (q: string) => void;
  onFilter: (key: 'type' | 'sort', value: string | null) => void;
  /** Drops type and sort in one URL change. */
  onClear: () => void;
  view: ViewMode;
  onView: (view: ViewMode) => void;
}) {
  const { t } = useTranslation();
  const { type, sort } = filters;
  const chips = [
    type && { key: 'type' as const, label: t(`productType.${type}`) },
    sort === 'stock' && { key: 'sort' as const, label: t('products.sortStock') },
  ].filter((chip) => !!chip);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <SearchBox
            value={filters.q}
            onSearch={onSearch}
            label={t('products.searchPlaceholder')}
            placeholder={t('products.searchPlaceholder')}
            maxLength={MAX_SEARCH}
          />
        </div>
        <Popover
          align="start"
          className="w-72 space-y-3"
          trigger={
            <ActionButton icon={SlidersHorizontal} className="py-2">
              <span className="max-sm:sr-only">{t('products.moreFilters')}</span>
              {chips.length > 0 && (
                <span className="rounded bg-accent/20 px-1.5 tabular-nums text-xs text-ink">
                  {chips.length}
                </span>
              )}
            </ActionButton>
          }
        >
          <FilterSelect
            label={t('products.filterType')}
            value={type}
            onChange={(value) => onFilter('type', value)}
            options={[
              { value: '', label: t('products.allTypes') },
              ...PRODUCT_TYPES.map((value) => ({ value, label: t(`productType.${value}`) })),
            ]}
          />
          <FilterSelect
            label={t('products.sort')}
            value={sort}
            onChange={(value) => onFilter('sort', value === 'stock' ? 'stock' : null)}
            options={[
              { value: 'newest', label: t('products.sortNewest') },
              { value: 'stock', label: t('products.sortStock') },
            ]}
          />
        </Popover>
        {/* The keyboard shortcuts show on hover or focus of the view switch. */}
        <Tooltip side="bottom" content={t('products.shortcuts')}>
          <div className="ml-auto">
            <SegmentedToggle
              label={t('products.view')}
              value={view}
              onChange={onView}
              options={[
                { value: 'table', label: t('products.viewTable'), icon: Rows3 },
                { value: 'grid', label: t('products.viewGrid'), icon: LayoutGrid },
              ]}
            />
          </div>
        </Tooltip>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-label={t('products.removeFilter', { name: chip.label })}
              onClick={() => onFilter(chip.key, null)}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-panel py-0.5 pr-1.5 pl-2.5 text-xs text-ink hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-active"
            >
              {chip.label}
              <X aria-hidden className="size-3 text-ink-faint" />
            </button>
          ))}
          {chips.length > 1 && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-medium text-active hover:underline"
            >
              {t('products.clearFilters')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-medium text-ink-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx('mt-1 block w-full', fieldClass)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
