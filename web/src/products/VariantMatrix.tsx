import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ActionButton, Field, fieldClass, cx } from '../components/ui';
import { MAX_VARIANTS, discountPercent, type MatrixRow, type OptionDraft } from './options';
import { formatPercent, parseTaka } from '../i18n/format';

/** What the merchant typed into one generated row. Unset fields fall back to the shared values. */
export interface RowEdit {
  price?: string;
  regular?: string;
  stock?: string;
  sku?: string;
  weight?: string;
}

export interface RowErrors {
  price?: string;
  regular?: string;
  stock?: string;
  weight?: string;
}

const MAX_OPTIONS = 10;
const SUGGESTED_ATTRIBUTES = ['Size', 'Colour', 'Material', 'Style'];

export interface VariantMatrixProps {
  options: OptionDraft[];
  onOptions: (options: OptionDraft[]) => void;
  basePrice: string;
  onBasePrice: (price: string) => void;
  baseError?: string;
  regularAll: string;
  onRegularAll: (price: string) => void;
  regularError?: string;
  weightAll: string;
  onWeightAll: (weight: string) => void;
  rows: MatrixRow[];
  count: number;
  overLimit: boolean;
  edits: Record<string, RowEdit>;
  onEdit: (key: string, patch: RowEdit) => void;
  onRemove: (key: string) => void;
  errors: Record<string, RowErrors>;
  disabled?: boolean;
  /** False for products that do not track stock: the stock column is left empty. */
  showStock?: boolean;
  /** When true, the shared price, sale price and weight fields are displayed in the pricing card above. */
  hideSharedFields?: boolean;
}

/** The option builder and the generated variant rows. State lives in the parent form. */
export function VariantMatrix(props: VariantMatrixProps) {
  const { t } = useTranslation();
  const {
    options,
    onOptions,
    rows,
    edits,
    errors,
    showStock = true,
    hideSharedFields = false,
  } = props;
  const hasOptions = options.some((o) => o.name.trim() && o.values.trim());

  const setOption = (index: number, patch: Partial<OptionDraft>) =>
    onOptions(options.map((o, i) => (i === index ? { ...o, ...patch } : o)));

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {options.map((option, index) => (
          <div
            key={index}
            className="rounded-lg border border-line bg-panel-muted/20 p-4 transition-colors"
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
              <div>
                <Field
                  label={t('editor.optionName')}
                  value={option.name}
                  placeholder="e.g. Size or Color"
                  onChange={(e) => setOption(index, { name: e.target.value })}
                />
                {!option.name && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {SUGGESTED_ATTRIBUTES.map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => setOption(index, { name: sug })}
                        className="rounded-full border border-line bg-panel px-2 py-0.5 text-xs text-ink-muted hover:border-active hover:text-ink"
                      >
                        + {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Field
                label={t('editor.optionValues', { name: option.name || t('editor.optionName') })}
                value={option.values}
                placeholder="e.g. S, M, L, XL"
                onChange={(e) => setOption(index, { values: e.target.value })}
              />
              <ActionButton
                tone="danger"
                icon={Trash2}
                onClick={() => onOptions(options.filter((_, i) => i !== index))}
              >
                {t('editor.removeOption')}
              </ActionButton>
            </div>
          </div>
        ))}
        {options.length < MAX_OPTIONS && (
          <ActionButton
            icon={Plus}
            aria-label={t('editor.addOption')}
            onClick={() => onOptions([...options, { name: '', values: '' }])}
            className="border-dashed hover:border-active"
          >
            + {t('editor.addAttribute', { defaultValue: 'Add attribute' })}
          </ActionButton>
        )}
      </div>

      {!hideSharedFields && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label={t('editor.price')}
            value={props.basePrice}
            inputMode="decimal"
            error={props.baseError}
            onChange={(e) => props.onBasePrice(e.target.value)}
          />
          <Field
            label={t('editor.regularPriceAll')}
            value={props.regularAll}
            inputMode="decimal"
            error={props.regularError}
            onChange={(e) => props.onRegularAll(e.target.value)}
          />
          <Field
            label={t('editor.weightAll')}
            value={props.weightAll}
            inputMode="numeric"
            onChange={(e) => props.onWeightAll(e.target.value)}
          />
        </div>
      )}

      {hasOptions && (
        <p
          role="status"
          className={cx(
            'text-sm font-medium',
            props.overLimit ? 'text-danger-ink' : 'text-ink-muted',
          )}
        >
          {props.overLimit
            ? t('editor.overLimit', { count: props.count, max: MAX_VARIANTS })
            : t('editor.matrixCount', { count: props.count, max: MAX_VARIANTS })}
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line bg-panel shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-panel-muted/40 text-xs font-medium text-ink-muted">
              <tr>
                <th className="px-3 py-2.5">{t('editor.variants')}</th>
                {hasOptions && <th className="px-3 py-2.5">{t('editor.rowPrice')} (৳)</th>}
                {hasOptions && (
                  <th className="px-3 py-2.5">
                    {t('editor.salePrice', { defaultValue: 'Sale price' })}
                  </th>
                )}
                {showStock && <th className="px-3 py-2.5">{t('editor.rowStock')}</th>}
                <th className="px-3 py-2.5">{t('editor.rowSku')}</th>
                <th className="px-3 py-2.5">{t('editor.rowWeight')}</th>
                {rows.length > 1 && (
                  <th className="px-3 py-2.5 text-right">
                    <span className="sr-only">{t('editor.removeRow')}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => {
                const edit = edits[row.key] ?? {};
                const rowErrors = errors[row.key] ?? {};
                const label = hasOptions ? Object.values(row.option_values).join(' / ') : '';
                const named = (field: string) =>
                  label ? t('editor.rowField', { field, row: label }) : field;
                return (
                  <tr key={row.key} className="transition-colors hover:bg-panel-muted/20">
                    <td className="px-3 py-2.5 font-medium text-ink whitespace-nowrap">
                      {label ? (
                        <span className="inline-flex items-center rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-ink">
                          {label}
                        </span>
                      ) : (
                        <span className="text-ink-muted">{t('stock.defaultVariant')}</span>
                      )}
                    </td>
                    {hasOptions && (
                      <td className="px-3 py-2.5 min-w-[120px]">
                        <RowInput
                          label={named(t('editor.rowPrice'))}
                          value={edit.price ?? props.basePrice}
                          error={rowErrors.price}
                          inputMode="decimal"
                          hint={discountBadge(
                            edit.price ?? props.basePrice,
                            edit.regular ?? props.regularAll,
                          )}
                          onChange={(price) => props.onEdit(row.key, { price })}
                        />
                      </td>
                    )}
                    {hasOptions && (
                      <td className="px-3 py-2.5 min-w-[120px]">
                        <RowInput
                          label={named(t('editor.rowRegular'))}
                          value={edit.regular ?? props.regularAll}
                          error={rowErrors.regular}
                          inputMode="decimal"
                          onChange={(regular) => props.onEdit(row.key, { regular })}
                        />
                      </td>
                    )}
                    {showStock ? (
                      <td className="px-3 py-2.5 min-w-[100px]">
                        <RowInput
                          label={named(t('editor.rowStock'))}
                          value={edit.stock ?? ''}
                          error={rowErrors.stock}
                          inputMode="numeric"
                          onChange={(stock) => props.onEdit(row.key, { stock })}
                        />
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5 min-w-[120px]">
                      <RowInput
                        label={named(t('editor.rowSku'))}
                        value={edit.sku ?? ''}
                        onChange={(sku) => props.onEdit(row.key, { sku })}
                      />
                    </td>
                    <td className="px-3 py-2.5 min-w-[100px]">
                      <RowInput
                        label={named(t('editor.rowWeight'))}
                        value={edit.weight ?? props.weightAll}
                        error={rowErrors.weight}
                        inputMode="numeric"
                        onChange={(weight) => props.onEdit(row.key, { weight })}
                      />
                    </td>
                    {rows.length > 1 && (
                      <td className="px-3 py-2.5 text-right">
                        <ActionButton
                          tone="danger"
                          size="sm"
                          icon={Trash2}
                          disabled={props.disabled}
                          onClick={() => props.onRemove(row.key)}
                        >
                          {t('editor.removeRow')}
                        </ActionButton>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RowInput({
  label,
  value,
  error,
  inputMode,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  hint?: string | null;
  inputMode?: 'decimal' | 'numeric';
  onChange: (value: string) => void;
}) {
  return (
    <span className="block">
      <input
        aria-label={label}
        placeholder={label.split(' (')[0]}
        value={value}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cx('block w-full', fieldClass)}
      />
      {hint && !error && <span className="mt-1 block text-sm text-ok-ink">{hint}</span>}
      {error && <span className="mt-1 block text-sm text-danger-ink">{error}</span>}
    </span>
  );
}

/** "−21%" while both prices parse and the regular one is higher; nothing otherwise. */
function discountBadge(price: string, regular: string): string | null {
  const percent = discountPercent(parseTaka(price), regular.trim() ? parseTaka(regular) : null);
  return percent === null ? null : `−${formatPercent(percent / 100)}`;
}
