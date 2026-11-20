import { Languages, Menu, Moon, Sun, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthProvider';
import { LANGUAGES, setLanguage, type Language } from '../i18n';
import { useLiveStatus, useReconnectLive } from '../inbox/useInboxStream';
import { useTheme } from '../theme/ThemeProvider';
import { ActionButton, IconButton, SelectMenu, cx } from './ui';

/**
 * Phones only: the menu button, the shop name and the live-updates warning. From md the sidebar
 * is always visible and the warning moves into the content panel (`LiveNotice`); there is no
 * global top bar; the AI mode lives in the sidebar footer.
 */
export function MobileBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { t } = useTranslation();
  const { state } = useAuth();
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-chrome px-3 md:hidden">
      <IconButton icon={Menu} label={t('header.menu')} onClick={onOpenMenu} />
      <span className="min-w-0 truncate text-sm font-medium text-ink">
        {state.status === 'authenticated' ? state.me.merchant.name : t('app.name')}
      </span>
      <LivePill wrapper="ml-auto" />
    </header>
  );
}

/** From md: a slim row at the top of the content panel, only while live updates are down. */
export function LiveNotice() {
  return <LivePill wrapper="flex shrink-0 justify-end border-b border-line px-3 py-1.5" />;
}

/** Brief reconnects are normal; only flag one that outlasts this. */
const CONNECTING_GRACE_MS = 5000;

/**
 * Silent while live updates arrive: it only speaks up when they might not, since a merchant
 * who doesn't know the stream dropped may think customers have gone quiet.
 */
function LivePill({ wrapper }: { wrapper: string }) {
  const { t } = useTranslation();
  const status = useLiveStatus();
  const reconnect = useReconnectLive();
  const [slow, setSlow] = useState(false);
  const [seen, setSeen] = useState(status);
  if (seen !== status) {
    setSeen(status);
    setSlow(false);
  }

  useEffect(() => {
    if (status !== 'connecting') return;
    const timer = setTimeout(() => setSlow(true), CONNECTING_GRACE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (status === 'live' || (status === 'connecting' && !slow)) return null;
  const offline = status === 'offline';
  return (
    <div className={wrapper}>
      <span
        aria-live="polite"
        title={t(`live.status.${status}`)}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 sm:px-2.5 text-xs',
          offline
            ? 'border-danger-ink/30 bg-danger text-danger-ink'
            : 'border-warn-ink/30 bg-warn text-warn-ink',
        )}
      >
        <span
          aria-hidden
          className={cx(
            'size-1.5 shrink-0 rounded-full',
            offline ? 'bg-danger-ink' : 'bg-warn-ink',
          )}
        />
        <span className="sr-only sm:not-sr-only">{t(`live.pill.${status}`)}</span>
        {offline && typeof EventSource !== 'undefined' && (
          <button
            type="button"
            onClick={reconnect}
            className="ml-1 font-medium underline underline-offset-2 hover:no-underline"
          >
            <RefreshCw aria-hidden className="size-4 sm:hidden" />
            <span className="sr-only sm:not-sr-only">{t('live.reconnect')}</span>
          </button>
        )}
      </span>
    </div>
  );
}

export function LanguageMenu({ iconOnly = false }: { iconOnly?: boolean }) {
  const { t, i18n } = useTranslation();
  return (
    <SelectMenu<Language>
      align="start"
      value={i18n.language as Language}
      onChange={(code) => void setLanguage(code)}
      options={LANGUAGES.map((code) => ({ value: code, label: t(`language.${code}`) }))}
      trigger={
        <ActionButton
          size="sm"
          tone="ghost"
          icon={Languages}
          aria-label={t('header.language')}
          title={t('header.language')}
        >
          <span className={iconOnly ? 'sr-only' : undefined}>{t(`language.${i18n.language}`)}</span>
        </ActionButton>
      }
    />
  );
}

export function ThemeToggle({ iconOnly = false }: { iconOnly?: boolean }) {
  const { t } = useTranslation();
  const { resolved, setChoice } = useTheme();
  if (iconOnly) {
    const next = resolved === 'dark' ? 'light' : 'dark';
    return (
      <IconButton
        icon={next === 'dark' ? Moon : Sun}
        label={t(`theme.${next}`)}
        onClick={() => setChoice(next)}
        className="border-transparent bg-transparent"
      />
    );
  }
  const options = [
    { value: 'light', icon: Sun },
    { value: 'dark', icon: Moon },
  ] as const;
  return (
    <div role="group" aria-label={t('theme.label')} className="flex rounded-md bg-ink/5 p-0.5">
      {options.map(({ value, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={resolved === value}
          aria-label={t(`theme.${value}`)}
          title={t(`theme.${value}`)}
          onClick={() => setChoice(value)}
          className={cx(
            'flex items-center rounded px-1.5 py-1 focus-visible:outline-2 focus-visible:outline-active',
            resolved === value ? 'bg-panel text-ink shadow-xs' : 'text-ink-muted hover:text-ink',
          )}
        >
          <Icon aria-hidden className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
