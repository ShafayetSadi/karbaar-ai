import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import { useAuth, type Me } from '../auth/AuthProvider';
import { ActionButton, Field, FormError } from '../components/ui';

/**
 * The shop's name, for the owner (ADR 0059).
 */
export function ShopName({ me }: { me: Me }) {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const [name, setName] = useState(me.merchant.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const changed = name.trim() !== me.merchant.name;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await call(() => api.PATCH('/v1/merchant', { body: { name: name.trim() } }));
    if (!result.ok) {
      setBusy(false);
      return void setError(result.error);
    }
    await refresh();
    setBusy(false);
    setSaved(true);
  }

  return (
    <form
      onSubmit={(e) => void save(e)}
      className="rounded-lg border border-line bg-panel p-4 sm:p-6"
    >
      <h3 className="text-sm font-semibold text-ink">{t('shopName.title')}</h3>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
        {t('shopName.teamHint')}
      </p>
      <div className="mt-4 space-y-4 border-t border-line pt-4">
        <FormError error={error} />
        <div className="max-w-lg">
          <Field
            label={t('shopName.label')}
            value={name}
            maxLength={120}
            error={error?.fields.name}
            onChange={(e) => {
              setSaved(false);
              setName(e.target.value);
            }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <ActionButton type="submit" tone="primary" disabled={busy || !changed || !name.trim()}>
            {t('shopName.save')}
          </ActionButton>
          {saved && !busy && (
            <span role="status" className="text-sm text-ok-ink">
              {t('editor.saved')}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
