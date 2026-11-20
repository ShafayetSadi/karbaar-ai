import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import { ActionButton, Field, FormError } from '../components/ui';

const MAX_THRESHOLD = 10_000;

/**
 * When the product list calls a product "Low stock": any active variant at or below this many
 * units. It only labels and filters the list; orders are still checked against real stock.
 */
export function LowStockThreshold() {
  const { t } = useTranslation();
  const [value, setValue] = useState<string | null>(null);
  const [problem, setProblem] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/merchant/stock-settings')).then((result) => {
      if (cancelled) return;
      if (!result.ok) return void setFailed(true);
      setValue(String(result.data.low_stock_threshold));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (value === null) return;
    const threshold = /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
    if (!(threshold >= 0 && threshold <= MAX_THRESHOLD)) return void setProblem(true);
    setProblem(false);
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.PUT('/v1/merchant/stock-settings', { body: { low_stock_threshold: threshold } }),
    );
    setBusy(false);
    setSaved(result.ok);
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <h2 className="text-base font-semibold text-ink">{t('lowStock.title')}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">{t('lowStock.hint')}</p>
      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('lowStock.loadFailed')}
        </p>
      )}
      {value !== null && (
        <div className="mt-5 space-y-4">
          <FormError error={error} />
          <div className="max-w-sm">
            <Field
              label={t('lowStock.label')}
              value={value}
              inputMode="numeric"
              disabled={busy}
              error={problem ? t('lowStock.invalid') : undefined}
              onChange={(e) => {
                setSaved(false);
                setValue(e.target.value);
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <ActionButton tone="primary" disabled={busy} onClick={() => void save()}>
              {t('lowStock.save')}
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
