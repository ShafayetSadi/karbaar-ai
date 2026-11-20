import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import { ActionButton, Field, FormError, cx, fieldClass } from '../components/ui';
import { parseTaka, toTakaInput } from '../i18n/format';

type Policy = 'none' | 'delivery_fee' | 'fixed' | 'full';
const POLICIES: Policy[] = ['none', 'delivery_fee', 'fixed', 'full'];

/**
 * The advance a product asks for when its own setting is "store default". The merchant
 * collects the money in their own bKash or Nagad and records it on the order; nothing is charged
 * here.
 */
export function AdvanceDefault() {
  const { t } = useTranslation();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [fixed, setFixed] = useState('');
  const [problem, setProblem] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/merchant/advance-settings')).then((result) => {
      if (cancelled) return;
      if (!result.ok) return void setFailed(true);
      setPolicy(result.data.default_advance_policy);
      setFixed(
        result.data.default_advance_fixed_minor === null
          ? ''
          : toTakaInput(result.data.default_advance_fixed_minor),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (policy === null) return;
    const amount = policy === 'fixed' ? parseTaka(fixed) : null;
    if (policy === 'fixed' && (amount === null || amount <= 0)) return void setProblem(true);
    setProblem(false);
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.PUT('/v1/merchant/advance-settings', {
        body: { default_advance_policy: policy, default_advance_fixed_minor: amount },
      }),
    );
    setBusy(false);
    setSaved(result.ok);
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <h2 className="text-base font-semibold text-ink">{t('advanceDefault.title')}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
        {t('advanceDefault.hint')}
      </p>
      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('advanceDefault.loadFailed')}
        </p>
      )}
      {policy !== null && (
        <div className="mt-4 space-y-3">
          <p
            role="status"
            className="rounded-md border border-line bg-panel-muted px-3 py-2 text-sm text-ink-muted"
          >
            {t(
              policy === 'full' ? 'paymentDelivery.codUnavailable' : 'paymentDelivery.codAvailable',
            )}
          </p>
          <FormError error={error} />
          <label className="block text-sm font-medium text-ink">
            {t('advanceDefault.label')}
            <select
              value={policy}
              disabled={busy}
              onChange={(e) => {
                setSaved(false);
                setPolicy(e.target.value as Policy);
              }}
              className={cx('mt-1 block w-full max-w-sm', fieldClass)}
            >
              {POLICIES.map((value) => (
                <option key={value} value={value}>
                  {t(`productDelivery.policy.${value}`)}
                </option>
              ))}
            </select>
          </label>
          {policy === 'fixed' && (
            <div className="max-w-sm">
              <Field
                label={t('productDelivery.fixedLabel')}
                value={fixed}
                inputMode="decimal"
                disabled={busy}
                error={problem ? t('productDelivery.problem.fixedInvalid') : undefined}
                onChange={(e) => {
                  setSaved(false);
                  setFixed(e.target.value);
                }}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <ActionButton tone="primary" disabled={busy} onClick={() => void save()}>
              {t('advanceDefault.save')}
            </ActionButton>
            {saved && !busy && (
              <span role="status" className="text-sm text-ok-ink">
                {t('editor.saved')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
