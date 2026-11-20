import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import type { components } from '../api/schema';
import { FormError } from '../components/ui';
import { TemplateMessage } from '../inbox/TemplateMessage';
import type { StoreNotesAccess } from './StoreNotes';

type Request = components['schemas']['OrderConfirmationRequestRead'];

/**
 * Whether an order taken in a Messenger conversation asks the customer to confirm it there (ADR
 * 0032, OC5). The preview is the newest order's request, built by the server with the same code
 * that sends one.
 */
export function OrderConfirmation({ access }: { access: StoreNotesAccess }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [request, setRequest] = useState<Request | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = access === 'edit';

  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/merchant/order-confirmation-settings')).then((result) => {
      if (cancelled) return;
      if (result.ok) setEnabled(result.data.order_confirmation_enabled);
      else setFailed(true);
    });
    void call(() => api.GET('/v1/merchant/order-confirmation-preview')).then((result) => {
      if (!cancelled) setRequest(result.ok ? result.data.request : null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function change(next: boolean) {
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.PUT('/v1/merchant/order-confirmation-settings', {
        body: { order_confirmation_enabled: next },
      }),
    );
    setBusy(false);
    if (result.ok) setEnabled(result.data.order_confirmation_enabled);
    else setError(result.error);
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <h2 className="text-base font-semibold text-ink">{t('orderConfirmation.title')}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t('orderConfirmation.hint')}</p>
      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('orderConfirmation.loadFailed')}
        </p>
      )}
      {enabled !== null && (
        <div className="mt-4 space-y-3">
          <FormError error={error} />
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-panel-muted/40 p-3 text-sm text-ink has-[:disabled]:cursor-default">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canEdit || busy}
              onChange={(e) => void change(e.target.checked)}
              className="mt-1 size-4 shrink-0 accent-active"
            />
            <span>
              <span className="font-medium">{t('orderConfirmation.enable')}</span>
              <span className="block text-ink-muted">{t('orderConfirmation.enableHint')}</span>
            </span>
          </label>
          {!canEdit && (
            <p className="text-sm text-ink-muted">
              {t(
                access === 'staff'
                  ? 'orderConfirmation.ownerOnly'
                  : 'orderConfirmation.verifyFirst',
              )}
            </p>
          )}
        </div>
      )}
      {request !== undefined && (
        <div className="mt-5">
          <h3 className="text-sm font-medium text-ink">{t('orderConfirmation.preview')}</h3>
          {request ? (
            <div className="mt-2 space-y-1">
              {request.text && (
                <p className="w-[min(16rem,70vw)] rounded-2xl rounded-br-md border border-line bg-panel px-3.5 py-2 text-sm break-words whitespace-pre-wrap text-ink">
                  {request.text}
                </p>
              )}
              <TemplateMessage
                template={{
                  type: 'button',
                  cards: [],
                  text: request.template_text,
                  buttons: request.buttons.map((title) => ({ title, url: null, payload: null })),
                  order_id: null,
                  order_number: request.order_number,
                  currency: null,
                  payment_method: null,
                  items: [],
                  subtotal: null,
                  shipping: null,
                  total: null,
                }}
              />
            </div>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              {t('orderConfirmation.noOrders')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
