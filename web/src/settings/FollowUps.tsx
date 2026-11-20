import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import type { components } from '../api/schema';
import { FormError } from '../components/ui';
import type { StoreNotesAccess } from './StoreNotes';

type Settings = components['schemas']['FollowUpSettingsRead'];

/** The delays the merchant can pick, in minutes (the API takes 60 to 720). */
const DELAYS = [60, 120, 180, 240, 360, 480, 720];

/**
 * Whether a customer who goes quiet after a product answer gets one nudge from the AI agent, and
 * how long after. Off by default: an unwanted message costs goodwill.
 */
export function FollowUps({ access }: { access: StoreNotesAccess }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = access === 'edit';

  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/merchant/follow-up-settings')).then((result) => {
      if (cancelled) return;
      if (result.ok) setSettings(result.data);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: Settings) {
    setBusy(true);
    setError(null);
    const result = await call(() => api.PUT('/v1/merchant/follow-up-settings', { body: next }));
    setBusy(false);
    if (result.ok) setSettings(result.data);
    else setError(result.error);
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <h2 className="text-base font-semibold text-ink">{t('followUp.title')}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t('followUp.hint')}</p>
      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('followUp.loadFailed')}
        </p>
      )}
      {settings !== null && (
        <div className="mt-4 space-y-3">
          <FormError error={error} />
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-panel-muted/40 p-3 text-sm text-ink has-[:disabled]:cursor-default">
            <input
              type="checkbox"
              checked={settings.follow_up_enabled}
              disabled={!canEdit || busy}
              onChange={(e) => void save({ ...settings, follow_up_enabled: e.target.checked })}
              className="mt-1 size-4 shrink-0 accent-active"
            />
            <span>
              <span className="font-medium">{t('followUp.enable')}</span>
              <span className="block text-ink-muted">{t('followUp.enableHint')}</span>
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <span>{t('followUp.delay')}</span>
            <select
              value={settings.follow_up_delay_minutes}
              disabled={!canEdit || busy}
              onChange={(e) =>
                void save({ ...settings, follow_up_delay_minutes: Number(e.target.value) })
              }
              className="min-h-10 rounded-md border border-line bg-panel px-3 py-2 text-base sm:text-sm"
            >
              {DELAYS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {t('followUp.hours', { count: minutes / 60 })}
                </option>
              ))}
            </select>
          </label>
          {!canEdit && (
            <p className="text-sm text-ink-muted">
              {t(access === 'staff' ? 'followUp.ownerOnly' : 'followUp.verifyFirst')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
