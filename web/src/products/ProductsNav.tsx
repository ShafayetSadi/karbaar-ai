import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The Products section's header: the title, the page's own actions.
 */
export function ProductsHeader({ actions }: { actions?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold text-ink">{t('products.title')}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
