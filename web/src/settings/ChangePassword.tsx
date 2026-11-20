import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import { ActionButton, Field, FormError } from '../components/ui';

const MIN_LENGTH = 10;

/** Asks for the current password, then signs every other device out (ADR 0059). */
export function ChangePassword() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState(false);

  function close() {
    setOpen(false);
    setCurrent('');
    setNext('');
    setAgain('');
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setDone(false);
    if (next.length < MIN_LENGTH) {
      return void setError({
        code: 'VALIDATION_ERROR',
        message: t('password.tooShort', { min: MIN_LENGTH }),
        fields: { new_password: t('password.tooShort', { min: MIN_LENGTH }) },
      });
    }
    if (next !== again) {
      return void setError({
        code: 'VALIDATION_ERROR',
        message: t('password.mismatch'),
        fields: { again: t('password.mismatch') },
      });
    }
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.POST('/v1/auth/me/password', {
        body: { current_password: current, new_password: next },
      }),
    );
    setBusy(false);
    if (!result.ok) return void setError(result.error);
    close();
    setDone(true);
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 max-w-prose">
          <h3 className="text-sm font-semibold text-ink">{t('password.title')}</h3>
          <p className="mt-1 text-sm text-ink-muted">{t('password.hint')}</p>
        </div>
        {!open && (
          <ActionButton
            onClick={() => {
              setDone(false);
              setOpen(true);
            }}
          >
            {t('password.change')}
          </ActionButton>
        )}
      </div>
      {done && (
        <p role="status" className="mt-3 text-sm text-ok-ink">
          {t('password.changed')}
        </p>
      )}
      {open && (
        <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-4 border-t border-line pt-4">
          <FormError error={error} />
          <div className="max-w-lg">
            <Field
              type="password"
              label={t('password.current')}
              value={current}
              autoComplete="current-password"
              required
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              type="password"
              label={t('password.new')}
              value={next}
              autoComplete="new-password"
              required
              error={error?.fields.new_password}
              onChange={(e) => setNext(e.target.value)}
            />
            <Field
              type="password"
              label={t('password.again')}
              value={again}
              autoComplete="new-password"
              required
              error={error?.fields.again}
              onChange={(e) => setAgain(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            <ActionButton type="submit" tone="primary" disabled={busy}>
              {t('password.save')}
            </ActionButton>
            <ActionButton disabled={busy} onClick={close}>
              {t('common.cancel')}
            </ActionButton>
          </div>
        </form>
      )}
    </div>
  );
}
