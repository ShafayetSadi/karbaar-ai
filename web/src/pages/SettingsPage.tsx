import { useEffect, useRef } from 'react';
import {
  UserRound,
  Users,
  Sparkles,
  Plug,
  Wallet,
  Package,
  Store,
  SlidersHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { cx, fieldClass } from '../components/ui';
import { MessengerConnection } from '../settings/MessengerConnection';
import { PaymentAndDelivery } from '../settings/PaymentAndDelivery';
import { LowStockThreshold } from '../settings/LowStockThreshold';
import { FollowUps } from '../settings/FollowUps';
import { OrderConfirmation } from '../settings/OrderConfirmation';
import { OrderReceipts } from '../settings/OrderReceipts';
import { ShippingMessages } from '../settings/ShippingMessages';
import { AllowedLanguages } from '../settings/AllowedLanguages';
import { ProductCards } from '../settings/ProductCards';
import { TakeoverSettings } from '../settings/TakeoverSettings';
import { AiUsage } from '../settings/AiUsage';
import type { StoreNotesAccess } from '../settings/StoreNotes';
import { SupportAccess } from '../settings/SupportAccess';
import { PhoneAlerts } from '../phoneAlerts/PhoneAlerts';
import { ChangePassword } from '../settings/ChangePassword';
import { Profile } from '../settings/Profile';
import { ShopName } from '../settings/ShopName';
import { Team } from '../settings/Team';
import { LANGUAGES, setLanguage, type Language } from '../i18n';
import { useTheme, type ThemeChoice } from '../theme/ThemeProvider';

const GROUP_ICONS = {
  general: UserRound,
  people: Users,
  ai: Sparkles,
  channel: Plug,
  payment: Wallet,
  orders: Package,
};

const THEMES: ThemeChoice[] = ['light', 'dark', 'system'];

type GroupKey = 'general' | 'people' | 'ai' | 'channel' | 'orders' | 'payment';

/** Settings are grouped by what the merchant is trying to do, not by where the code lives. */
function Group({
  id,
  title,
  hint,
  children,
}: {
  id: GroupKey;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`settings-group-${id}`}
      aria-labelledby={`settings-group-${id}-title`}
      className="space-y-6"
    >
      <header>
        <h2 id={`settings-group-${id}-title`} className="text-lg font-semibold text-ink">
          {title}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{hint}</p>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SettingsBlock({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-20 space-y-4">
      {children}
    </section>
  );
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { state } = useAuth();
  const { choice, setChoice } = useTheme();
  const isOwner = state.status === 'authenticated' && state.me.role === 'owner';
  const { section } = useParams();
  const settingsNav = useRef<HTMLElement>(null);
  useEffect(() => {
    settingsNav.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [section, state.status]);
  const { hash } = useLocation();
  // A deep link like `/settings/payment#delivery-options` scrolls to its card. The Messenger
  // callback also uses the fragment (`#messenger=…`), so leave that one alone.
  useEffect(() => {
    if (!hash || hash.startsWith('#messenger=')) return;
    document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: 'start' });
  }, [hash, section]);
  const groups: GroupKey[] = isOwner
    ? ['general', 'people', 'ai', 'channel', 'payment', 'orders']
    : ['general', 'people', 'ai', 'channel'];
  if (state.status !== 'authenticated') return null;
  // The Messenger connect flow returns to `/settings#messenger=…`; the connection lives under Channel.
  if (!section && hash.startsWith('#messenger=') && isOwner) {
    return <Navigate to={`/settings/channel${hash}`} replace />;
  }
  const active = (section ?? 'general') as GroupKey;
  // An unknown section, or an owner-only one for staff, falls back to the first.
  if (section && !groups.includes(active)) return <Navigate to="/settings" replace />;
  const { me } = state;
  const aiAccess: StoreNotesAccess =
    me.role !== 'owner' ? 'staff' : me.user.email_verified ? 'edit' : 'unverified';

  return (
    <div className="mx-auto max-w-6xl space-y-7 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('settings.title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('settings.subtitle')}</p>
        </div>
        <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink-muted">
          <Store className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{me.merchant.name}</span>
        </span>
      </header>

      <div className="space-y-7">
        <nav
          ref={settingsNav}
          aria-label={t('settings.sections')}
          className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-line bg-paper pb-px"
        >
          {groups.map((key) => {
            const Icon = GROUP_ICONS[key];
            return (
              <Link
                key={key}
                to={key === 'general' ? '/settings' : `/settings/${key}`}
                aria-current={active === key ? 'page' : undefined}
                className={cx(
                  'relative flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-active',
                  active === key
                    ? 'border-active bg-accent/10 font-medium text-ink'
                    : 'border-transparent text-ink-muted hover:bg-panel-muted/60 hover:text-ink',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {t(`settings.groups.${key}.title`)}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-10">
          {active === 'general' && (
            <Group
              id="general"
              title={t('settings.groups.general.title')}
              hint={t('settings.groups.general.hint')}
            >
              <div className="grid items-stretch gap-4 xl:grid-cols-2">
                <Profile me={me} />
                {isOwner && <ShopName me={me} />}
              </div>
              <div className="grid items-stretch gap-4 xl:grid-cols-2">
                <ChangePassword />
                <PhoneAlerts />
              </div>

              <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <SlidersHorizontal className="size-4 text-ink-muted" aria-hidden="true" />
                  {t('settings.preferences')}
                </h3>
                <div className="mt-5 grid gap-6 sm:grid-cols-2">
                  <div>
                    <label htmlFor="settings-language" className="text-sm font-semibold text-ink">
                      {t('settings.language')}
                    </label>
                    <p className="mt-1 text-sm text-ink-muted">{t('settings.languageHint')}</p>
                    <select
                      id="settings-language"
                      value={i18n.language}
                      onChange={(e) => void setLanguage(e.target.value as Language)}
                      className={cx('mt-3 block w-full max-w-sm', fieldClass)}
                    >
                      {LANGUAGES.map((code) => (
                        <option key={code} value={code}>
                          {t(`language.${code}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="settings-theme" className="text-sm font-semibold text-ink">
                      {t('theme.label')}
                    </label>
                    <p className="mt-1 text-sm text-ink-muted">{t('settings.themeHint')}</p>
                    <select
                      id="settings-theme"
                      value={choice}
                      onChange={(e) => setChoice(e.target.value as ThemeChoice)}
                      className={cx('mt-3 block w-full max-w-sm', fieldClass)}
                    >
                      {THEMES.map((value) => (
                        <option key={value} value={value}>
                          {t(`theme.${value}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </Group>
          )}

          {active === 'people' && (
            <Group
              id="people"
              title={t('settings.groups.people.title')}
              hint={t('settings.groups.people.hint')}
            >
              <Team />
              {/* Who at Karbaar read the shop's content, and why (ADR 0037). Everyone sees it; the owner can end it. */}
              <SupportAccess />
            </Group>
          )}

          {active === 'ai' && (
            <Group
              id="ai"
              title={t('settings.groups.ai.title')}
              hint={t('settings.groups.ai.hint')}
            >
              <nav aria-label={t('settings.onThisPage')} className="flex flex-wrap gap-2">
                {['ai-basics', 'ai-replies', 'ai-orders'].map((id) => (
                  <Link
                    key={id}
                    to={`#${id}`}
                    className="rounded-md border border-line px-3 py-2 text-sm text-ink-muted hover:bg-panel-muted hover:text-ink"
                  >
                    {t(`settings.jump.${id}`)}
                  </Link>
                ))}
              </nav>
              {/* Everyone reads the AI settings; only a verified owner changes them (ADR 0020). */}
              <SettingsBlock id="ai-basics" title={t('settings.jump.ai-basics')}>
                <AiUsage />
                <AllowedLanguages access={aiAccess} />
                <TakeoverSettings access={aiAccess} />
              </SettingsBlock>
              <SettingsBlock id="ai-replies" title={t('settings.jump.ai-replies')}>
                <ProductCards access={aiAccess} />
              </SettingsBlock>
              <SettingsBlock id="ai-orders" title={t('settings.jump.ai-orders')}>
                <OrderReceipts access={aiAccess} />
                <OrderConfirmation access={aiAccess} />
                <FollowUps access={aiAccess} />
              </SettingsBlock>
            </Group>
          )}

          {/* Members can inspect Page evidence; only owners change connections. */}
          {active === 'channel' && (
            <Group
              id="channel"
              title={t('settings.groups.channel.title')}
              hint={t('settings.groups.channel.hint')}
            >
              <MessengerConnection />
            </Group>
          )}
          {active === 'payment' && (
            <Group
              id="payment"
              title={t('settings.groups.payment.title')}
              hint={t('settings.groups.payment.hint')}
            >
              <PaymentAndDelivery />
            </Group>
          )}
          {active === 'orders' && (
            <Group
              id="orders"
              title={t('settings.groups.orders.title')}
              hint={t('settings.groups.orders.hint')}
            >
              <LowStockThreshold />
              <ShippingMessages access={aiAccess} />
            </Group>
          )}
          {!isOwner && (
            <p className="rounded-lg border border-dashed border-line p-4 sm:p-6 text-sm text-ink-muted">
              {t('settings.ownerOnly')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
