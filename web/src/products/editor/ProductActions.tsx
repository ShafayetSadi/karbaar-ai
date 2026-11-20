import { useFeatures } from '../../entitlements/useFeatures';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { call } from '../../api/call';
import type { ApiError } from '../../api/errors';
import { ActionButton, useToast } from '../../components/ui';
import type { Product } from '../ProductsPage';
import { type OnChange, useMutation } from './shared';

export function ArchiveToggle({ product, onChange }: { product: Product; onChange: OnChange }) {
  const { t } = useTranslation();
  const { run, error, busy } = useMutation(onChange);
  const archived = product.status === 'archived';
  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-sm text-danger-ink">{error.message}</span>}
      <ActionButton
        disabled={busy}
        tone={archived ? 'neutral' : 'danger'}
        onClick={() =>
          void run(() =>
            call(() =>
              api.PATCH('/v1/products/{product_id}', {
                params: { path: { product_id: product.id } },
                body: { status: archived ? 'active' : 'archived' },
              }),
            ),
          )
        }
      >
        {t(archived ? 'editor.restore' : 'editor.archive')}
      </ActionButton>
    </div>
  );
}

export function StorefrontToggle({ product, onChange }: { product: Product; onChange: OnChange }) {
  const { t } = useTranslation();
  const website = useFeatures().isEnabled('website', false);
  const { run, error, busy } = useMutation(onChange);
  const [storefrontReady, setStorefrontReady] = useState(false);
  useEffect(() => {
    if (!website) return;
    let active = true;
    void call(() => api.GET('/v1/storefront/settings')).then((result) => {
      if (active && result.ok) setStorefrontReady(result.data.status === 'live');
    });
    return () => {
      active = false;
    };
  }, [website]);
  if (!website) return null;
  const shown = product.show_on_storefront;
  return (
    <div className="flex flex-col items-end gap-1">
      <ActionButton
        tone={shown ? 'soft-ok' : 'neutral'}
        disabled={busy || !storefrontReady}
        aria-pressed={shown}
        onClick={() =>
          void run(() =>
            call(() =>
              api.PATCH('/v1/products/{product_id}', {
                params: { path: { product_id: product.id } },
                body: { show_on_storefront: !shown },
              }),
            ),
          )
        }
      >
        {t(shown ? 'editor.shownOnStorefront' : 'editor.showOnStorefront')}
      </ActionButton>
      {error && (
        <span role="alert" className="text-xs text-danger-ink">
          {error.message}
        </span>
      )}
    </div>
  );
}

/** Copies the product and opens the copy. A failure is reported in a toast. */
export function useDuplicate(onCreated?: () => void) {
  const navigate = useNavigate();
  const toast = useToast();
  return async (product: Product) => {
    const result = await call(() =>
      api.POST('/v1/products/{product_id}/duplicate', {
        params: { path: { product_id: product.id } },
      }),
    );
    if (result.ok) {
      onCreated?.();
      void navigate(`/products/${result.data.id}`);
    } else toast({ message: result.error.message, tone: 'danger' });
  };
}

/** Delete for good, after an inline confirmation. Only a product never ordered can be deleted:
 * the API refuses one on any order (PRODUCT_HAS_ORDERS), and the message says to archive it. */
export function DeleteConfirm({
  product,
  onClose,
  onDeleted,
}: {
  product: Product;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.DELETE('/v1/products/{product_id}', { params: { path: { product_id: product.id } } }),
    );
    setBusy(false);
    if (result.ok) {
      onDeleted?.();
      void navigate('/products', { replace: true });
    } else setError(result.error);
  }

  return (
    <div className="space-y-2 rounded-md bg-panel-muted p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-ink">{t('editor.deleteConfirm')}</span>
        <ActionButton size="sm" tone="danger" disabled={busy} onClick={() => void remove()}>
          {t('editor.delete')}
        </ActionButton>
        <ActionButton size="sm" tone="ghost" disabled={busy} onClick={onClose}>
          {t('common.cancel')}
        </ActionButton>
      </div>
      {error && (
        <p role="alert" className="text-danger-ink">
          {error.code === 'PRODUCT_HAS_ORDERS' ? t('editor.deleteHasOrders') : error.message}
        </p>
      )}
    </div>
  );
}
