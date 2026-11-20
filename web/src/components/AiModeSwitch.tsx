import { useFeatures } from '../entitlements/useFeatures';
import { Bot, PenLine, PowerOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { components } from '../api/schema';
import { useAuth } from '../auth/AuthProvider';
import { Popover, cx } from './ui';

type AiSettings = components['schemas']['AiSettingsRead'];
type AiMode = AiSettings['ai_mode'];

const MODES = [
  { value: 'off', icon: PowerOff },
  { value: 'draft', icon: PenLine },
  { value: 'auto', icon: Bot },
] as const satisfies readonly { value: AiMode; icon: unknown }[];

/** What the sales agent does with new messages: nothing, draft replies, or answer by itself. */
export function AiModeSwitch({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const features = useFeatures();
  const { state } = useAuth();
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/merchant/ai-settings')).then((result) => {
      if (!cancelled && result.ok) setSettings(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status !== 'authenticated' || settings === null) return null;
  // The API only lets a verified owner change the mode; everyone else sees it.
  const canChange = state.me.role === 'owner' && state.me.user.email_verified;

  async function choose(mode: AiMode) {
    if (!settings || mode === settings.ai_mode) return;
    setBusy(true);
    setError(null);
    const body = { ai_mode: mode };
    const result = await call(() => api.PUT('/v1/merchant/ai-settings', { body }));
    if (result.ok) setSettings(result.data);
    else setError(result.error.message);
    setBusy(false);
  }

  return (
    <div
      role="group"
      aria-label={t('aiMode.label')}
      title={error ?? (canChange ? undefined : t('aiMode.ownerOnly'))}
      className={cx(
        'flex rounded-md border bg-panel p-0.5',
        compact && 'flex-col',
        error ? 'border-danger-ink/40' : 'border-line',
      )}
    >
      {MODES.map(({ value, icon: Icon }) => {
        const locked =
          value === 'auto' &&
          (!settings.auto_mode_available || !features.isEnabled('auto_mode_allowed'));
        const active = settings.ai_mode === value;
        const explanation = t(active ? 'aiMode.autoPaused' : 'aiMode.autoLocked');
        const button = (
          <button
            type="button"
            aria-pressed={active}
            aria-disabled={locked || undefined}
            disabled={(!canChange && !locked) || busy}
            title={locked ? undefined : t(`aiMode.hint.${value}`)}
            onClick={() => {
              if (!locked) void choose(value);
            }}
            className={cx(
              'flex items-center justify-center gap-1 rounded px-2 py-0.5 text-xs focus-visible:outline-2 focus-visible:outline-active disabled:cursor-not-allowed',
              locked && 'opacity-50',
              active
                ? 'bg-panel-muted font-medium text-ink'
                : 'text-ink-muted enabled:hover:text-ink',
            )}
          >
            <Icon aria-hidden className="size-3.5" />
            <span className={compact ? 'sr-only' : undefined}>{t(`aiMode.${value}`)}</span>
          </button>
        );
        return locked ? (
          <Popover key={value} trigger={button} align="end" className="max-w-72 text-sm text-ink">
            <p>{explanation}</p>
          </Popover>
        ) : (
          <span key={value}>{button}</span>
        );
      })}
    </div>
  );
}
