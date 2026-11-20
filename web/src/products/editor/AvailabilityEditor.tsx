import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { call } from '../../api/call';
import { FormError } from '../../components/ui';
import { AvailabilityPanel } from '../AvailabilityPanel';
import {
  checkAvailability,
  draftOfProduct,
  type AvailabilityDraft,
  type AvailabilityProblem,
} from '../availability';
import type { Product } from '../ProductsPage';
import { DRAFT_ORDER, StaleNote, useDraft, useDraftSection } from './drafts';
import { Panel, type OnChange, useMutation } from './shared';

export function AvailabilityEditor({
  product,
  onChange,
}: {
  product: Product;
  onChange: OnChange;
}) {
  const { t } = useTranslation();
  const { send, error, busy } = useMutation(onChange);
  const { draft, setDraft, dirty, stale, settle, reset } = useDraft<AvailabilityDraft>(
    product,
    draftOfProduct,
  );
  const [problem, setProblem] = useState<AvailabilityProblem>();

  useDraftSection({
    id: 'availability',
    label: t('availability.title'),
    order: DRAFT_ORDER.availability,
    dirty,
    validate: () => {
      const checked = checkAvailability(draft);
      setProblem(checked.ok ? undefined : checked.problem);
      return checked.ok;
    },
    save: async () => {
      const checked = checkAvailability(draft);
      if (!checked.ok) return false;
      const next = await send(() =>
        call(() =>
          api.PATCH('/v1/products/{product_id}', {
            params: { path: { product_id: product.id } },
            body: checked.value,
          }),
        ),
      );
      if (next) settle(next);
      return next !== null;
    },
    reset: () => {
      setProblem(undefined);
      reset();
    },
  });

  return (
    <Panel title={t('availability.title')} hint={t('availability.hint')} draft="availability">
      <FormError error={error} />
      <StaleNote stale={stale} />
      <AvailabilityPanel draft={draft} onChange={setDraft} problem={problem} disabled={busy} />
    </Panel>
  );
}
