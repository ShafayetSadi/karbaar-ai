import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { call } from '../../api/call';
import { FormError } from '../../components/ui';
import { DeliveryPanel } from '../DeliveryPanel';
import {
  checkDelivery,
  draftOfProduct as deliveryDraftOf,
  hasNoUsableOption,
  type DeliveryDraft,
  type DeliveryProblem,
} from '../delivery';
import { useDeliveryOptions } from '../useDeliveryOptions';
import type { Product } from '../ProductsPage';
import { DRAFT_ORDER, StaleNote, useDraft, useDraftSection } from './drafts';
import { Panel, type OnChange, useMutation } from './shared';

export function DeliveryEditor({ product, onChange }: { product: Product; onChange: OnChange }) {
  const { t } = useTranslation();
  const options = useDeliveryOptions();
  const { send, error, busy } = useMutation(onChange);
  // Until the options load, every option counts as ticked; a clean draft follows them once they do.
  const { draft, setDraft, dirty, stale, settle, reset } = useDraft<DeliveryDraft>(product, (p) =>
    deliveryDraftOf(p, options ?? []),
  );
  const [problem, setProblem] = useState<DeliveryProblem>();

  useDraftSection({
    id: 'delivery',
    label: t('productDelivery.title'),
    order: DRAFT_ORDER.delivery,
    dirty,
    validate: () => {
      const checked = checkDelivery(draft, options ?? []);
      setProblem(checked.ok ? undefined : checked.problem);
      return checked.ok;
    },
    save: async () => {
      const checked = checkDelivery(draft, options ?? []);
      if (!checked.ok) return false;
      const { delivery_option_ids, ...advance } = checked.value;
      // Two calls. If only the first lands, the draft is kept so Save tries again.
      const advanced = await send(() =>
        call(() =>
          api.PATCH('/v1/products/{product_id}', {
            params: { path: { product_id: product.id } },
            body: advance,
          }),
        ),
      );
      if (!advanced) return false;
      const next = await send(() =>
        call(() =>
          api.PUT('/v1/products/{product_id}/delivery-options', {
            params: { path: { product_id: product.id } },
            body: { delivery_option_ids },
          }),
        ),
      );
      settle(next ?? advanced, next !== null);
      return next !== null;
    },
    reset: () => {
      setProblem(undefined);
      reset();
    },
  });

  return (
    <Panel title={t('productDelivery.title')} hint={t('productDelivery.hint')} draft="delivery">
      <FormError error={error} />
      <StaleNote stale={stale} />
      <DeliveryPanel
        draft={draft}
        onChange={setDraft}
        options={options}
        problem={problem}
        unusable={options !== null && hasNoUsableOption(product, options)}
        disabled={busy}
      />
    </Panel>
  );
}
