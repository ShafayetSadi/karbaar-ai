import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Recovery is explicit: never replay mutations or reload a page containing unsaved input. */
export function ConnectionBanner() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (!offline) return null;
  return (
    <p
      role="status"
      className="shrink-0 border-b border-warn-ink/20 bg-warn px-4 py-2 text-sm text-warn-ink"
    >
      {t('connection.offline')}
    </p>
  );
}
