import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { components } from '../api/schema';
import { ActionButton } from '../components/ui';
import { formatDateTime } from '../i18n/format';

type Connection = components['schemas']['ConnectionRead'];

export function PageEvidence({
  connection,
  owner,
  onChanged,
}: {
  connection: Connection;
  owner: boolean;
  onChanged: (connection: Connection | null) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const date = (value: string | null | undefined) =>
    value ? formatDateTime(value) : t('messenger.evidence.noDate');
  const problem =
    connection.subscription_state === 'missing' || connection.subscription_state === 'incomplete';

  async function check(subscribe: boolean) {
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.POST(subscribe ? '/v1/channels/messenger/resubscribe' : '/v1/channels/messenger/check'),
    );
    if (!mounted.current) return;
    if (result.ok) {
      onChanged(result.data.connection);
      setToken(result.data.token_acceptance);
      if (result.data.outcome === 'skipped') setError(t('messenger.evidence.stale'));
      window.dispatchEvent(new Event('commerce:channel-changed'));
    } else setError(result.error.message);
    setBusy(false);
  }

  return (
    <section
      aria-label={t('messenger.evidence.title')}
      className="space-y-3 rounded-md border border-line p-3"
    >
      <h3 className="font-medium text-ink">{t('messenger.evidence.title')}</h3>
      {problem && (
        <p role="alert" className="rounded-md bg-warn px-3 py-2 text-sm text-warn-ink">
          {t('messenger.evidence.problem')}
        </p>
      )}
      <dl className="space-y-2 text-sm text-ink-muted">
        <div>
          <dt>{t('messenger.evidence.token')}</dt>
          <dd>
            {t(
              `messenger.evidence.token_${token ?? (connection.token_status === 'broken' ? 'rejected' : 'unchecked')}`,
            )}
          </dd>
        </div>
        <div>
          <dt>{t('messenger.evidence.attempt')}</dt>
          <dd>
            <span>
              {t(
                `messenger.evidence.outcome_${connection.subscription_check_outcome ?? 'unchecked'}`,
              )}
            </span>{' '}
            · {date(connection.subscription_checked_at)}
          </dd>
        </div>
        <div>
          <dt>{t('messenger.evidence.observation')}</dt>
          <dd>
            <span>
              {connection.subscription_state === 'configured'
                ? t('messenger.evidence.configured')
                : connection.subscription_state
                  ? t(`messenger.evidence.state_${connection.subscription_state}`)
                  : t('messenger.evidence.unverified')}
            </span>{' '}
            · {date(connection.subscription_verified_at)}
          </dd>
        </div>
        {connection.subscription_missing_fields?.length ? (
          <div>
            <dt>{t('messenger.evidence.fields')}</dt>
            <dd>{connection.subscription_missing_fields.join(', ')}</dd>
          </div>
        ) : null}
        {connection.subscription_read_contract && (
          <div>
            <dt>{t('messenger.evidence.coverage')}</dt>
            <dd className="break-words">{connection.subscription_read_contract}</dd>
          </div>
        )}
        <div>
          <dt>{t('messenger.evidence.webhook')}</dt>
          <dd>{date(connection.last_webhook_received_at)}</dd>
        </div>
      </dl>
      <p className="text-sm text-ink-faint">{t('messenger.evidence.caveat')}</p>
      {error && (
        <p role="alert" className="text-sm text-danger-ink">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <ActionButton
          disabled={busy || connection.token_status !== 'active'}
          onClick={() => void check(false)}
        >
          {t('messenger.evidence.check')}
        </ActionButton>
        {owner && (
          <ActionButton
            disabled={busy || connection.token_status !== 'active'}
            onClick={() => void check(true)}
          >
            {t('messenger.evidence.subscribe')}
          </ActionButton>
        )}
      </div>
    </section>
  );
}
