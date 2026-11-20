import { useTranslation } from 'react-i18next';
import { Field, cx, fieldClass } from '../components/ui';
import { formatBDT } from '../i18n/format';
import {
  ADVANCE_POLICIES,
  type AdvancePolicy,
  type DeliveryDraft,
  type DeliveryProblem,
} from './delivery';

export interface PanelOption {
  id: string;
  name: string;
  fee_minor: number;
  is_active: boolean;
  /** Set when the shop gave a delivery time; the nudge hides once these exist. */
  delivery_days_min?: number | null;
  delivery_days_max?: number | null;
}

interface Props {
  draft: DeliveryDraft;
  onChange: (next: DeliveryDraft) => void;
  /** Null while the delivery options load. */
  options: PanelOption[] | null;
  problem?: DeliveryProblem;
  /** The product is limited to options that are all switched off. */
  unusable?: boolean;
  disabled?: boolean;
}

/** "Deliver with" (which options the product can use) and "Advance" (what to ask up front). */
export function DeliveryPanel({ draft, onChange, options, problem, unusable, disabled }: Props) {
  const { t } = useTranslation();
  const active = (options ?? []).filter((o) => o.is_active);

  function toggle(id: string, on: boolean) {
    onChange({
      ...draft,
      allowed: on ? [...draft.allowed, id] : draft.allowed.filter((other) => other !== id),
    });
  }

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-medium text-ink">{t('productDelivery.deliverWith')}</legend>
        <p className="text-sm text-ink-muted">{t('productDelivery.deliverWithHint')}</p>
        {options === null && <p className="text-sm text-ink-faint">{t('orders.loading')}</p>}
        {options !== null && active.length === 0 && (
          <p className="text-sm text-ink-faint">{t('productDelivery.noOptions')}</p>
        )}
        {active.map((option) => (
          <label key={option.id} className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={draft.allowed.includes(option.id)}
              onChange={(e) => toggle(option.id, e.target.checked)}
            />
            <span>
              {option.name} · {formatBDT(option.fee_minor)}
            </span>
          </label>
        ))}
        {problem === 'chooseOne' && (
          <p role="alert" className="text-sm text-danger-ink">
            {t('productDelivery.problem.chooseOne')}
          </p>
        )}
        {unusable && (
          <p role="alert" className="rounded-md bg-warn p-3 text-sm text-warn-ink">
            {t('productDelivery.unusable')}
          </p>
        )}
        {active.some((o) => o.delivery_days_min == null || o.delivery_days_max == null) && (
          <p className="rounded-md bg-warn p-3 text-sm text-warn-ink">
            {t('delivery.missingDays')}
          </p>
        )}
      </fieldset>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-ink">
          {t('productDelivery.advance')}
          <select
            value={draft.advance}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, advance: e.target.value as AdvancePolicy })}
            className={cx('mt-1 block w-full max-w-sm', fieldClass)}
          >
            {ADVANCE_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {t(`productDelivery.policy.${policy}`)}
              </option>
            ))}
          </select>
        </label>
        {draft.advance === 'fixed' && (
          <div className="max-w-sm">
            <Field
              label={t('productDelivery.fixedLabel')}
              value={draft.fixed}
              inputMode="decimal"
              disabled={disabled}
              error={
                problem === 'fixedInvalid' ? t('productDelivery.problem.fixedInvalid') : undefined
              }
              onChange={(e) => onChange({ ...draft, fixed: e.target.value })}
            />
          </div>
        )}
        <p className="text-sm text-ink-faint">{t('productDelivery.advanceHint')}</p>
      </div>
    </div>
  );
}
