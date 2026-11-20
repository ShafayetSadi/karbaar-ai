import { StickyNote } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import { ActionButton, Section } from '../components/ui';

const MAX_LENGTH = 2000;

/**
 * The team's note on the customer (`customer.notes`): one per customer, not per conversation, so
 * it follows them into every chat. Click to edit; saving an empty note clears it.
 */
export function TeamNote({
  customer,
  onSaved,
}: {
  customer: { id: string; notes: string | null };
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const note = customer.notes;

  function startEditing() {
    setValue(note ?? '');
    setError(null);
    setEditing(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const next = value.trim() || null;
    if (next === (note ?? null)) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.PATCH('/v1/customers/{customer_id}', {
        params: { path: { customer_id: customer.id } },
        body: { notes: next },
      }),
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(false);
    onSaved();
  }

  return (
    <Section
      title={t('inbox.panel.teamNote')}
      icon={StickyNote}
      count={note ? 1 : null}
      storageKey="inbox.panel.note"
    >
      {editing ? (
        <form
          aria-label={t('inbox.panel.noteEdit')}
          onSubmit={(e) => void save(e)}
          className="space-y-2"
        >
          <label htmlFor="team-note" className="sr-only">
            {t('inbox.panel.noteLabel')}
          </label>
          <textarea
            id="team-note"
            value={value}
            maxLength={MAX_LENGTH}
            rows={3}
            // Opened by the merchant's click, so moving focus here is expected.
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            className="block w-full resize-y rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-active focus:ring-1 focus:ring-active focus:outline-none"
          />
          <p className="text-xs text-ink-faint">{t('inbox.panel.noteHint')}</p>
          {error && (
            <p role="alert" className="rounded-md bg-danger px-3 py-2 text-danger-ink">
              {error.message}
            </p>
          )}
          <div className="flex gap-1.5">
            <ActionButton type="submit" size="sm" tone="primary" disabled={busy}>
              {busy ? t('common.pleaseWait') : t('inbox.customerEdit.save')}
            </ActionButton>
            <ActionButton size="sm" tone="ghost" disabled={busy} onClick={() => setEditing(false)}>
              {t('inbox.customerEdit.cancel')}
            </ActionButton>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className="block w-full rounded-md border border-line bg-panel-muted px-3 py-2.5 text-left text-sm hover:border-active/50 focus-visible:outline-2 focus-visible:outline-active"
        >
          <span className="sr-only">{t('inbox.panel.noteEdit')}: </span>
          {note ? (
            <span className="break-words whitespace-pre-wrap text-ink">{note}</span>
          ) : (
            <span className="text-ink-faint">{t('inbox.panel.noteEmpty')}</span>
          )}
        </button>
      )}
    </Section>
  );
}
