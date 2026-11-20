import { PenLine, Send, Sparkles, Undo2, WandSparkles } from 'lucide-react';
import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useApproval } from '../auth/useApproval';
import { ApprovalLock } from '../components/ApprovalLock';
import { ActionButton, IconButton, Popover, cx } from '../components/ui';
import { formatDateTime, formatRemaining } from '../i18n/format';
import { AttachMenu } from './AttachMenu';
import { AttachmentTray } from './AttachmentTray';
import { CardTray } from './CardTray';
import { DictationButton } from './DictationButton';
import type { DictationState } from './useDictation';
import { useVoiceNote } from './useVoiceNote';
import { useMinuteClock } from './useMinuteClock';
import { VoiceNoteBar, VoiceNoteButton } from './VoiceNoteRecorder';
import { MAX_NOTE_LENGTH, type Generate } from './useGenerate';
import type { Attachments } from './useAttachments';
import type { ProductCards } from './useProductCards';

const MAX_LENGTH = 2000;
const ITEM =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-active disabled:opacity-50 disabled:hover:bg-transparent';

/**
 * The reply box, with the AI draft card above it. Ctrl/Cmd+Enter sends; Enter is a newline, as
 * it has always been. Grows from one line to about six as the merchant types.
 */
export function Composer({
  text,
  onTextChange,
  sending,
  error,
  conversationId,
  windowClosesAt,
  draftCard,
  replyRef,
  onSend,
  onSendVoiceNote,
  attachments,
  cards,
  generate,
  aiAvailable = true,
}: {
  text: string;
  onTextChange: (value: string) => void;
  sending: boolean;
  error: string | null;
  conversationId: string;
  windowClosesAt: string | null;
  draftCard: ReactNode;
  replyRef: RefObject<HTMLTextAreaElement | null>;
  onSend: () => void;
  /** Sends a recorded voice note (already uploaded) on its own; resolves to whether it went. */
  onSendVoiceNote: (mediaId: string) => Promise<boolean>;
  attachments: Attachments;
  /** Product cards for the reply; left out for a channel that cannot show them. */
  cards?: ProductCards;
  generate: Generate;
  aiAvailable?: boolean;
}) {
  const { t } = useTranslation();
  const now = useMinuteClock();
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dictation, setDictation] = useState<DictationState>('idle');
  const voice = useVoiceNote(onSendVoiceNote);
  const noText = text.trim() === '';
  const { locked } = useApproval();
  const canSend =
    !locked &&
    !sending &&
    !attachments.uploading &&
    !attachments.hasProblem &&
    (text.trim() !== '' || attachments.mediaIds.length > 0 || (cards?.items.length ?? 0) > 0);

  useLayoutEffect(() => {
    const box = replyRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight}px`;
  }, [text, replyRef]);

  return (
    <div className="shrink-0 space-y-2 border-t border-line p-3">
      {draftCard}
      <form
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          setDragging(false);
          const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
          if (files.length === 0) return;
          e.preventDefault();
          attachments.addFiles(files);
        }}
        className={cx(dragging && 'rounded-lg outline-2 outline-dashed outline-active')}
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      >
        {error && (
          <p role="alert" className="mb-2 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
            {error}
          </p>
        )}
        {generate.notice?.kind === 'error' && (
          <p role="alert" className="mb-2 rounded-md bg-warn px-3 py-2 text-sm text-warn-ink">
            {t(generate.notice.key)}
          </p>
        )}
        {generate.notice?.kind === 'undo' && (
          <p
            role="status"
            className="mb-2 flex items-center justify-between gap-2 rounded-md bg-ai/60 px-3 py-2 text-sm text-ai-ink"
          >
            {t('inbox.generate.polished')}
            <button
              type="button"
              onClick={generate.undo}
              className="inline-flex items-center gap-1 font-medium underline"
            >
              <Undo2 aria-hidden className="size-3.5" />
              {t('inbox.generate.undo')}
            </button>
          </p>
        )}
        <AttachmentTray attachments={attachments} />
        {cards && <CardTray cards={cards} />}
        <VoiceNoteBar voice={voice} />
        {/* One framed box: the reply on top, its tools and Send underneath, and the time left to
            answer between them, as Messenger-era composers do. */}
        <div className="rounded-lg border border-line bg-panel focus-within:border-active focus-within:ring-1 focus-within:ring-active">
          <label htmlFor="reply" className="sr-only">
            {t('inbox.reply')}
          </label>
          <div className="relative">
            <textarea
              id="reply"
              ref={replyRef}
              value={text}
              maxLength={MAX_LENGTH}
              // Read-only while polishing, so nothing typed meanwhile is overwritten by the result.
              readOnly={generate.polishing}
              aria-busy={generate.polishing}
              rows={1}
              onChange={(e) => onTextChange(e.target.value)}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files).filter((f) =>
                  f.type.startsWith('image/'),
                );
                if (files.length === 0) return; // plain text pastes as usual
                e.preventDefault();
                attachments.addFiles(files);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSend) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder={t('inbox.replyPlaceholder')}
              className={cx(
                // The frame is the box around it, which shows focus for the textarea and toolbar.
                'block max-h-36 w-full resize-none overflow-y-auto rounded-t-lg bg-transparent pt-2 pb-1 pl-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                // Room for the mic, or for the wider timer and "Transcribing…" controls.
                dictation === 'idle' ? 'pr-11' : 'pr-32',
              )}
            />
            <DictationButton
              conversationId={conversationId}
              // One microphone at a time: no dictating while a voice note is open.
              disabled={sending || generate.polishing || voice.state !== 'idle'}
              replyRef={replyRef}
              text={text}
              maxLength={MAX_LENGTH}
              onTextChange={onTextChange}
              onStateChange={setDictation}
            />
          </div>
          <div className="flex items-center gap-0.5 px-1.5 pb-1.5 [&>button:not([type=submit])]:border-transparent [&>button:not([type=submit])]:bg-transparent">
            <AttachMenu attachments={attachments} cards={cards} disabled={sending} />
            {aiAvailable && (
              <Popover
                open={menuOpen}
                onOpenChange={setMenuOpen}
                align="start"
                className="w-[min(18rem,calc(100vw-2rem))]"
                trigger={
                  <IconButton
                    icon={Sparkles}
                    label={t('inbox.generate.menu')}
                    disabled={sending}
                    aria-busy={generate.polishing || generate.waitingForDraft}
                  />
                }
              >
                <div role="menu" aria-label={t('inbox.generate.menu')} className="-m-1 space-y-0.5">
                  <button
                    type="button"
                    role="menuitem"
                    className={ITEM}
                    disabled={!generate.canRequestDraft}
                    onClick={() => {
                      setMenuOpen(false);
                      generate.newDraft();
                    }}
                  >
                    <Sparkles aria-hidden className="size-4" />
                    {t('inbox.generate.newDraft')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={ITEM}
                    disabled={noText || generate.noteTooLong || !generate.canRequestDraft}
                    aria-describedby={generate.noteTooLong ? 'note-too-long' : undefined}
                    onClick={() => {
                      setMenuOpen(false);
                      generate.draftFromNote();
                    }}
                  >
                    <PenLine aria-hidden className="size-4" />
                    {t('inbox.generate.fromNote')}
                  </button>
                  {generate.noteTooLong && (
                    <p id="note-too-long" className="px-2 pb-1 text-xs text-ink-faint">
                      {t('inbox.generate.noteTooLong', { max: MAX_NOTE_LENGTH })}
                    </p>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className={ITEM}
                    disabled={noText || generate.polishing}
                    onClick={() => {
                      setMenuOpen(false);
                      generate.polish();
                    }}
                  >
                    <WandSparkles aria-hidden className="size-4" />
                    {generate.polishing
                      ? t('inbox.generate.polishing')
                      : t('inbox.generate.polish')}
                  </button>
                </div>
              </Popover>
            )}
            <VoiceNoteButton voice={voice} disabled={sending || locked || dictation !== 'idle'} />
            {windowClosesAt &&
              (() => {
                const remaining = new Date(windowClosesAt).getTime() - now;
                const closed = remaining <= 0;
                const urgent = remaining < 2 * 60 * 60 * 1000;
                return (
                  <p
                    className={cx(
                      'ml-auto truncate px-2 text-xs tabular-nums',
                      urgent ? 'text-warn-ink' : 'text-ink-faint',
                    )}
                    title={formatDateTime(windowClosesAt)}
                    aria-label={
                      closed
                        ? t('inbox.error.windowClosed')
                        : t('inbox.windowOpenUntil', { when: formatDateTime(windowClosesAt) })
                    }
                  >
                    {closed
                      ? t('inbox.error.windowClosed')
                      : t('inbox.windowTimeLeft', {
                          duration: formatRemaining(windowClosesAt, now),
                        })}
                  </p>
                );
              })()}
            <ActionButton
              type="submit"
              // Lime only when there is something to send: a dimmed lime still reads as the main
              // action, and while an AI draft waits its own Send is that action.
              tone={canSend ? 'primary' : 'neutral'}
              icon={Send}
              disabled={!canSend}
              className={cx('shrink-0', !windowClosesAt && 'ml-auto')}
            >
              {sending ? t('common.pleaseWait') : t('inbox.send')}
            </ActionButton>
          </div>
        </div>
        {locked && <ApprovalLock className="mt-1.5" />}
      </form>
    </div>
  );
}
