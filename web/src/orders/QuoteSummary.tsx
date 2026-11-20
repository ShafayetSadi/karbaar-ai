import { useTranslation } from 'react-i18next';
import { formatBDT } from '../i18n/format';
import type { OrderQuote } from './orderForm';

/**
 * The server's price for an order: subtotal, savings, delivery, total, and the advance and cash on
 * delivery when an advance is asked. Shows the quote as given; nothing here adds up money.
 */
export function QuoteSummary({ quote }: { quote: OrderQuote }) {
  const { t } = useTranslation();
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
      <dt className="text-ink-muted">{t('orders.subtotal')}</dt>
      <dd className="text-right font-mono text-ink tabular-nums">
        {formatBDT(quote.subtotal_minor)}
      </dd>
      {quote.savings_minor > 0 && (
        <>
          <dt className="text-ink-muted">{t('orders.savings')}</dt>
          <dd className="text-right font-mono text-ok-ink tabular-nums">
            {formatBDT(quote.savings_minor)}
          </dd>
        </>
      )}
      {quote.discount_minor > 0 && (
        <>
          <dt className="text-ink-muted">{t('orders.form.couponDiscount')}</dt>
          <dd className="text-right font-mono text-ok-ink tabular-nums">
            −{formatBDT(quote.discount_minor)}
          </dd>
        </>
      )}
      <dt className="text-ink-muted">{t('orders.deliveryFee', { name: quote.delivery_name })}</dt>
      <dd className="text-right font-mono text-ink tabular-nums">
        {formatBDT(quote.delivery_fee_minor)}
      </dd>
      <dt className="border-t border-line pt-2 font-semibold text-ink">{t('orders.total')}</dt>
      <dd className="border-t border-line pt-2 text-right font-mono text-base font-semibold text-ink tabular-nums">
        {formatBDT(quote.total_minor)}
      </dd>
      {quote.advance_required_minor > 0 && (
        <>
          <dt className="text-ink-muted">
            {t('orders.form.advanceRequired')}
            {quote.advance_reason === 'customer' && (
              <span className="block text-xs text-warn-ink">
                {t('orders.form.advanceForCustomer')}
              </span>
            )}
          </dt>
          <dd className="text-right font-mono text-ink tabular-nums">
            {formatBDT(quote.advance_required_minor)}
          </dd>
          <dt className="text-ink-muted">{t('orders.form.codAfterAdvance')}</dt>
          <dd className="text-right font-mono font-semibold text-ink tabular-nums">
            {formatBDT(quote.cod_amount_minor)}
          </dd>
        </>
      )}
    </dl>
  );
}
