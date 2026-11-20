import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ActionButton, fieldClass, cx } from '../components/ui';
import type { StoreNotesAccess } from './StoreNotes';
import { useTakeoverSettings } from './useTakeoverSettings';

export function TakeoverSettings({ access }: { access: StoreNotesAccess }) {
  const { t } = useTranslation();
  const { settings, busy, error, update } = useTakeoverSettings();
  return (
    <section
      id="takeover-default"
      className="scroll-mt-20 rounded-lg border border-line bg-panel p-4 sm:p-6"
    >
      <h2 className="text-base font-semibold text-ink">{t('takeovers.title')}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t('takeovers.explanation')}</p>
      {settings && (
        <label className="mt-4 block max-w-sm space-y-2 text-sm text-ink">
          {t('takeovers.default')}
          <select
            className={cx(fieldClass, 'block')}
            value={settings.takeover_default_minutes ?? 'never'}
            disabled={access !== 'edit' || busy}
            onChange={(e) =>
              void update({
                takeover_default_minutes:
                  e.target.value === 'never' ? null : (Number(e.target.value) as 30 | 60 | 360),
              })
            }
          >
            {[30, 60, 360, 'never'].map((value) => (
              <option key={value} value={value}>
                {t(`takeovers.duration.${value}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger-ink">
          {error}
        </p>
      )}
    </section>
  );
}

export function TakeoverSuggestion() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const { settings, busy, error, update } = useTakeoverSettings();
  if (
    state.status !== 'authenticated' ||
    state.me.role !== 'owner' ||
    !settings ||
    settings.takeover_default_minutes !== null ||
    settings.takeover_hint_dismissed_at
  )
    return null;
  const verified = state.me.user.email_verified;
  return (
    <aside className="shrink-0 border-b border-line bg-panel-muted p-3 text-sm text-ink">
      <p>{t('takeovers.suggestion')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ActionButton
          size="sm"
          disabled={busy || !verified}
          onClick={() => void update({ takeover_default_minutes: 60, dismiss_takeover_hint: true })}
        >
          {t('takeovers.useHour')}
        </ActionButton>
        <Link to="/settings/ai#takeover-default" className="underline">
          {t('takeovers.settings')}
        </Link>
        <ActionButton
          size="sm"
          tone="ghost"
          disabled={busy || !verified}
          onClick={() => void update({ dismiss_takeover_hint: true })}
        >
          {t('takeovers.dismiss')}
        </ActionButton>
      </div>
      {error && (
        <p role="alert" className="text-danger-ink">
          {error}
        </p>
      )}
    </aside>
  );
}
