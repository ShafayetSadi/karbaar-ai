import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import { FormError } from '../components/ui';
import type { StoreNotesAccess } from './StoreNotes';

export function ShippingMessages({ access }: { access: StoreNotesAccess }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [delivered, setDelivered] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/merchant/shipping-message-settings')).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setEnabled(result.data.shipping_update_shipped_enabled);
        setDelivered(Boolean(result.data.shipping_update_delivered_enabled));
      } else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function change(
    flag: 'shipping_update_shipped_enabled' | 'shipping_update_delivered_enabled',
    next: boolean,
  ) {
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.PUT('/v1/merchant/shipping-message-settings', {
        body: { [flag]: next },
      }),
    );
    setBusy(false);
    if (!result.ok) return void setError(result.error);
    setEnabled(result.data.shipping_update_shipped_enabled);
    setDelivered(Boolean(result.data.shipping_update_delivered_enabled));
  }

  return (
    <section className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <h3 className="text-base font-semibold text-ink">{t('shippingMessages.title')}</h3>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
        {t('shippingMessages.hint')}
      </p>
      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('shippingMessages.loadFailed')}
        </p>
      )}
      {enabled !== null && (
        <div className="mt-4 space-y-3">
          <FormError error={error} />
          <label className="flex min-h-16 items-start gap-3 rounded-lg border border-line bg-panel-muted/40 p-4 text-sm text-ink">
            <input
              type="checkbox"
              checked={enabled}
              disabled={access !== 'edit' || busy}
              onChange={(e) => void change('shipping_update_shipped_enabled', e.target.checked)}
              className="mt-1 size-4 shrink-0 accent-active"
            />
            <span>
              <span className="font-medium">{t('shippingMessages.enable')}</span>
              <span className="mt-1 block leading-relaxed text-ink-muted">
                {t('shippingMessages.enableHint')}
              </span>
            </span>
          </label>
          <label className="flex min-h-16 items-start gap-3 rounded-lg border border-line bg-panel-muted/40 p-4 text-sm text-ink">
            <input
              type="checkbox"
              checked={delivered}
              disabled={access !== 'edit' || busy}
              onChange={(e) => void change('shipping_update_delivered_enabled', e.target.checked)}
              className="mt-1 size-4 shrink-0 accent-active"
            />
            <span>
              <span className="font-medium">{t('shippingMessages.deliveredEnable')}</span>
              <span className="mt-1 block leading-relaxed text-ink-muted">
                {t('shippingMessages.deliveredEnableHint')}
              </span>
            </span>
          </label>
          {access !== 'edit' && (
            <p className="text-sm text-ink-muted">
              {t(
                access === 'staff' ? 'shippingMessages.ownerOnly' : 'shippingMessages.verifyFirst',
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
