import type { ReactNode } from 'react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiError } from '../api/errors';
import { Field, cx, fieldClass } from '../components/ui';
import { useAddressAreas } from './addressAreas';
import type { FormValues } from './orderForm';

const OTHER = '__other__';

type AddressValues = Pick<FormValues, 'address' | 'district' | 'area' | 'areaCustom' | 'line'>;

/**
 * The delivery address as the customer wrote it, and the district, thana/upazila and address line
 * a courier needs. The district can be left to the server, which reads it from the text and asks
 * for it when the text does not name exactly one. An area the district does not list (a
 * neighbourhood like "Bashundhara") is typed under "Other".
 */
export function AddressFields({
  values,
  renderSuggestion,
  onChange,
  error,
}: {
  values: AddressValues;
  renderSuggestion?: (field: string) => ReactNode;
  onChange: (patch: Partial<AddressValues>) => void;
  error: ApiError | null;
}) {
  const { t, i18n } = useTranslation();
  const { districts, failed } = useAddressAreas();
  const districtErrorId = useId();
  const place = (p: { name: string; name_bn: string }) =>
    i18n.language === 'bn' ? p.name_bn : p.name;

  const areas = districts?.find((d) => d.district === values.district)?.areas ?? [];
  const listed = areas.some((a) => a.name === values.area);
  const loading = districts === null && !failed;
  // Typed by hand: chosen as "Other", not in the district's list, or the list did not load.
  const typed = failed || values.areaCustom || (!loading && values.area !== '' && !listed);
  const districtError =
    error?.code === 'DISTRICT_REQUIRED' ? t('errors.DISTRICT_REQUIRED') : error?.fields.district;

  return (
    <fieldset className="space-y-3">
      <label className="block text-sm font-medium text-ink-muted">
        {t('orders.form.address')}
        <textarea
          value={values.address}
          onChange={(e) => onChange({ address: e.target.value })}
          rows={3}
          maxLength={500}
          className={cx('mt-1 block w-full', fieldClass)}
        />
        {error?.fields.address_raw && (
          <span className="mt-1 block font-normal text-danger-ink">{error.fields.address_raw}</span>
        )}
      </label>
      {renderSuggestion?.('address')}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-ink-muted">
            {t('orders.form.district')}
            <select
              value={values.district}
              onChange={(e) => onChange({ district: e.target.value, area: '', areaCustom: false })}
              aria-invalid={districtError ? true : undefined}
              aria-describedby={districtError ? districtErrorId : undefined}
              className={cx('mt-1 block w-full', fieldClass)}
            >
              <option value="">{t('orders.form.detectDistrict')}</option>
              {districts?.map((d) => (
                <option key={d.district} value={d.district}>
                  {place({ name: d.district, name_bn: d.district_bn })}
                </option>
              ))}
              {!districts && values.district && (
                <option value={values.district}>{values.district}</option>
              )}
            </select>
          </label>
          {renderSuggestion?.('district')}
          {districtError && (
            <p id={districtErrorId} role="alert" className="mt-1 text-sm text-danger-ink">
              {districtError}
            </p>
          )}
        </div>
        <label className="block text-sm font-medium text-ink-muted">
          {t('orders.form.area')}
          <select
            value={typed ? OTHER : values.area}
            onChange={(e) =>
              onChange(
                e.target.value === OTHER
                  ? { area: listed ? '' : values.area, areaCustom: true }
                  : { area: e.target.value, areaCustom: false },
              )
            }
            disabled={loading}
            className={cx('mt-1 block w-full', fieldClass)}
          >
            <option value="">{t('orders.form.noArea')}</option>
            {areas.map((a) => (
              <option key={a.name} value={a.name}>
                {place(a)}
              </option>
            ))}
            <option value={OTHER}>{t('orders.form.otherArea')}</option>
          </select>
        </label>
      </div>
      {renderSuggestion?.('area')}
      {typed && (
        <Field
          label={t('orders.form.areaTyped')}
          value={values.area}
          onChange={(e) => onChange({ area: e.target.value })}
          maxLength={200}
          error={error?.fields.area}
        />
      )}
      <Field
        label={t('orders.form.addressLine')}
        value={values.line}
        onChange={(e) => onChange({ line: e.target.value })}
        maxLength={500}
        placeholder={t('orders.form.addressLineHint')}
        error={error?.fields.address_line}
      />
      {renderSuggestion?.('line')}
    </fieldset>
  );
}
