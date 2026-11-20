import { useUrlPanel } from '../navigation/useUrlPanel';
import { useModalFocus } from '../navigation/useModalFocus';
import { useScrollRestoration } from '../navigation/useScrollRestoration';
import { ConnectionBanner } from './ConnectionBanner';
import { PageSubscriptionBanner } from './PageSubscriptionBanner';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { AssignmentAlerts } from '../inbox/AssignmentAlerts';
import { LaterReminders } from '../inbox/LaterReminders';
import { InboxStreamProvider } from '../inbox/useInboxStream';
import { ReviewBanner } from './ReviewBanner';
import { useFeatures } from '../entitlements/useFeatures';
import { Sidebar } from './Sidebar';
import { cx } from './ui/cx';
import { LiveNotice, MobileBar } from './ShellControls';
import { useMediaQuery } from './useMediaQuery';

export function AppLayout() {
  const { state } = useAuth();
  const features = useFeatures();
  // Gate only the first load. A failed or refetching query flips back to pending when children
  // remount, which would unmount them again and loop forever.
  const [featuresSettled, setFeaturesSettled] = useState(false);
  if (!features.loading && !featuresSettled) setFeaturesSettled(true);
  // Full sidebar from xl; an icon rail from md; a drawer below md.
  const wide = useMediaQuery('(min-width: 80rem)');
  const [drawerOpen, setDrawerOpen] = useUrlPanel('menu');
  const mainRef = useScrollRestoration();
  const mobile = !useMediaQuery('(min-width: 48rem)');
  if (state.status !== 'authenticated') return null;
  // Resolve navigation permissions before showing the menu, so links appear together.
  if (!featuresSettled) return null;
  const { me } = state;

  return (
    <InboxStreamProvider>
      <LaterReminders />
      <AssignmentAlerts />
      {/* `relative` makes the shell the containing block of `sr-only` (absolute) elements, so they
          cannot stretch the document past the viewport and scroll the whole shell. */}
      {/* From md the content is an inset, rounded panel (`paper`) on the darker `chrome` that
          also carries the sidebar. Phones keep it full-bleed. */}
      <div className="relative flex h-dvh overflow-clip bg-chrome pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] text-ink">
        <aside className="hidden shrink-0 bg-chrome md:block md:w-16 xl:w-60">
          <Sidebar compact={!wide} />
        </aside>
        {drawerOpen && mobile && <Drawer onClose={() => setDrawerOpen(false)} />}
        <div className="flex min-w-0 flex-1 flex-col bg-paper md:my-2 md:mr-2 md:overflow-clip md:rounded-lg md:border md:border-line">
          {/* The live-updates warning sits in the phone bar, or atop the panel from md. */}
          {mobile ? <MobileBar onOpenMenu={() => setDrawerOpen(true)} /> : <LiveNotice />}
          {!me.user.email_verified && <VerifyEmailBanner />}
          <ReviewBanner />
          <ConnectionBanner />
          <PageSubscriptionBanner />
          <main ref={mainRef} className="relative min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </InboxStreamProvider>
  );
}

/**
 * Pages other than full-bleed ones (the inbox) sit in this padded, width-capped column.
 * `wide` is for list pages: their tables use the extra width, while forms and detail
 * pages keep the narrower column so rows stay easy to scan.
 */
export function PageContainer({ wide = false }: { wide?: boolean }) {
  return (
    <div className={cx('mx-auto px-4 py-8', wide ? 'max-w-[96rem] md:px-6' : 'max-w-6xl')}>
      <Outlet />
    </div>
  );
}

function Drawer({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const ref = useModalFocus(true, onClose);

  return (
    <dialog
      ref={ref}
      aria-label={t('header.closeMenu')}
      className="fixed inset-0 z-40 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-ink open:block md:hidden"
    >
      <button
        type="button"
        aria-label={t('header.closeMenu')}
        onClick={onClose}
        className="absolute inset-0 bg-ink/30"
      />
      <aside className="absolute inset-y-0 left-0 w-64 max-w-full overflow-y-auto border-r border-line bg-chrome shadow-xl">
        <Sidebar compact={false} />
      </aside>
    </dialog>
  );
}

function VerifyEmailBanner() {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    try {
      const { data, response } = await api.POST('/v1/auth/verify-email/resend');
      setMessage(
        data?.message ??
          (response.status === 429
            ? t('verifyBanner.tooManyRequests')
            : t('verifyBanner.sendFailed')),
      );
    } catch {
      setMessage(t('verifyBanner.unreachable'));
    }
    setBusy(false);
  }

  return (
    <div
      role="status"
      className="shrink-0 border-b border-warn-ink/20 bg-warn text-sm text-warn-ink"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-2">
        <span>{message ?? t('verifyBanner.prompt')}</span>
        <button
          type="button"
          onClick={() => void resend()}
          disabled={busy}
          className="font-medium underline disabled:opacity-60"
        >
          {t('verifyBanner.resend')}
        </button>
      </div>
    </div>
  );
}
