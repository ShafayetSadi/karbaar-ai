import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { components } from '../api/schema';
import type { ApiError } from '../api/errors';
import { ActionButton, FormError, fieldClass } from '../components/ui';
import { PaymentSection } from './PaymentSection';
import { AdvanceDefault } from './AdvanceDefault';
import { DeliveryOptions } from './DeliveryOptions';

type Terms = components['schemas']['PaymentAndDeliveryRead'];
type Warning = components['schemas']['PaymentNoteWarning'];

export function PaymentAndDelivery() {
  const { t } = useTranslation();
  const [terms, setTerms] = useState<Terms | null>(null);
  const [note, setNote] = useState('');
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let current = true;
    void call(() => api.GET('/v1/payment-and-delivery')).then((result) => {
      if (!current) return;
      if (!result.ok) return setError(result.error);
      setTerms(result.data);
      setNote(result.data.payment_note ?? '');
    });
    return () => {
      current = false;
    };
  }, []);

  async function saveNote() {
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.PUT('/v1/payment-and-delivery/payment-note', {
        body: { payment_note: note.trim() || null },
      }),
    );
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setNote(result.data.payment_note ?? '');
    setWarnings(result.data.warnings);
    setSaved(true);
  }

  return (
    <div className="space-y-5">
      <DeliveryOptions />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <AdvanceDefault />
        {terms && (
          <PaymentSection
            accounts={terms.payment_accounts}
            onAccountsChanged={(payment_accounts) => setTerms({ ...terms, payment_accounts })}
            canEdit
            set={terms.payment_accounts.length ? 1 : 0}
            highlighted={false}
          />
        )}
      </div>
      <FormError error={error} />
      {terms && (
        <section className="rounded-lg border border-line bg-panel p-4 sm:p-6">
          <label className="block text-base font-semibold text-ink" htmlFor="payment-note">
            {t('paymentDelivery.note')}
          </label>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
            {t('paymentDelivery.hint')}
          </p>
          <textarea
            id="payment-note"
            maxLength={300}
            rows={3}
            value={note}
            disabled={busy}
            onChange={(e) => {
              setNote(e.target.value);
              setSaved(false);
            }}
            className={`mt-4 block min-h-28 w-full resize-y ${fieldClass}`}
          />
          {warnings.map((warning) => (
            <p key={warning.code} role="alert" className="mt-2 text-sm text-warn-ink">
              {t(
                warning.code === 'payment_note_amount'
                  ? 'paymentDelivery.amountWarning'
                  : 'paymentDelivery.phoneWarning',
              )}
            </p>
          ))}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <ActionButton tone="primary" disabled={busy} onClick={() => void saveNote()}>
              {t('paymentDelivery.save')}
            </ActionButton>
            {saved && (
              <span role="status" className="text-sm text-ok-ink">
                {t('editor.saved')}
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
