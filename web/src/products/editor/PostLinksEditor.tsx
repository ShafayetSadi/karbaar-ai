import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { call } from '../../api/call';
import { ActionButton, Chip, Field, FormError, cx, fieldClass } from '../../components/ui';
import type { Product } from '../ProductsPage';
import { Panel, type OnChange, useMutation } from './shared';

export function PostLinksPanel({
  product,
  onChange,
  failed,
}: {
  product: Product;
  onChange: OnChange;
  failed?: boolean;
}) {
  const { t } = useTranslation();
  const { run, error, busy } = useMutation(onChange);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const ok = await run(() =>
      call(() =>
        api.POST('/v1/products/{product_id}/post-links', {
          params: { path: { product_id: product.id } },
          body: {
            kind: form.get('kind') === 'ad' ? 'ad' : 'post',
            external_id: String(form.get('external_id')),
            permalink: String(form.get('permalink') ?? '').trim() || null,
          },
        }),
      ),
    );
    if (ok) formElement.reset();
  }

  return (
    <Panel title={t('editor.postLinks')} hint={t('editor.postLinksHint')}>
      {failed && (
        <p role="alert" className="rounded-md bg-warn p-3 text-sm text-warn-ink">
          {t('editor.linkFailed')}
        </p>
      )}
      <FormError error={error} />
      <ul className="divide-y divide-line">
        {product.post_links.map((link) => (
          <li key={link.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            <Chip tone={link.kind === 'ad' ? 'team' : 'neutral'}>
              {t(link.kind === 'ad' ? 'editor.kindAd' : 'editor.kindPost')}
            </Chip>
            <span className="font-mono text-ink">{link.external_id}</span>
            {link.permalink && (
              <a
                href={link.permalink}
                target="_blank"
                rel="noreferrer noopener"
                className="truncate text-active hover:underline"
              >
                {link.permalink}
              </a>
            )}
            <span className="ml-auto">
              <ActionButton
                tone="danger"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    call(() =>
                      api.DELETE('/v1/products/{product_id}/post-links/{link_id}', {
                        params: { path: { product_id: product.id, link_id: link.id } },
                      }),
                    ),
                  )
                }
              >
                {t('editor.removeLink')}
              </ActionButton>
            </span>
          </li>
        ))}
      </ul>
      <div className="@container">
        <form
          onSubmit={onSubmit}
          className="grid gap-3 @xl:grid-cols-[8rem_1fr_1fr_auto] @xl:items-end"
        >
          <label className="block text-sm font-medium text-ink-muted">
            {t('editor.linkKind')}
            <select name="kind" className={cx('mt-1 block w-full', fieldClass)}>
              <option value="post">{t('editor.kindPost')}</option>
              <option value="ad">{t('editor.kindAd')}</option>
            </select>
          </label>
          <Field label={t('editor.linkExternalId')} name="external_id" required maxLength={128} />
          <Field label={t('editor.linkPermalink')} name="permalink" type="url" maxLength={500} />
          <ActionButton type="submit" tone="primary" disabled={busy}>
            {t('editor.addLink')}
          </ActionButton>
        </form>
      </div>
    </Panel>
  );
}
