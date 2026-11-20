import { useTranslation } from 'react-i18next';
import { Field } from '../components/ui';
import {
  AVAILABILITIES,
  MAX_LEAD_TIME_DAYS,
  chooseAvailability,
  type AvailabilityDraft,
  type AvailabilityProblem,
} from './availability';

interface Props {
  draft: AvailabilityDraft;
  onChange: (next: AvailabilityDraft) => void;
  problem?: AvailabilityProblem;
  disabled?: boolean;
}

/** The three-way choice, the lead time and, for pre-orders, the optional cap on how many. */
export function AvailabilityPanel({ draft, onChange, problem, disabled }: Props) {
  const { t } = useTranslation();
  const notStock = draft.availability !== 'in_stock';
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="sr-only">{t('availability.title')}</legend>
        {AVAILABILITIES.map((value) => (
          <label key={value} className="flex items-start gap-2 text-sm text-ink">
            <input
              type="radio"
              name="availability"
              value={value}
              checked={draft.availability === value}
              onChange={() => onChange(chooseAvailability(draft, value))}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{t(`availability.mode.${value}`)}</span>
              <span className="block text-ink-muted">{t(`availability.modeHint.${value}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid max-w-sm grid-cols-2 gap-3">
        <Field
          label={t('availability.leadFrom')}
          value={draft.min}
          inputMode="numeric"
          maxLength={3}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, min: e.target.value })}
        />
        <Field
          label={t('availability.leadTo')}
          value={draft.max}
          inputMode="numeric"
          maxLength={3}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, max: e.target.value })}
        />
      </div>
      <p className="text-sm text-ink-faint">
        {notStock ? t('availability.leadHint') : t('availability.leadOptionalHint')}
      </p>
      {problem && (
        <p role="alert" className="text-sm text-danger-ink">
          {t(`availability.problem.${problem}`, { max: MAX_LEAD_TIME_DAYS })}
        </p>
      )}

      {notStock && (
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={draft.track}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, track: e.target.checked })}
            className="mt-1"
          />
          <span>
            <span className="font-medium">{t('availability.track')}</span>
            <span className="block text-ink-muted">{t('availability.trackHint')}</span>
          </span>
        </label>
      )}
    </div>
  );
}
