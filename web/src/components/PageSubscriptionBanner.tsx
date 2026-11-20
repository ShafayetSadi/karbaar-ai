import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';

/** Only confirmed configuration evidence warrants a subscription warning. */
export function PageSubscriptionBanner() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [problem, setProblem] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await call(() => api.GET('/v1/channels/messenger'));
      if (!active) return;
      const connection = result.ok ? result.data : null;
      setProblem(
        connection?.token_status === 'active' &&
          (connection.subscription_state === 'missing' ||
            connection.subscription_state === 'incomplete'),
      );
    };
    void load();
    window.addEventListener('commerce:channel-changed', load);
    window.addEventListener('commerce:setup-changed', load);
    return () => {
      active = false;
      window.removeEventListener('commerce:channel-changed', load);
      window.removeEventListener('commerce:setup-changed', load);
    };
  }, [pathname]);
  if (!problem || pathname === '/settings/channel') return null;
  return (
    <p
      role="alert"
      className="shrink-0 border-b border-warn-ink/20 bg-warn px-4 py-2 text-sm text-warn-ink"
    >
      {t('messenger.evidence.problem')}{' '}
      <Link to="/settings/channel" className="underline">
        {t('messenger.evidence.details')}
      </Link>
    </p>
  );
}
