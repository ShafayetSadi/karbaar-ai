import { Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import { useAuth, type Me } from '../auth/AuthProvider';
import { UserAvatar } from '../components/UserAvatar';
import { ActionButton, Chip, Field, FormError } from '../components/ui';
import { uploadImage } from '../media/uploadImage';

/** `01712345678` for a stored `+8801712345678`, which is how people write their own number. */
function localPhone(phone: string | null | undefined): string {
  return phone?.startsWith('+88') ? phone.slice(3) : (phone ?? '');
}

/**
 * The signed-in person: photo, name and phone. Everyone edits their own; the email is
 * the login and stays read-only. The shop name is shown for context, and renamed in `ShopName`.
 */
export function Profile({ me }: { me: Me }) {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const isOwner = me.role === 'owner';
  const shownName = me.user.name?.trim() || null;

  function startEditing() {
    setName(me.user.name ?? '');
    setPhone(localPhone(me.user.phone));
    setError(null);
    setSaved(false);
    setEditing(true);
  }

  async function patch(body: {
    name?: string;
    phone?: string | null;
    avatar_media_id?: string | null;
  }) {
    setBusy(true);
    setError(null);
    const result = await call(() => api.PATCH('/v1/auth/me/profile', { body }));
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return false;
    }
    await refresh();
    setBusy(false);
    return true;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      return void setError({
        code: 'VALIDATION_ERROR',
        message: t('profile.nameRequired'),
        fields: { name: t('profile.nameRequired') },
      });
    }
    if (await patch({ name: trimmed, phone: phone.trim() || null })) {
      setEditing(false);
      setSaved(true);
    }
  }

  async function pickPhoto(file: File) {
    setBusy(true);
    setError(null);
    const uploaded = await uploadImage(file, {
      code: 'UPLOAD_FAILED',
      message: t('profile.photoFailed'),
      fields: {},
    });
    if (!uploaded.ok) {
      setBusy(false);
      return void setError(uploaded.error);
    }
    await patch({ avatar_media_id: uploaded.data });
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <UserAvatar name={shownName ?? me.merchant.name} photoUrl={me.user.avatar_url} size="lg" />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-semibold text-ink">{t('settings.account')}</h3>
          <Chip tone="neutral">{t(isOwner ? 'settings.roleOwner' : 'settings.roleStaff')}</Chip>
        </div>
        {!editing && (
          <ActionButton className="shrink-0" onClick={startEditing}>
            {t('profile.edit')}
          </ActionButton>
        )}
      </div>

      {editing ? (
        <form onSubmit={(e) => void save(e)} className="mt-4 space-y-4 border-t border-line pt-4">
          <FormError error={error} />
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-panel-muted p-3">
            <ActionButton disabled={busy} onClick={() => fileInput.current?.click()}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {t(me.user.avatar_url ? 'profile.changePhoto' : 'profile.addPhoto')}
            </ActionButton>
            {me.user.avatar_url && (
              <ActionButton
                tone="ghost"
                disabled={busy}
                onClick={() => void patch({ avatar_media_id: null })}
              >
                {t('profile.removePhoto')}
              </ActionButton>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={t('profile.photoInput')}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void pickPhoto(file);
                e.target.value = '';
              }}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('profile.name')}
              value={name}
              maxLength={80}
              autoComplete="name"
              error={error?.fields.name}
              onChange={(e) => setName(e.target.value)}
            />
            <Field
              label={t('profile.phone')}
              value={phone}
              inputMode="tel"
              autoComplete="tel"
              placeholder="01712345678"
              error={error?.fields.phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <p className="text-sm text-ink-muted">{t('profile.phoneHint')}</p>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            <ActionButton type="submit" tone="primary" disabled={busy}>
              {t('profile.save')}
            </ActionButton>
            <ActionButton disabled={busy} onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </ActionButton>
          </div>
        </form>
      ) : (
        <>
          <dl className="mt-4 grid gap-x-6 gap-y-4 border-t border-line pt-4 text-sm sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <dt className="text-xs font-medium text-ink-faint">{t('profile.name')}</dt>
              <dd className="break-words text-ink">
                {shownName ?? <span className="text-ink-muted">{t('profile.noName')}</span>}
              </dd>
            </div>
            <div className="min-w-0 space-y-1">
              <dt className="text-xs font-medium text-ink-faint">{t('profile.phone')}</dt>
              <dd className="font-mono text-ink">
                {me.user.phone ? (
                  localPhone(me.user.phone)
                ) : (
                  <span className="font-sans text-ink-muted">{t('profile.noPhone')}</span>
                )}
              </dd>
            </div>
            <div className="min-w-0 space-y-1">
              <dt className="text-xs font-medium text-ink-faint">{t('settings.email')}</dt>
              <dd className="break-all text-ink">{me.user.email}</dd>
            </div>
            <div className="min-w-0 space-y-1">
              <dt className="text-xs font-medium text-ink-faint">{t('settings.merchant')}</dt>
              <dd className="break-words text-ink">{me.merchant.name}</dd>
            </div>
          </dl>
          <FormError error={error} />
          {saved && (
            <p role="status" className="mt-3 text-sm text-ok-ink">
              {t('editor.saved')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
