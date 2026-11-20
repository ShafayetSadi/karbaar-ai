import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import type { components } from '../api/schema';
import { useAuth } from '../auth/AuthProvider';
import { ActionButton, Chip, FormError } from '../components/ui';
import { formatDateTime } from '../i18n/format';

type Grant = components['schemas']['SupportAccessRead'];

/**
 * Who at Karbaar read this shop's content, why and until when. Everyone in the shop
 * sees the list; only the owner can end a grant, and the server enforces that.
 */
export function SupportAccess() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const owner = state.status === 'authenticated' && state.me.role === 'owner';
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/merchant/support-access')).then((result) => {
      if (cancelled) return;
      if (result.ok) setGrants(result.data.items);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function end(grant: Grant) {
    setError(null);
    const result = await call(() =>
      api.POST('/v1/merchant/support-access/{grant_id}/revoke', {
        params: { path: { grant_id: grant.id } },
      }),
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGrants((current) => current?.map((g) => (g.id === grant.id ? result.data : g)) ?? null);
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-ink">{t('supportAccess.title')}</h2>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
        {t('supportAccess.hint')} {owner && t('supportAccess.hintOwner')}
      </p>

      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('supportAccess.loadFailed')}
        </p>
      )}
      {grants?.length === 0 && (
        <p className="mt-4 rounded-md border border-dashed border-line bg-panel-muted px-4 py-6 text-center text-sm text-ink-muted">
          {t('supportAccess.empty')}
        </p>
      )}
      {grants && grants.length > 0 && (
        <ul className="mt-4 space-y-3">
          {grants.map((grant) => (
            <GrantRow
              key={grant.id}
              grant={grant}
              canEnd={owner && grant.status === 'active'}
              onEnd={() => void end(grant)}
            />
          ))}
        </ul>
      )}
      <FormError error={error} />
    </div>
  );
}

function GrantRow({ grant, canEnd, onEnd }: { grant: Grant; canEnd: boolean; onEnd: () => void }) {
  const { t } = useTranslation();
  const active = grant.status === 'active';
  const when = formatDateTime(grant.ended_at ?? grant.expires_at);
  const outcome = active
    ? t('supportAccess.until', { date: when })
    : grant.status === 'expired'
      ? t('supportAccess.ranOut', { date: when })
      : grant.ended_by === 'you'
        ? t('supportAccess.endedByYou', { date: when })
        : t('supportAccess.endedByStaff', { name: grant.staff_name, date: when });

  return (
    <li
      className={`flex flex-col items-start gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:p-4 ${active ? 'border-warn-ink/25 bg-warn/30' : 'border-line bg-panel-muted/50'}`}
    >
      <div className="min-w-0 flex-1 space-y-2 break-words">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{grant.staff_name}</span>
          <Chip tone={active ? 'warn' : 'neutral'}>
            {t(
              `supportAccess.${active ? 'active' : grant.status === 'expired' ? 'expired' : 'ended'}`,
            )}
          </Chip>
        </div>
        <p className="text-sm text-ink">{t('supportAccess.reason', { reason: grant.reason })}</p>
        <p className="flex flex-col gap-1 text-xs leading-relaxed text-ink-muted">
          <span>{t('supportAccess.granted', { date: formatDateTime(grant.granted_at) })}</span>
          <span>{outcome}</span>
        </p>
      </div>
      {canEnd && (
        <ActionButton
          className="shrink-0 self-end sm:self-center"
          size="sm"
          tone="danger"
          onClick={onEnd}
        >
          {t('supportAccess.end')}
        </ActionButton>
      )}
    </li>
  );
}
