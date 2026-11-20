import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import type { components } from '../api/schema';
import { FormError } from '../components/ui';
import { TemplateMessage } from '../inbox/TemplateMessage';
import type { StoreNotesAccess } from './StoreNotes';

type Receipt = components['schemas']['OrderReceiptRead'];
type Template = components['schemas']['TemplateRead'];

/** The preview in the shape the inbox draws a sent receipt, so both look the same. */
function asTemplate(receipt: Receipt): Template {
  return {
    type: 'receipt',
    cards: [],
    text: null,
    buttons: [],
    order_id: receipt.order_id,
    order_number: receipt.order_number,
    currency: receipt.currency,
    payment_method: receipt.payment_method,
    items: receipt.items,
    subtotal: receipt.subtotal,
    shipping: receipt.shipping,
    total: receipt.total,
  };
}

/**
 * Whether confirming an order from a Messenger conversation sends the customer a receipt (ADR
 * 0038, MT6). The preview is the newest order's receipt, built by the server with the same code
 * that sends one.
 */
export function OrderReceipts({ access }: { access: StoreNotesAccess }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = access === 'edit';

  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/merchant/ai-settings')).then((result) => {
      if (cancelled) return;
      if (!result.ok) return void setFailed(true);
      setEnabled(result.data.order_receipt_enabled);
    });
    void call(() => api.GET('/v1/merchant/order-receipt-preview')).then((result) => {
      if (!cancelled) setReceipt(result.ok ? result.data.receipt : null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function change(next: boolean) {
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.PUT('/v1/merchant/ai-settings', {
        body: {
          order_receipt_enabled: next,
        },
      }),
    );
    setBusy(false);
    if (!result.ok) return void setError(result.error);
    setEnabled(result.data.order_receipt_enabled);
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <h2 className="text-base font-semibold text-ink">{t('orderReceipts.title')}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t('orderReceipts.hint')}</p>
      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('orderReceipts.loadFailed')}
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
              <span className="font-medium">{t('orderReceipts.enable')}</span>
              <span className="block text-ink-muted">{t('orderReceipts.enableHint')}</span>
            </span>
          </label>
          {!canEdit && (
            <p className="text-sm text-ink-muted">
              {t(access === 'staff' ? 'orderReceipts.ownerOnly' : 'orderReceipts.verifyFirst')}
            </p>
          )}
        </div>
      )}
      {receipt !== undefined && (
        <div className="mt-5">
          <h3 className="text-sm font-medium text-ink">{t('orderReceipts.preview')}</h3>
          {receipt ? (
            <div className="mt-2 space-y-1.5">
              <TemplateMessage template={asTemplate(receipt)} />
              {receipt.details_text && (
                <p className="w-[min(16rem,70vw)] rounded-2xl rounded-br-md border border-line bg-panel px-3.5 py-2 text-sm break-words whitespace-pre-wrap text-ink">
                  {receipt.details_text}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              {t('orderReceipts.noOrders')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
