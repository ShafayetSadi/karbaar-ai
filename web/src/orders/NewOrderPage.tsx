import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { OrderForm } from './OrderForm';
import { EMPTY_VALUES } from './orderForm';

/** An order typed by hand (a phone call, a walk-in), without a conversation. */
export function NewOrderPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          to="/orders"
          aria-label={t('orders.back')}
          className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-panel text-ink-muted transition-colors hover:bg-panel-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-active"
        >
          <ArrowLeft aria-hidden className="size-4" />
        </Link>
        <div className="flex items-baseline gap-2 text-xl">
          <Link to="/orders" className="text-ink-muted hover:text-ink hover:underline">
            {t('orders.title')}
          </Link>
          <span aria-hidden className="text-ink-faint">
            /
          </span>
          <h1 className="font-bold text-ink">{t('orders.newTitle')}</h1>
        </div>
      </div>
      <p className="-mt-3 text-sm text-ink-muted">{t('orders.newHint')}</p>
      <OrderForm
        layout="page"
        initial={EMPTY_VALUES}
        onCreated={(order) => void navigate(`/orders/${order.id}`, { replace: true })}
      />
    </section>
  );
}
