import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { call } from '../../api/call';
import { FormError } from '../../components/ui';
import { factsPayload, type FactDraft } from '../options';
import { presetFactLabels, type ProductType } from '../presets';
import { FactsPanel } from '../FactsPanel';
import type { Product } from '../ProductsPage';
import { DRAFT_ORDER, StaleNote, useDraft, useDraftSection } from './drafts';
import { Panel, type OnChange, useMutation } from './shared';

const factsOf = (product: Product): FactDraft[] => product.attributes.map((a) => ({ ...a }));

export function FactsEditor({ product, onChange }: { product: Product; onChange: OnChange }) {
  const { t } = useTranslation();
  const { send, error, busy } = useMutation(onChange);
  const {
    draft: facts,
    setDraft: setFacts,
    dirty,
    stale,
    settle,
    reset,
  } = useDraft(product, factsOf);
  const type = product.product_type as ProductType;

  useDraftSection({
    id: 'facts',
    label: t('editor.facts'),
    order: DRAFT_ORDER.facts,
    dirty,
    // Empty facts are dropped when sending, so there is nothing to refuse.
    validate: () => true,
    save: async () => {
      const next = await send(() =>
        call(() =>
          api.PATCH('/v1/products/{product_id}', {
            params: { path: { product_id: product.id } },
            body: { attributes: factsPayload(facts) },
          }),
        ),
      );
      if (next) settle(next);
      return next !== null;
    },
    reset,
  });

  return (
    <Panel title={t('editor.facts')} hint={t('editor.factsHint')} draft="facts">
      <FormError error={error} />
      <StaleNote stale={stale} />
      <FactsPanel
        facts={facts}
        onChange={setFacts}
        suggestions={presetFactLabels(type)}
        disabled={busy}
      />
    </Panel>
  );
}
