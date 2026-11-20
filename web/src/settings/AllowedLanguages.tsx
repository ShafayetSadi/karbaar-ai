import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import type { components } from '../api/schema';
import { FormError } from '../components/ui';
import type { StoreNotesAccess } from './StoreNotes';

type Language = NonNullable<components['schemas']['AiSettingsRead']['reply_languages']>[number];

const LANGUAGES: readonly Language[] = ['bangla', 'banglish', 'english'];

/**
 * The languages Sowdagor AI may reply in. The AI still follows the customer's language, but only
 * within this set. At least one stays ticked, so the shop never has no language.
 */
export function AllowedLanguages({ access }: { access: StoreNotesAccess }) {
  const { t } = useTranslation();
  const [allowed, setAllowed] = useState<readonly Language[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = access === 'edit';

  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/merchant/ai-settings')).then((result) => {
      if (cancelled) return;
      if (!result.ok) return void setFailed(true);
      setAllowed(result.data.reply_languages ?? LANGUAGES);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(language: Language, on: boolean) {
    if (!allowed) return;
    const next = LANGUAGES.filter((l) => (l === language ? on : allowed.includes(l)));
    if (next.length === 0) return;
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.PUT('/v1/merchant/ai-settings', { body: { reply_languages: next } }),
    );
    setBusy(false);
    if (!result.ok) return void setError(result.error);
    setAllowed(result.data.reply_languages ?? LANGUAGES);
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <h2 className="text-base font-semibold text-ink">{t('allowedLanguages.title')}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t('allowedLanguages.hint')}</p>
      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('allowedLanguages.loadFailed')}
        </p>
      )}
      {allowed !== null && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <FormError error={error} />
          </div>
          {LANGUAGES.map((language) => {
            const checked = allowed.includes(language);
            return (
              <label
                key={language}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-panel-muted/40 p-3 text-sm text-ink has-[:disabled]:cursor-default"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!canEdit || busy || (checked && allowed.length === 1)}
                  onChange={(e) => void toggle(language, e.target.checked)}
                  className="mt-1 size-4 shrink-0 accent-active"
                />
                <span>
                  <span className="font-medium">{t(`allowedLanguages.${language}.name`)}</span>
                  <span className="block text-ink-muted">
                    {t(`allowedLanguages.${language}.example`)}
                  </span>
                </span>
              </label>
            );
          })}
          <p className="text-sm text-ink-muted sm:col-span-3">{t('allowedLanguages.lastOne')}</p>
          {!canEdit && (
            <p className="text-sm text-ink-muted sm:col-span-3">
              {t(
                access === 'staff' ? 'allowedLanguages.ownerOnly' : 'allowedLanguages.verifyFirst',
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
