export const ProductImageRefreshContext = createContext<(() => void) | null>(null);
import { createContext } from 'react';
import {
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { Copy, MoreHorizontal, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import { call } from '../../api/call';
import type { ApiError } from '../../api/errors';
import { unwrap } from '../../api/query';
import { Chip, IconButton, Menu, MenuItem, Skeleton } from '../../components/ui';
import { leadTimeRange } from '../availability';
import { OrganiseEditor } from '../OrganisePanel';
import { sizeChartFirst, type ProductType } from '../presets';
import { quantityDraftOf } from '../wholesale';
import type { Product } from '../ProductsPage';
import { StockPanel } from '../StockPanel';
import { AvailabilityEditor } from './AvailabilityEditor';
import { DeliveryEditor } from './DeliveryEditor';
import { AliasesEditor, DetailsPanel, VisualTerms } from './DetailsEditor';
import { FactsEditor } from './FactsEditor';
import { GalleryPanel, SizeChartImage } from './ImagesEditor';
import { PricingPanel } from './PricingEditor';
import { PostLinksPanel } from './PostLinksEditor';
import { ArchiveToggle, DeleteConfirm, useDuplicate } from './ProductActions';
import { SizeChartEditor } from './SizeChartEditor';
import { VariantsPanel } from './VariantsEditor';
import { WholesaleEditor } from './WholesaleEditor';
import { EditorDraftsProvider, useEditorDrafts } from './drafts';
import { MoreOptions, ProductLayout } from './ProductLayout';
import { SaveBar } from './SaveBar';
import { BackLink, OptionRow, Panel, wholesaleSummary } from './shared';

/** The product's row from any cached list page, if the list has been opened. */
function productFromList(queryClient: QueryClient, productId: string): Product | undefined {
  const lists = queryClient.getQueriesData<InfiniteData<{ items: Product[] }>>({
    queryKey: ['products', 'list'],
  });
  for (const [, data] of lists) {
    const hit = data?.pages.flatMap((page) => page.items).find((item) => item.id === productId);
    if (hit) return hit;
  }
  return undefined;
}

function EditorSkeleton() {
  const { t } = useTranslation();
  return (
    <section aria-busy className="space-y-6">
      <span className="sr-only">{t('editor.loading')}</span>
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </section>
  );
}

export function ExistingProduct({ productId }: { productId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Opened from the list, the row's copy shows at once and is refetched (`initialDataUpdatedAt: 0`
  // marks it stale). A deep link has no copy and shows the skeleton.
  const detail = useQuery({
    queryKey: ['products', 'detail', productId],
    queryFn: async () =>
      unwrap(
        await call(() =>
          api.GET('/v1/products/{product_id}', { params: { path: { product_id: productId } } }),
        ),
      ),
    initialData: () => productFromList(queryClient, productId),
    initialDataUpdatedAt: 0,
  });
  // A save puts the returned product in the cache and marks the list (and its counts) stale, so
  // going back shows the change.
  const setProduct = useCallback(
    (next: Product) => {
      queryClient.setQueryData(['products', 'detail', productId], next);
      void queryClient.invalidateQueries({ queryKey: ['products', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['products', 'stock-counts'] });
    },
    [queryClient, productId],
  );
  const [hasRefetched, setHasRefetched] = useState(false);
  const handleImageError = useCallback(() => {
    if (!hasRefetched) {
      setHasRefetched(true);
      void detail.refetch();
    }
  }, [hasRefetched, detail]);

  const product = detail.data;
  const gone = detail.isError && (detail.error as unknown as ApiError | null)?.code === 'NOT_FOUND';

  if (!product && !detail.isError) return <EditorSkeleton />;
  if (!product || gone) {
    return (
      <section className="space-y-4">
        <BackLink />
        <p role="alert" className="text-ink-muted">
          {t('editor.notFound')}
        </p>
      </section>
    );
  }

  return (
    <ProductImageRefreshContext.Provider value={handleImageError}>
      <EditorDraftsProvider>
        <ProductPage product={product} onChange={setProduct} />
      </EditorDraftsProvider>
    </ProductImageRefreshContext.Provider>
  );
}

/** What each row of More options holds, from the saved product (never the draft being typed). */
function rowSummaries(t: TFunction, product: Product) {
  const names = product.aliases.length;
  const facts = product.attributes.length;
  const lead = leadTimeRange(product.lead_time_days_min, product.lead_time_days_max);
  const availability =
    product.availability !== 'in_stock' && lead
      ? t(`availability.chip.${product.availability}`, { days: lead })
      : t(`availability.mode.${product.availability}`);
  const tiers = product.variants.find((v) => v.status === 'active')?.price_tiers.length ?? 0;
  return {
    assistant:
      names + facts === 0
        ? t('editor.notSet')
        : [
            names > 0 && t('editor.aliasCount', { count: names }),
            facts > 0 && t('editor.factCount', { count: facts }),
          ]
            .filter(Boolean)
            .join(' · '),
    organise:
      product.collection_ids.length > 0
        ? t('editor.summary.collections', { count: product.collection_ids.length })
        : t('editor.notSet'),
    availability,
    delivery:
      product.delivery_option_ids.length === 0
        ? t('editor.summary.allOptions')
        : t('editor.summary.options', { count: product.delivery_option_ids.length }),
    quantity: wholesaleSummary(t, quantityDraftOf(product), tiers),
    chart:
      product.size_chart.length > 0
        ? t('sizeChart.summary', { count: product.size_chart.length })
        : t('sizeChart.none'),
    links:
      product.post_links.length > 0
        ? t('editor.summary.links', { count: product.post_links.length })
        : t('editor.notSet'),
  };
}

function ProductPage({
  product,
  onChange,
}: {
  product: Product;
  onChange: (product: Product) => void;
}) {
  const { t } = useTranslation();
  const created = useLocation().state as {
    imagesFailed?: number;
    linkFailed?: boolean;
    limitFailed?: boolean;
  } | null;
  const imagesFailed = created?.imagesFailed ?? 0;
  const drafts = useEditorDrafts();
  const duplicate = useDuplicate(() => drafts?.allowLeave());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const summary = rowSummaries(t, product);
  const archived = product.status === 'archived';

  return (
    <>
      <ProductLayout
        title={product.name}
        status={
          <Chip tone={archived ? 'neutral' : 'ok'}>
            {t(archived ? 'editor.statusArchived' : 'editor.statusActive')}
          </Chip>
        }
        actions={
          <>
            <ArchiveToggle product={product} onChange={onChange} />
            <Menu trigger={<IconButton icon={MoreHorizontal} label={t('editor.actions')} />}>
              <MenuItem
                icon={Copy}
                onSelect={() => {
                  // The copy is of the saved product, and opening it leaves this page.
                  if (drafts?.dirty.length && !window.confirm(t('editor.leaveUnsaved'))) return;
                  void duplicate(product);
                }}
              >
                {t('editor.duplicate')}
              </MenuItem>
              <MenuItem icon={Trash2} onSelect={() => setConfirmingDelete(true)}>
                {t('editor.deleteMenu')}
              </MenuItem>
            </Menu>
          </>
        }
        notices={
          <>
            {confirmingDelete && (
              <DeleteConfirm
                product={product}
                onDeleted={() => drafts?.allowLeave()}
                onClose={() => setConfirmingDelete(false)}
              />
            )}
            {imagesFailed > 0 && (
              <p role="alert" className="rounded-md bg-warn p-3 text-sm text-warn-ink">
                {t('editor.imagesFailed', { count: imagesFailed })}
              </p>
            )}
            {created?.limitFailed && (
              <p role="alert" className="rounded-md bg-warn p-3 text-sm text-warn-ink">
                {t('productDelivery.limitFailed')}
              </p>
            )}
          </>
        }
        main={
          <>
            <DetailsPanel product={product} onChange={onChange} />
            <VariantsPanel product={product} onChange={onChange} />
            <div id="product-stock" className="scroll-mt-36">
              {product.track_inventory ? (
                <StockPanel product={product} />
              ) : (
                <Panel title={t('stock.title')}>
                  <p className="text-sm text-ink-muted">{t('availability.untrackedStock')}</p>
                </Panel>
              )}
            </div>
          </>
        }
        side={
          <>
            <GalleryPanel product={product} onChange={onChange} />
            <PricingPanel product={product} onChange={onChange} />
          </>
        }
        more={
          <MoreOptions>
            <OptionRow
              title={t('editor.assistantDetails')}
              summary={summary.assistant}
              areas={['aliases', 'facts']}
            >
              <AliasesEditor product={product} onChange={onChange} />
              <VisualTerms product={product} onChange={onChange} />
              <FactsEditor product={product} onChange={onChange} />
            </OptionRow>
            <OptionRow
              title={t('organise.panelTitle')}
              summary={summary.organise}
              areas={['organise']}
            >
              <OrganiseEditor product={product} onChange={onChange} />
            </OptionRow>
            <OptionRow
              title={t('availability.title')}
              summary={summary.availability}
              areas={['availability']}
            >
              <AvailabilityEditor product={product} onChange={onChange} />
            </OptionRow>
            <OptionRow
              title={t('productDelivery.title')}
              summary={summary.delivery}
              areas={['delivery']}
            >
              <DeliveryEditor product={product} onChange={onChange} />
            </OptionRow>
            <OptionRow
              title={t('wholesale.title')}
              summary={summary.quantity}
              areas={['wholesale']}
            >
              <WholesaleEditor product={product} onChange={onChange} />
            </OptionRow>
            <OptionRow
              title={t('editor.sizeChart')}
              summary={summary.chart}
              areas={['size-chart']}
              open={
                product.size_chart.length > 0 ||
                sizeChartFirst(product.product_type as ProductType) ||
                undefined
              }
            >
              <SizeChartImage product={product} onChange={onChange} />
              <SizeChartEditor product={product} onChange={onChange} />
            </OptionRow>
            <OptionRow title={t('editor.postLinks')} summary={summary.links} areas={['post-links']}>
              <PostLinksPanel product={product} onChange={onChange} failed={created?.linkFailed} />
            </OptionRow>
          </MoreOptions>
        }
        footer={<SaveBar />}
      />
    </>
  );
}
