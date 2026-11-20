import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import { formatDateTime, formatUSDMicro } from '../i18n/format';

type Usage = {
  pause: string | null;
  allowance_micro_usd: number | null;
  remaining_micro_usd: number | null;
  resets_at: string | null;
};

/**
 * The shop's remaining monthly AI allowance and, when AI is paused, why and when it returns.
 * A platform pause shows no figure and no reset time. Manual work always stays available.
 */
export function AiUsage() {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/merchant/ai-usage')).then((result) => {
      if (cancelled) return;
      if (!result.ok) return void setFailed(true);
      setUsage(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <h3 className="text-sm font-semibold text-ink">{t('aiUsage.title')}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t('aiUsage.hint')}</p>
      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('aiUsage.loadFailed')}
        </p>
      )}
      {usage && (
        <div className="mt-4 space-y-3">
          {usage.remaining_micro_usd !== null && usage.allowance_micro_usd !== null && (
            <p className="text-sm text-ink">
              <span className="text-ink-muted">{t('aiUsage.remaining')}: </span>
              <span className="tabular-nums text-lg font-semibold">
                {formatUSDMicro(usage.remaining_micro_usd)}
              </span>{' '}
              <span className="text-ink-muted">
                {t('aiUsage.of', { total: formatUSDMicro(usage.allowance_micro_usd) })}
              </span>
            </p>
          )}
          {usage.pause && (
            <div role="status" className="rounded-md bg-warn px-3 py-2 text-sm text-warn-ink">
              <p>
                {t(`aiUsage.pause.${usage.pause}`, {
                  when: usage.resets_at ? formatDateTime(usage.resets_at) : '',
                })}
              </p>
              <p className="mt-1 size-4 shrink-0 accent-active">{t('aiUsage.manual')}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
