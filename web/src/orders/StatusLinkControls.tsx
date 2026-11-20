import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { components } from '../api/schema';
import { ActionButton } from '../components/ui';
import { formatDateTime } from '../i18n/format';

export function StatusLinkControls({ orderId, owner }: { orderId: string; owner: boolean }) {
  const { t } = useTranslation();
  const [link, setLink] = useState<components['schemas']['StatusLink'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<'copied' | 'failed' | null>(null);
  async function act(reset: boolean) {
    setBusy(true);
    setMessage(null);
    const result = await call(() =>
      reset
        ? api.POST('/v1/orders/{order_id}/status-link/reset', {
            params: { path: { order_id: orderId } },
          })
        : api.POST('/v1/orders/{order_id}/status-link', {
            params: { path: { order_id: orderId } },
          }),
    );
    if (result.ok) {
      setLink(result.data);
      setConfirming(false);
      if (!reset && !result.data.expired) {
        try {
          await navigator.clipboard.writeText(result.data.url);
          setMessage('copied');
        } catch {
          setMessage('failed');
        }
      }
    } else setMessage('failed');
    setBusy(false);
  }
  return (
    <section className="space-y-3 rounded-lg border border-line bg-panel p-4">
      <div className="flex flex-wrap gap-2">
        <ActionButton disabled={busy} onClick={() => void act(false)}>
          {t('orderStatus.copy')}
        </ActionButton>
        {owner && (
          <ActionButton disabled={busy} onClick={() => setConfirming(true)}>
            {t('orderStatus.reset')}
          </ActionButton>
        )}
      </div>
      {confirming && (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">{t('orderStatus.resetHint')}</p>
          <div className="flex gap-2">
            <ActionButton disabled={busy} tone="danger" onClick={() => void act(true)}>
              {t('orderStatus.confirmReset')}
            </ActionButton>
            <ActionButton disabled={busy} onClick={() => setConfirming(false)}>
              {t('orders.keep')}
            </ActionButton>
          </div>
        </div>
      )}
      {link && (
        <p className="text-sm text-ink-muted">
          {t(link.expired ? 'orderStatus.expired' : 'orderStatus.expires', {
            date: formatDateTime(link.expires_at),
          })}
        </p>
      )}
      {message && (
        <p role={message === 'failed' ? 'alert' : 'status'} className="text-sm">
          {t(`orderStatus.${message}`)}
        </p>
      )}
    </section>
  );
}
