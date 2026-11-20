import { useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ArrowUpRight, Copy, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { call } from '../../api/call';
import { IconButton, Menu, MenuItem, cx, useToast } from '../../components/ui';
import type { Product } from '../ProductsPage';

type Status = 'active' | 'archived';

/** Archives or restores a product, then refreshes every products query (rows, counts, tabs). */
function useSetStatus() {
  const queryClient = useQueryClient();
  return async (product: Product, status: Status) => {
    const result = await call(() =>
      api.PATCH('/v1/products/{product_id}', {
        params: { path: { product_id: product.id } },
        body: { status },
      }),
    );
    if (result.ok) void queryClient.invalidateQueries({ queryKey: ['products'] });
    return result;
  };
}

/**
 * A row's or card's `⋯`: open, duplicate, archive or restore. Archiving is undoable from its
 * toast, so it asks for no confirmation.
 */
export function RowMenu({
  product,
  onDuplicate,
  card = false,
}: {
  product: Product;
  onDuplicate: (product: Product) => void;
  /** On a grid card it floats over the photo, so it keeps its own background. */
  card?: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const setStatus = useSetStatus();
  const archived = product.status === 'archived';

  async function change(next: Status, undoable: boolean) {
    const result = await setStatus(product, next);
    if (!result.ok) return toast({ message: result.error.message, tone: 'danger' });
    toast({
      message: t(next === 'archived' ? 'products.archived' : 'products.restored', {
        name: product.name,
      }),
      tone: 'ok',
      action: undoable
        ? {
            label: t('products.undo'),
            onClick: () => void change(next === 'archived' ? 'active' : 'archived', false),
          }
        : undefined,
    });
  }

  return (
    <Menu
      trigger={
        <IconButton
          icon={MoreHorizontal}
          label={t('products.rowActions', { name: product.name })}
          className={cx(
            'group-hover:text-ink focus-visible:text-ink data-[state=open]:text-ink',
            card
              ? 'absolute top-2 right-2 z-10 bg-panel/90 text-ink-muted'
              : 'border-transparent bg-transparent text-ink-faint',
          )}
        />
      }
    >
      <MenuItem asChild>
        <Link to={`/products/${product.id}`} state={{ fromList: true }}>
          <ArrowUpRight aria-hidden className="size-4 text-ink-muted" />
          {t('products.open')}
        </Link>
      </MenuItem>
      <MenuItem icon={Copy} onSelect={() => onDuplicate(product)}>
        {t('products.duplicateItem')}
      </MenuItem>
      <MenuItem
        icon={archived ? ArchiveRestore : Archive}
        onSelect={() => void change(archived ? 'active' : 'archived', true)}
      >
        {t(archived ? 'products.restore' : 'products.archive')}
      </MenuItem>
    </Menu>
  );
}
