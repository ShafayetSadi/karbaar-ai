import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { call } from '../../api/call';
import { FormError } from '../../components/ui';
import { SizeChartPanel } from '../SizeChartPanel';
import { chartDraftOf, chartPayload, type ChartDraft, type ChartProblem } from '../sizeChart';
import type { Product } from '../ProductsPage';
import { DRAFT_ORDER, StaleNote, useDraft, useDraftSection } from './drafts';
import { Panel, type OnChange, useMutation } from './shared';

const chartOf = (product: Product): ChartDraft => chartDraftOf(product.size_chart);

export function SizeChartEditor({ product, onChange }: { product: Product; onChange: OnChange }) {
  const { t } = useTranslation();
  const { send, error, busy } = useMutation(onChange);
  const { draft, setDraft, dirty, stale, settle, reset } = useDraft(product, chartOf);
  const [problems, setProblems] = useState<ChartProblem[]>([]);

  useDraftSection({
    id: 'size-chart',
    label: t('sizeChart.title'),
    order: DRAFT_ORDER.sizeChart,
    dirty,
    validate: () => {
      const checked = chartPayload(draft);
      setProblems('problems' in checked ? checked.problems : []);
      return !('problems' in checked);
    },
    save: async () => {
      const checked = chartPayload(draft);
      if ('problems' in checked) return false;
      const next = await send(() =>
        call(() =>
          api.PUT('/v1/products/{product_id}/size-chart', {
            params: { path: { product_id: product.id } },
            body: { rows: checked.rows },
          }),
        ),
      );
      if (next) settle(next);
      return next !== null;
    },
    reset: () => {
      setProblems([]);
      reset();
    },
  });

  return (
    <Panel title={t('sizeChart.title')} hint={t('sizeChart.hint')} draft="size-chart">
      <FormError error={error} />
      <StaleNote stale={stale} />
      <SizeChartPanel draft={draft} problems={problems} onChange={setDraft} disabled={busy} />
    </Panel>
  );
}
