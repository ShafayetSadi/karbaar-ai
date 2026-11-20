import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import type { components } from '../api/schema';
import { ActionButton, Button, Chip, Field, FormError, cx, fieldClass } from '../components/ui';
import { formatBDT, parseTaka, toTakaInput } from '../i18n/format';
import { DeliveryList } from '../productPage/DeliveryList';

export type DeliveryOption = components['schemas']['DeliveryOptionRead'];
type Zone = 'inside_dhaka' | 'outside_dhaka';

function zoneOf(value: FormDataEntryValue | null): Zone | null {
  return value === 'inside_dhaka' || value === 'outside_dhaka' ? value : null;
}

const MAX_DELIVERY_DAYS = 30;

/** Both day fields or neither, whole days in 0–30, the first no more than the second; `undefined` when invalid. */
export function parseDays(
  min: string,
  max: string,
): { delivery_days_min: number | null; delivery_days_max: number | null } | undefined {
  const a = min.trim();
  const b = max.trim();
  if (a === '' && b === '') return { delivery_days_min: null, delivery_days_max: null };
  if (!/^\d{1,2}$/.test(a) || !/^\d{1,2}$/.test(b)) return undefined;
  const low = Number(a);
  const high = Number(b);
  if (low > high || high > MAX_DELIVERY_DAYS) return undefined;
  return { delivery_days_min: low, delivery_days_max: high };
}

/** The delivery fees the merchant offers. The fee on an order is copied from here when it is made. */
export function DeliveryOptions() {
  const { t } = useTranslation();
  const [options, setOptions] = useState<DeliveryOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/delivery/options')).then((result) => {
      if (cancelled) return;
      if (result.ok) setOptions(result.data.items);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function replace(updated: DeliveryOption) {
    setOptions((current) => (current ?? []).map((o) => (o.id === updated.id ? updated : o)));
  }

  async function toggle(option: DeliveryOption) {
    setError(null);
    const result = await call(() =>
      api.PATCH('/v1/delivery/options/{option_id}', {
        params: { path: { option_id: option.id } },
        body: { is_active: !option.is_active },
      }),
    );
    if (result.ok) replace(result.data);
    else setError(result.error);
  }

  return (
    <div
      id="delivery-options"
      className="scroll-mt-20 rounded-lg border border-line bg-panel p-4 sm:p-6"
    >
      <h2 className="text-base font-semibold text-ink">{t('delivery.title')}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">{t('delivery.hint')}</p>

      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('delivery.loadFailed')}
        </p>
      )}
      {options?.length === 0 && (
        <p className="mt-4 text-sm text-ink-faint">{t('delivery.empty')}</p>
      )}
      <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
        {options?.map((option) =>
          editing === option.id ? (
            <li key={option.id} className="bg-panel-muted/50 p-4">
              <OptionForm
                option={option}
                onSaved={(saved) => {
                  replace(saved);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li
              key={option.id}
              className={cx(
                'flex flex-wrap items-center gap-x-3 gap-y-3 p-4',
                !option.is_active && 'bg-panel-muted/50',
              )}
            >
              <span className="min-w-0 basis-full break-words font-medium text-ink sm:basis-auto">
                {option.name}
              </span>
              <span className="font-mono text-sm text-ink">{formatBDT(option.fee_minor)}</span>
              {option.zone_hint && <Chip>{t(`delivery.zones.${option.zone_hint}`)}</Chip>}
              {option.delivery_days_min != null && option.delivery_days_max != null && (
                <span className="text-sm text-ink-muted">
                  {t('delivery.daysRange', {
                    min: option.delivery_days_min,
                    max: option.delivery_days_max,
                  })}
                </span>
              )}
              {!option.is_active && (
                <span className="text-sm text-ink-faint">{t('delivery.inactive')}</span>
              )}
              <span className="flex w-full flex-wrap gap-2 border-t border-line pt-3 sm:ml-auto sm:w-auto sm:border-0 sm:pt-0">
                <ActionButton onClick={() => setEditing(option.id)}>
                  {t('delivery.edit')}
                </ActionButton>
                <ActionButton onClick={() => void toggle(option)}>
                  {t(option.is_active ? 'delivery.deactivate' : 'delivery.activate')}
                </ActionButton>
              </span>
            </li>
          ),
        )}
      </ul>
      <FormError error={error} />

      <div className="mt-5 rounded-lg border border-line bg-panel-muted/40 p-4">
        <h3 className="text-sm font-medium text-ink">{t('delivery.add')}</h3>
        <div className="mt-3">
          <OptionForm
            onSaved={(created) => setOptions((current) => [...(current ?? []), created])}
          />
        </div>
      </div>

      {options?.some((o) => o.is_active) && <CustomerPreview options={options} />}
    </div>
  );
}

type PageDelivery = components['schemas']['ProductPageDeliveryRead'];

/** What the shop's active delivery options look like on the surfaces a customer actually reads:
 * the product page's delivery list, the order's delivery line, and what the sales assistant is
 * told. The product-page half reuses the product page's own rendering, so this cannot drift
 * from what customers really get. The fee is copied onto an order when it is made, so the
 * receipt line shows the option as it stands now. */
function CustomerPreview({ options }: { options: DeliveryOption[] }) {
  const { t } = useTranslation();
  const active = options.filter((o) => o.is_active);
  const zoneOf = (hint: string | null) => (hint ? t(`delivery.zones.${hint}`) : null);
  const forPage: PageDelivery[] = active.map((o) => ({
    name: o.name,
    fee_minor: o.fee_minor,
    fee_text: formatBDT(o.fee_minor),
    zone_text: zoneOf(o.zone_hint),
    eta_days_min: o.delivery_days_min,
    eta_days_max: o.delivery_days_max,
  }));
  const missingDays = active.some(
    (o) => o.delivery_days_min == null || o.delivery_days_max == null,
  );

  return (
    <div className="mt-5 rounded-lg border border-line bg-panel-muted/40 p-4">
      <h3 className="text-sm font-medium text-ink">{t('delivery.previewTitle')}</h3>
      {missingDays && (
        <p role="alert" className="mt-2 rounded-md bg-warn px-3 py-2 text-sm text-warn-ink">
          {t('delivery.addDays')}
        </p>
      )}
      <p className="mt-2 text-xs font-medium text-ink-muted">{t('delivery.previewProduct')}</p>
      <div className="mt-1">
        <DeliveryList delivery={forPage} />
      </div>
      <p className="mt-3 text-xs font-medium text-ink-muted">{t('delivery.previewReceipt')}</p>
      <ul className="mt-1 divide-y divide-line rounded-md border border-line bg-panel text-sm">
        {active.map((o) => (
          <li key={o.id} className="flex justify-between px-3 py-2">
            <span>{t('orders.deliveryFee', { name: o.name })}</span>
            <span className="font-mono">{formatBDT(o.fee_minor)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs font-medium text-ink-muted">{t('delivery.previewAgent')}</p>
      <ul className="mt-1 divide-y divide-line rounded-md border border-line bg-panel text-sm">
        {active.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="font-medium text-ink">{o.name}</span>
            <span className="font-mono text-sm text-ink">{formatBDT(o.fee_minor)}</span>
            {o.zone_hint && <Chip>{t(`delivery.zones.${o.zone_hint}`)}</Chip>}
            {o.delivery_days_min != null && o.delivery_days_max != null && (
              <span className="text-sm text-ink-muted">
                {t('delivery.daysRange', { min: o.delivery_days_min, max: o.delivery_days_max })}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OptionForm({
  option,
  onSaved,
  onCancel,
}: {
  option?: DeliveryOption;
  onSaved: (saved: DeliveryOption) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [feeError, setFeeError] = useState<string | undefined>();
  const [daysError, setDaysError] = useState<string | undefined>();
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get('name') ?? '').trim();
    const fee = parseTaka(String(form.get('fee') ?? ''));
    if (fee === null) return void setFeeError(t('delivery.invalidFee'));
    setFeeError(undefined);
    const days = parseDays(String(form.get('daysMin') ?? ''), String(form.get('daysMax') ?? ''));
    if (days === undefined) return void setDaysError(t('delivery.invalidDays'));
    setDaysError(undefined);
    setBusy(true);
    setError(null);
    const body = { name, fee_minor: fee, zone_hint: zoneOf(form.get('zone')), ...days };
    const result = await call(() =>
      option
        ? api.PATCH('/v1/delivery/options/{option_id}', {
            params: { path: { option_id: option.id } },
            body,
          })
        : api.POST('/v1/delivery/options', { body }),
    );
    setBusy(false);
    if (result.ok) {
      if (!option) formElement.reset();
      onSaved(result.data);
    } else {
      setError(result.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Field
        label={t('delivery.name')}
        name="name"
        required
        maxLength={100}
        defaultValue={option?.name}
        autoComplete="off"
        error={error?.fields.name}
      />
      <Field
        label={t('delivery.fee')}
        name="fee"
        inputMode="decimal"
        required
        defaultValue={option ? toTakaInput(option.fee_minor) : undefined}
        autoComplete="off"
        error={feeError ?? error?.fields.fee_minor}
      />
      <label className="block text-sm font-medium text-ink-muted">
        {t('delivery.zone')}
        <select
          name="zone"
          defaultValue={option?.zone_hint ?? ''}
          className={cx('mt-1 block w-full', fieldClass)}
        >
          <option value="">{t('delivery.zones.none')}</option>
          <option value="inside_dhaka">{t('delivery.zones.inside_dhaka')}</option>
          <option value="outside_dhaka">{t('delivery.zones.outside_dhaka')}</option>
        </select>
      </label>
      <Field
        label={t('delivery.daysMin')}
        name="daysMin"
        inputMode="numeric"
        defaultValue={option?.delivery_days_min ?? undefined}
        autoComplete="off"
        error={daysError ?? error?.fields.delivery_days_min}
      />
      <Field
        label={t('delivery.daysMax')}
        name="daysMax"
        inputMode="numeric"
        defaultValue={option?.delivery_days_max ?? undefined}
        autoComplete="off"
        error={error?.fields.delivery_days_max}
      />
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-1">
        <Button type="submit" busy={busy}>
          {t(option ? 'delivery.save' : 'delivery.addButton')}
        </Button>
        {onCancel && <ActionButton onClick={onCancel}>{t('delivery.cancel')}</ActionButton>}
      </div>
      <p className="text-xs text-ink-faint sm:col-span-2 xl:col-span-3">{t('delivery.daysHint')}</p>
      <div className="sm:col-span-2 xl:col-span-3">
        <FormError error={error} />
      </div>
    </form>
  );
}
