import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import type { components } from '../api/schema';
import { FormError } from '../components/ui';
import { Carousel } from '../inbox/TemplateMessage';
import type { StoreNotesAccess } from './StoreNotes';

type Card = components['schemas']['ProductCardRead'];

/**
 * Whether taps on product cards are answered at once by code: "বিস্তারিত" with photos and a
 * summary, "এটি নিতে চাই" with a choice of size. Off, a tap reaches the AI like a typed
 * message. The preview is one card built by the server from the newest product, so it matches
 * what a customer gets.
 */
export function ProductCards({ access }: { access: StoreNotesAccess }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = access === 'edit';

  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/merchant/ai-settings')).then((result) => {
      if (cancelled) return;
      if (!result.ok) return void setFailed(true);
      setEnabled(result.data.product_cards_enabled);
    });
    void call(() => api.GET('/v1/merchant/product-card-preview')).then((result) => {
      if (!cancelled) setCard(result.ok ? result.data.card : null);
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
          product_cards_enabled: next,
        },
      }),
    );
    setBusy(false);
    if (!result.ok) return void setError(result.error);
    setEnabled(result.data.product_cards_enabled);
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <h2 className="text-base font-semibold text-ink">{t('productCards.title')}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t('productCards.hint')}</p>
      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('productCards.loadFailed')}
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
              <span className="font-medium">{t('productCards.enable')}</span>
              <span className="block text-ink-muted">{t('productCards.enableHint')}</span>
            </span>
          </label>
          {!canEdit && (
            <p className="text-sm text-ink-muted">
              {t(access === 'staff' ? 'productCards.ownerOnly' : 'productCards.verifyFirst')}
            </p>
          )}
        </div>
      )}
      {card !== undefined && (
        <div className="mt-5">
          <h3 className="text-sm font-medium text-ink">{t('productCards.preview')}</h3>
          {card ? (
            <div className="mt-2">
              <Carousel cards={[card]} />
            </div>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              {t('productCards.noProducts')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
