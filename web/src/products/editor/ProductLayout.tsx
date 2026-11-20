import type { FormEventHandler, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorHeader } from './EditorHeader';

/** Where the jump links go; the panels of both product pages carry these ids. */
export const SECTIONS = [
  { id: 'product-info', label: 'editor.productInformation' },
  { id: 'product-pricing', label: 'editor.pricingShort' },
  { id: 'product-variants', label: 'editor.variants' },
  { id: 'product-more', label: 'editor.moreOptions' },
] as const;

/**
 * The frame of the new and the existing product page, so they cannot drift apart: the sticky
 * header, then two columns (information and variants on the left, gallery and pricing on the
 * right) and the "More options" card below. A page with a `form` wraps everything under the header
 * in it.
 */
export function ProductLayout({
  title,
  status,
  actions,
  notices,
  main,
  side,
  more,
  form,
  footer,
}: {
  title: string;
  status?: ReactNode;
  actions: ReactNode;
  notices?: ReactNode;
  main: ReactNode;
  side: ReactNode;
  more: ReactNode;
  form?: {
    id: string;
    onSubmit: FormEventHandler<HTMLFormElement>;
    onChange?: FormEventHandler<HTMLFormElement>;
  };
  footer?: ReactNode;
}) {
  const body = (
    <>
      {notices}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7 xl:col-span-8">{main}</div>
        <div className="space-y-6 lg:col-span-5 xl:col-span-4">{side}</div>
      </div>
      {more}
    </>
  );
  return (
    <section className="space-y-6">
      <EditorHeader title={title} status={status} sections={SECTIONS} actions={actions} />
      {form ? (
        <form id={form.id} onSubmit={form.onSubmit} onChange={form.onChange} className="space-y-6">
          {body}
        </form>
      ) : (
        body
      )}
      {footer}
    </section>
  );
}

/** The card under the columns: every optional setting as a row that shows its current value. */
export function MoreOptions({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div id="product-more" className="scroll-mt-36 rounded-lg border border-line bg-panel">
      <div className="border-b border-line px-6 py-5">
        <h2 className="text-lg font-semibold text-ink">{t('editor.moreOptions')}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t('editor.moreOptionsHint')}</p>
      </div>
      <div className="divide-y divide-line">{children}</div>
    </div>
  );
}
