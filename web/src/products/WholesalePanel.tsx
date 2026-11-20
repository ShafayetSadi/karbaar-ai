import { useTranslation } from 'react-i18next';
import { ActionButton, Field } from '../components/ui';
import { formatBDT } from '../i18n/format';
import {
  MAX_ORDER_QUANTITY,
  MAX_PRICE_TIERS,
  tierExample,
  type QuantityDraft,
  type QuantityProblem,
  type TierDraft,
  type TierProblem,
} from './wholesale';

export interface VariantTiers {
  id: string;
  label: string;
  rows: TierDraft[];
}

interface Props {
  quantity: QuantityDraft;
  onQuantity: (next: QuantityDraft) => void;
  quantityProblem?: QuantityProblem;
  /** The one table every variant uses. */
  tiers: TierDraft[];
  onTiers: (next: TierDraft[]) => void;
  tierProblem?: TierProblem;
  /** Per-variant tables; left out on a product not created yet (it has no variants to name). */
  variants?: VariantTiers[];
  perVariant?: boolean;
  onPerVariant?: (perVariant: boolean) => void;
  onVariantRows?: (variantId: string, rows: TierDraft[]) => void;
  disabled?: boolean;
}

/** Minimum and maximum per order, and the quantity price table ("6+ pcs ৳380 each"). */
export function WholesalePanel({
  quantity,
  onQuantity,
  quantityProblem,
  tiers,
  onTiers,
  tierProblem,
  variants,
  perVariant = false,
  onPerVariant,
  onVariantRows,
  disabled,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="grid max-w-sm grid-cols-2 gap-3">
        <Field
          label={t('wholesale.min')}
          value={quantity.min}
          inputMode="numeric"
          maxLength={5}
          disabled={disabled}
          onChange={(e) => onQuantity({ ...quantity, min: e.target.value })}
        />
        <Field
          label={t('wholesale.max')}
          value={quantity.max}
          inputMode="numeric"
          maxLength={5}
          disabled={disabled}
          onChange={(e) => onQuantity({ ...quantity, max: e.target.value })}
        />
      </div>
      <p className="text-sm text-ink-faint">{t('wholesale.quantityHint')}</p>
      {quantityProblem && (
        <p role="alert" className="text-sm text-danger-ink">
          {t(`wholesale.problem.${quantityProblem}`, { max: MAX_ORDER_QUANTITY })}
        </p>
      )}

      <div className="space-y-3">
        <h3 className="font-medium text-ink">{t('wholesale.tiers')}</h3>
        <p className="text-sm text-ink-muted">{t('wholesale.tiersHint')}</p>
        {!perVariant && <TierTable rows={tiers} onChange={onTiers} disabled={disabled} />}
        {variants && onPerVariant && (
          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={perVariant}
              disabled={disabled}
              onChange={(e) => onPerVariant(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{t('wholesale.perVariant')}</span>
              <span className="block text-ink-muted">{t('wholesale.perVariantHint')}</span>
            </span>
          </label>
        )}
        {perVariant &&
          variants?.map((variant) => (
            <div key={variant.id} className="space-y-2 rounded-md border border-line p-3">
              <p className="text-sm font-medium text-ink">{variant.label}</p>
              <TierTable
                rows={variant.rows}
                onChange={(rows) => onVariantRows?.(variant.id, rows)}
                disabled={disabled}
                name={variant.label}
              />
            </div>
          ))}
        {!variants && <p className="text-sm text-ink-faint">{t('wholesale.perVariantLater')}</p>}
        {tierProblem && (
          <p role="alert" className="text-sm text-danger-ink">
            {t(`wholesale.problem.${tierProblem}`, {
              max: tierProblem === 'tierTooMany' ? MAX_PRICE_TIERS : MAX_ORDER_QUANTITY,
            })}
          </p>
        )}
        <p className="rounded-md bg-warn p-3 text-sm text-warn-ink">{t('wholesale.public')}</p>
      </div>
    </div>
  );
}

function TierTable({
  rows,
  onChange,
  disabled,
  name,
}: {
  rows: TierDraft[];
  onChange: (rows: TierDraft[]) => void;
  disabled?: boolean;
  /** Whose table this is, for the accessible names when several are shown. */
  name?: string;
}) {
  const { t } = useTranslation();
  const set = (index: number, patch: Partial<TierDraft>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-sm text-ink-faint">{t('wholesale.noTiers')}</p>}
      <ul className="space-y-2">
        {rows.map((row, index) => {
          const example = tierExample(row);
          const prefix = name ? `${name}: ` : '';
          return (
            <li key={index} className="flex flex-wrap items-end gap-3">
              <div className="w-28">
                <Field
                  label={t('wholesale.fromQuantity')}
                  aria-label={`${prefix}${t('wholesale.fromQuantity')} ${index + 1}`}
                  value={row.quantity}
                  inputMode="numeric"
                  maxLength={5}
                  disabled={disabled}
                  onChange={(e) => set(index, { quantity: e.target.value })}
                />
              </div>
              <div className="w-32">
                <Field
                  label={t('wholesale.priceEach')}
                  aria-label={`${prefix}${t('wholesale.priceEach')} ${index + 1}`}
                  value={row.price}
                  inputMode="decimal"
                  disabled={disabled}
                  onChange={(e) => set(index, { price: e.target.value })}
                />
              </div>
              <span className="pb-2 font-mono text-xs text-ink-muted tabular-nums">
                {example &&
                  t('wholesale.example', {
                    quantity: example.quantity,
                    total: formatBDT(example.totalMinor),
                  })}
              </span>
              <ActionButton
                tone="ghost"
                size="sm"
                disabled={disabled}
                className="mb-1"
                aria-label={`${prefix}${t('wholesale.removeTier')} ${index + 1}`}
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                {t('wholesale.removeTier')}
              </ActionButton>
            </li>
          );
        })}
      </ul>
      <ActionButton
        disabled={disabled || rows.length >= MAX_PRICE_TIERS}
        onClick={() => onChange([...rows, { quantity: '', price: '' }])}
      >
        {t('wholesale.addTier')}
      </ActionButton>
    </div>
  );
}
