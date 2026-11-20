import { useTranslation } from 'react-i18next';
import { Field, cx, fieldClass } from '../../components/ui';

export interface PricingValue {
  price: string;
  regular: string;
  /** In kg, as typed. */
  weight: string;
  /** In cm, as typed. */
  length: string;
  width: string;
  height: string;
}

export interface PricingErrors {
  price?: string;
  regular?: string;
  weight?: string;
  dimensions?: string;
}

function TakaInput({
  id,
  label,
  ariaLabel,
  value,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  ariaLabel: string;
  value: string;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-muted">
        {label}
      </label>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-semibold text-ink-muted">
          ৳
        </span>
        <input
          id={id}
          value={value}
          inputMode="decimal"
          placeholder="0.00"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={cx('block w-full pl-8', fieldClass)}
        />
      </div>
      {error && <span className="mt-1 block text-sm font-normal text-danger-ink">{error}</span>}
    </div>
  );
}

/**
 * Price, sale price, weight and size: the same fields on the new product page and on the
 * existing product page. Controlled; the page owns the values and checks them.
 */
export function PricingFields({
  value,
  errors,
  disabled,
  onChange,
}: {
  value: PricingValue;
  errors?: PricingErrors;
  disabled?: boolean;
  onChange: (value: PricingValue) => void;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<PricingValue>) => onChange({ ...value, ...patch });
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TakaInput
          id="base-price-input"
          label={`${t('editor.basePrice')} *`}
          ariaLabel={t('editor.price')}
          value={value.price}
          error={errors?.price}
          disabled={disabled}
          onChange={(price) => set({ price })}
        />
        <TakaInput
          id="sale-price-input"
          label={t('editor.salePrice')}
          ariaLabel={t('editor.regularPriceAll')}
          value={value.regular}
          error={errors?.regular}
          disabled={disabled}
          onChange={(regular) => set({ regular })}
        />
      </div>
      <p className="text-xs leading-relaxed text-ink-faint">{t('editor.priceHelp')}</p>
      <Field
        label={t('editor.weightKg')}
        value={value.weight}
        inputMode="decimal"
        placeholder="e.g. 0.5"
        error={errors?.weight}
        disabled={disabled}
        onChange={(e) => set({ weight: e.target.value })}
      />
      <div>
        <span className="block text-sm font-medium text-ink-muted">{t('editor.dimensionsCm')}</span>
        <div className="mt-1 flex items-center gap-2">
          {(
            [
              ['length', 'L', 'editor.lengthCm'],
              ['width', 'W', 'editor.widthCm'],
              ['height', 'H', 'editor.heightCm'],
            ] as const
          ).map(([key, placeholder, label], i) => (
            <div key={key} className="flex min-w-0 flex-1 items-center gap-2">
              {i > 0 && <span className="text-ink-faint">×</span>}
              <input
                value={value[key]}
                placeholder={placeholder}
                inputMode="decimal"
                disabled={disabled}
                aria-label={t(label)}
                onChange={(e) => set({ [key]: e.target.value })}
                className={cx('block w-full text-center', fieldClass)}
              />
            </div>
          ))}
        </div>
        {errors?.dimensions ? (
          <span className="mt-1 block text-sm text-danger-ink">{errors.dimensions}</span>
        ) : (
          <p className="mt-1 text-xs text-ink-faint">{t('editor.dimensionsHelp')}</p>
        )}
      </div>
    </>
  );
}
