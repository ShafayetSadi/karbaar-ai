import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import type { components } from '../api/schema';
import { useAuth } from '../auth/AuthProvider';
import { UserAvatar } from '../components/UserAvatar';
import { ActionButton, Chip, Field, FormError } from '../components/ui';
import { formatDateTime } from '../i18n/format';
import { useFeatures } from '../entitlements/useFeatures';
import { useMembers, type Member } from '../team/useMembers';

type Invite = components['schemas']['InviteRead'];

/**
 * Who is in the shop's team. Everyone sees the members; the owner also invites people, withdraws
 * pending invites and removes teammates. The server enforces who may do what.
 * When the shop has more than one member, each member also gets a Notifications card for their
 * own assignment-digest email preference.
 */
export function Team() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const { members, failed, reload } = useMembers();
  const features = useFeatures();
  const me = state.status === 'authenticated' ? state.me : null;
  const owner = me?.role === 'owner';

  return (
    <>
      <div className="rounded-lg border border-line bg-panel p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">{t('team.title')}</h2>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
          {t(owner ? 'team.hint' : 'team.hintStaff')}
        </p>

        {failed && (
          <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
            {t('team.loadFailed')}
          </p>
        )}
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {members.map((member) => (
            <MemberRow
              key={member.user_id}
              member={member}
              isMe={member.user_id === me?.user.id}
              canRemove={owner && member.role !== 'owner'}
              onRemoved={reload}
            />
          ))}
        </ul>

        {owner && me && (
          <Invites
            verified={me.user.email_verified}
            onChanged={() => {
              reload();
              features.reload();
            }}
            reached={features.isLimitReached('team_members_max')}
            current={features.currentOf('team_members_max')}
            limit={features.limitOf('team_members_max')}
          />
        )}
      </div>
      {members.length > 1 && <AssignmentNotifications />}
    </>
  );
}

/**
 * The signed-in member's own preference for assignment-digest emails. Visible to every member
 * (owner and staff) whenever the shop has teammates.
 */
function AssignmentNotifications() {
  const { t } = useTranslation();
  const [emailOnAssignment, setEmailOnAssignment] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/merchant/members/me/preferences')).then((result) => {
      if (cancelled) return;
      if (result.ok) setEmailOnAssignment(result.data.email_on_assignment);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(next: boolean) {
    const previous = emailOnAssignment;
    setEmailOnAssignment(next);
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.PATCH('/v1/merchant/members/me/preferences', {
        body: { email_on_assignment: next },
      }),
    );
    setBusy(false);
    if (result.ok) {
      setEmailOnAssignment(result.data.email_on_assignment);
    } else {
      setEmailOnAssignment(previous);
      setError(result.error);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-ink">{t('team.notifications.title')}</h2>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
        {t('team.notifications.hint')}
      </p>
      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('team.notifications.loadFailed')}
        </p>
      )}
      {emailOnAssignment !== null && (
        <div className="mt-4 space-y-3">
          <FormError error={error} />
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-panel-muted p-3 text-sm text-ink">
            <input
              type="checkbox"
              role="switch"
              aria-checked={emailOnAssignment}
              checked={emailOnAssignment}
              disabled={busy}
              onChange={(e) => void toggle(e.target.checked)}
              className="mt-1 size-4 shrink-0 accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-active"
            />
            <span>
              <span className="font-medium">{t('team.notifications.emailOnAssignment')}</span>
              <span className="block text-ink-muted">
                {t('team.notifications.emailOnAssignmentHint')}
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

function MemberRow({
  member,
  isMe,
  canRemove,
  onRemoved,
}: {
  member: Member;
  isMe: boolean;
  canRemove: boolean;
  onRemoved: () => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function remove() {
    const result = await call(() =>
      api.DELETE('/v1/merchant/members/{user_id}', {
        params: { path: { user_id: member.user_id } },
      }),
    );
    if (result.ok) onRemoved();
    else setError(result.error);
    setConfirming(false);
  }

  return (
    <li className="space-y-2 py-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:flex">
        <UserAvatar name={member.name} photoUrl={member.avatar_url} size="sm" />
        <span className="min-w-0 sm:flex-1">
          <span className="block truncate font-medium text-ink">
            {member.name}
            {isMe && <span className="font-normal text-ink-muted"> ({t('team.you')})</span>}
          </span>
          {member.name !== member.email && (
            <span className="block truncate text-sm text-ink-muted">{member.email}</span>
          )}
        </span>
        <Chip tone={member.role === 'owner' ? 'team' : 'neutral'}>
          {t(`team.role.${member.role === 'owner' ? 'owner' : 'staff'}`)}
        </Chip>
        {canRemove && !confirming && (
          <ActionButton
            size="sm"
            tone="ghost"
            className="justify-self-end sm:ml-auto"
            onClick={() => setConfirming(true)}
          >
            {t('team.remove')}
          </ActionButton>
        )}
      </div>
      {confirming && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-panel-muted p-3 text-sm">
          <span className="min-w-0 basis-full break-words text-ink sm:flex-1">
            {t('team.removeConfirm', { name: member.name })}
          </span>
          <ActionButton size="sm" tone="danger" onClick={() => void remove()}>
            {t('team.remove')}
          </ActionButton>
          <ActionButton size="sm" tone="ghost" onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </ActionButton>
        </div>
      )}
      <FormError error={error} />
    </li>
  );
}

function Invites({
  verified,
  onChanged,
  reached,
  current,
  limit,
}: {
  verified: boolean;
  onChanged: () => void;
  reached: boolean;
  current: number | null;
  limit: number | null;
}) {
  const { t } = useTranslation();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/merchant/invites')).then((result) => {
      if (!cancelled && result.ok) setInvites(result.data.items);
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const refresh = () => {
    setVersion((n) => n + 1);
    onChanged();
  };

  async function send(email: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    const result = await call(() => api.POST('/v1/merchant/invites', { body: { email } }));
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setSentTo(result.data.email);
    refresh();
    return true;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = String(new FormData(form).get('email') ?? '').trim();
    if (email && (await send(email))) form.reset();
  }

  async function revoke(invite: Invite) {
    setError(null);
    const result = await call(() =>
      api.DELETE('/v1/merchant/invites/{invite_id}', {
        params: { path: { invite_id: invite.id } },
      }),
    );
    if (result.ok) refresh();
    else setError(result.error);
  }

  return (
    <div className="mt-2 space-y-5 border-t border-line pt-5">
      {invites.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-ink">{t('team.pending')}</h3>
          <ul className="mt-2 divide-y divide-line">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="grid grid-cols-2 items-center gap-2 py-3 sm:flex sm:gap-3"
              >
                <span className="col-span-2 min-w-0 sm:flex-1">
                  <span className="block truncate text-ink">{invite.email}</span>
                  <span className="block text-xs text-ink-faint">
                    {invite.expired
                      ? t('team.expired')
                      : t('team.expiresOn', { date: formatDateTime(invite.expires_at) })}
                  </span>
                </span>
                <ActionButton size="sm" onClick={() => void send(invite.email)}>
                  {t('team.resend')}
                </ActionButton>
                <ActionButton size="sm" tone="ghost" onClick={() => void revoke(invite)}>
                  {t('team.revoke')}
                </ActionButton>
              </li>
            ))}
          </ul>
        </div>
      )}

      {reached ? (
        <p className="rounded-md bg-panel-muted p-3 text-sm text-ink-muted">
          {t('team.memberLimit', { current, limit })}
        </p>
      ) : (
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="space-y-3 rounded-md border border-line bg-panel-muted p-3 sm:p-4"
        >
          <h3 className="text-sm font-medium text-ink">{t('team.invite')}</h3>
          {!verified && <p className="text-sm text-warn-ink">{t('team.inviteNeedsVerified')}</p>}
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 sm:flex-1">
              <Field
                label={t('team.inviteEmail')}
                name="email"
                type="email"
                autoComplete="off"
                required
                disabled={!verified}
                error={error?.fields.email}
              />
            </div>
            <ActionButton type="submit" tone="primary" disabled={!verified || busy}>
              {t('team.inviteSend')}
            </ActionButton>
          </div>
          {sentTo && !error && (
            <p role="status" className="text-sm text-ok-ink">
              {t('team.inviteSent', { email: sentTo })}
            </p>
          )}
          <FormError error={error} />
        </form>
      )}
    </div>
  );
}
