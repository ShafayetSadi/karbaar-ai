import { Inbox, House, Package, Settings, ShoppingBag, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useLiveStatus } from '../inbox/useInboxStream';
import { UserAvatar } from './UserAvatar';
import { AiModeSwitch } from './AiModeSwitch';
import { LanguageMenu, ThemeToggle } from './ShellControls';
import { BrandMark, Tooltip, cx } from './ui';

type NavItem = { key: string; icon: LucideIcon; to?: string };

// Show only usable destinations; future feature ideas live in GitHub issues.
const ITEMS: NavItem[] = [
  { key: 'nav.home', icon: House, to: '/home' },
  { key: 'nav.inbox', icon: Inbox, to: '/inbox' },
  { key: 'nav.orders', icon: ShoppingBag, to: '/orders' },
  { key: 'nav.products', icon: Package, to: '/products' },
];

const SETTINGS: NavItem = { key: 'nav.settings', icon: Settings, to: '/settings' };

/**
 * The app's main navigation. `compact` is the icon rail between md and xl; labels move into
 * tooltips. `onNavigate` lets the phone drawer close after a link is followed.
 */
export function Sidebar({ compact, onNavigate }: { compact: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col">
      <Brand compact={compact} />
      <nav aria-label={t('nav.main')} className="flex-1 overflow-y-auto px-2 pb-2">
        <ul className="mt-2 space-y-px">
          {ITEMS.map((item) => (
            <li key={item.key}>
              <Item item={item} compact={compact} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
        <ul className="mt-3 border-t border-line pt-3">
          <li>
            <Item item={SETTINGS} compact={compact} onNavigate={onNavigate} />
          </li>
        </ul>
      </nav>
      <Footer compact={compact} />
    </div>
  );
}

function Brand({ compact }: { compact: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      className={cx('flex h-12 shrink-0 items-center gap-2', compact ? 'justify-center' : 'px-4')}
    >
      <BrandMark className="size-7" />
      {!compact && (
        <span className="min-w-0 truncate text-sm font-semibold text-ink">{t('app.name')}</span>
      )}
    </div>
  );
}

function Item({
  item,
  compact,
  onNavigate,
}: {
  item: NavItem;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const label = t(item.key);
  const base = cx(
    'flex items-center gap-2.5 rounded-md text-sm',
    compact ? 'size-9 justify-center' : 'h-8 px-2',
  );

  const content = item.to ? (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      aria-label={compact ? label : undefined}
      className={({ isActive }) =>
        cx(
          base,
          'focus-visible:outline-2 focus-visible:outline-active',
          // A soft grey fill, as on the selected inbox row; the lime (olive in light) icon is
          // the only accent.
          isActive
            ? 'bg-ink/8 font-medium text-ink'
            : 'text-ink-muted hover:bg-ink/5 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon aria-hidden className={cx('size-4 shrink-0', isActive && 'text-active')} />
          {!compact && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  ) : (
    <span
      aria-disabled="true"
      aria-label={compact ? `${label} (${t('nav.soon')})` : undefined}
      className={cx(base, 'cursor-not-allowed text-ink-faint')}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {!compact && (
        <>
          <span className="flex-1 truncate">{label}</span>
          <span className="text-xs">{t('nav.soon')}</span>
        </>
      )}
    </span>
  );

  if (!compact) return content;
  // The tooltip anchors on a wrapper: Radix's asChild would flatten NavLink's className function.
  // Focus bubbles, so keyboard focus on the link still opens it.
  return (
    <Tooltip content={item.to ? label : `${label} · ${t('nav.soon')}`}>
      <span className="flex justify-center">{content}</span>
    </Tooltip>
  );
}

function Footer({ compact }: { compact: boolean }) {
  const { state } = useAuth();
  const { t } = useTranslation();
  const status = useLiveStatus();
  if (state.status !== 'authenticated') return null;
  const { me } = state;
  const statusText = t(`live.status.${status}`);

  const dot = (
    <span
      aria-hidden
      className={cx(
        'size-2 shrink-0 rounded-full',
        status === 'live' ? 'bg-ok-ink' : status === 'connecting' ? 'bg-warn-ink' : 'bg-danger-ink',
      )}
    />
  );

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-1 border-t border-line py-3">
        <AiModeSwitch compact />
        <Tooltip content={statusText}>
          <span className="flex size-6 items-center justify-center">
            {dot}
            <span className="sr-only">{statusText}</span>
          </span>
        </Tooltip>
        <LanguageMenu iconOnly />
        <ThemeToggle iconOnly />
      </div>
    );
  }

  return (
    <div className="space-y-1 border-t border-line p-2">
      <div className="space-y-1 px-2 pb-1">
        <p className="text-xs text-ink-faint">{t('aiMode.label')}</p>
        <AiModeSwitch />
      </div>
      <div className="flex items-center gap-2.5 px-2 py-1.5">
        <UserAvatar
          name={me.user.name ?? me.merchant.name}
          photoUrl={me.user.avatar_url}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{me.merchant.name}</p>
          <p className="truncate text-xs text-ink-faint" title={me.user.email}>
            {t(`role.${me.role}`, { defaultValue: me.role })} · <span>{me.user.email}</span>
          </p>
        </div>
        <Tooltip content={statusText}>
          <span className="flex size-4 shrink-0 items-center justify-center">
            {dot}
            <span className="sr-only">{statusText}</span>
          </span>
        </Tooltip>
      </div>
      <div className="flex items-center gap-1">
        <LanguageMenu />
        <ThemeToggle />
      </div>
    </div>
  );
}
