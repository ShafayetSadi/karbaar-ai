import { useState } from 'react';
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
