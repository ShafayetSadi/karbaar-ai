import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AlarmClock } from 'lucide-react';
import { ActionButton, IconButton, Popover } from '../components/ui';
import { formatTime, formatWeekdayDateTime, formatWeekdayTime } from '../i18n/format';
import {
  fromDhakaInput,
  isLaterAllowed,
  laterOptions,
  toDhakaInput,
  type LaterOption,
} from './later';

const MAX_NOTE = 200;

function optionTime({ at, style }: LaterOption) {
  if (style === 'time') return formatTime(at);
  if (style === 'weekday') return formatWeekdayTime(at);
  return formatWeekdayDateTime(at);
}

/**
 * The thread header's "Later…" clock button: put the conversation off until a preset or a chosen time
 * in Dhaka, optionally saying why. `onSnooze` resolves true once the server accepted it.
 */
export function LaterMenu({
  onSnooze,
}: {
  onSnooze: (until: Date, note: string | null) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const noteId = useId();
  const [open, setOpen] = useState(false);
  // "Now" is taken when the menu opens, so the times shown are the times sent.
  const [openedAt, setOpenedAt] = useState(() => new Date());
  const [note, setNote] = useState('');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openChange(next: boolean) {
    if (next) {
      const now = new Date();
      setOpenedAt(now);
      setCustom(toDhakaInput(laterOptions(now)[3]!.at));
      setError(null);
    }
    setOpen(next);
  }

  async function choose(until: Date) {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (await onSnooze(until, note.trim() || null)) {
      setOpen(false);
      setNote('');
    } else {
      setError(t('inbox.later.failed'));
    }
    setBusy(false);
  }

  function submitCustom(event: FormEvent) {
    event.preventDefault();
    const until = fromDhakaInput(custom);
    if (!until || !isLaterAllowed(until, new Date())) {
      setError(t('inbox.later.outOfRange'));
      return;
    }
    void choose(until);
  }

  return (
    <Popover
      open={open}
      onOpenChange={openChange}
      className="w-[min(22rem,calc(100vw-2rem))] p-0"
      trigger={<IconButton icon={AlarmClock} label={t('inbox.later.button')} />}
    >
      <div className="space-y-2 border-b border-line p-3">
        <label htmlFor={noteId} className="block font-medium text-xs text-ink-muted">
          {t('inbox.later.why')}{' '}
          <span className="tracking-normal text-ink-faint normal-case">
            {t('inbox.later.optional')}
          </span>
        </label>
        <input
          id={noteId}
          value={note}
          maxLength={MAX_NOTE}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('inbox.later.notePlaceholder')}
          className="w-full rounded-md border border-line bg-panel-muted px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:outline-2 focus:outline-active"
        />
      </div>

      <ul className="border-b border-line p-1">
        {laterOptions(openedAt).map((option) => (
          <li key={option.preset}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void choose(option.at)}
              className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-active disabled:opacity-60"
            >
              <span>{t(`inbox.later.preset.${option.preset}`)}</span>
              <span className="tabular-nums text-xs whitespace-nowrap text-ink-muted">
                {optionTime(option)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={submitCustom} className="flex items-center gap-2 p-3">
        <input
          type="datetime-local"
          aria-label={t('inbox.later.custom')}
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-line bg-panel-muted px-2.5 py-1.5 tabular-nums text-sm text-ink focus:outline-2 focus:outline-active"
        />
        <ActionButton type="submit" tone="primary" disabled={busy}>
          {t('inbox.later.set')}
        </ActionButton>
      </form>

      {error && (
        <p role="alert" className="px-3 pb-3 text-xs text-danger-ink">
          {error}
        </p>
      )}
    </Popover>
  );
}
