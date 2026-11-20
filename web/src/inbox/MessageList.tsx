import { MediaImage } from '../components/MediaImage';
import { useInRouterContext } from 'react-router-dom';
import { useUrlPanel } from '../navigation/useUrlPanel';
import { FileText, MousePointerClick, RotateCw, Sparkles, Trash2 } from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { components } from '../api/schema';
import { cx } from '../components/ui';
import { useStableSrc } from '../components/useStableSrc';
import { dhakaDay, formatDate, formatTime } from '../i18n/format';
import { CustomerAvatar } from './CustomerAvatar';
import { ImageLightbox } from './ImageLightbox';
import { QuickReplies, TemplateMessage } from './TemplateMessage';
import { useMinuteClock } from './useMinuteClock';
import { VoicePlayer } from './VoicePlayer';
import { VoiceTranscript } from './VoiceTranscript';

export type Message = components['schemas']['MessageRead'];

const DAY = 24 * 60 * 60 * 1000;

/** Messages from the same sender on the same day, sent within this many minutes of the previous
 * one, form a run: one label over it, one time and status line under it. Membership chains
 * through the previous message, so a burst sent a few minutes apart stays one run. */
const RUN_WINDOW_MS = 5 * 60 * 1000;

/** Most photos drawn as an overlapping collage; more go in a grid. */
const COLLAGE_MAX = 3;

/** Who a message is from, for grouping a run of bubbles under one label or avatar. A reply sent
 * from an AI draft starts its own run, so a typed reply after it gets the plain Team label. */
function sender(message: Message): string {
  if (message.direction === 'in') return 'customer';
  return message.from_draft ? `${message.author}:draft` : message.author;
}

/** Whether a message continues the previous one's run: same sender, same day in Dhaka, and sent
 * within `RUN_WINDOW_MS` of it. */
function continuesRun(previous: Message, message: Message, byLabel = true): boolean {
  const same = byLabel
    ? sender(previous) === sender(message)
    : previous.direction === message.direction && previous.author === message.author;
  return (
    same &&
    dhakaDay(previous.sent_at) === dhakaDay(message.sent_at) &&
    Date.parse(message.sent_at) - Date.parse(previous.sent_at) <= RUN_WINDOW_MS
  );
}

/**
 * The conversation, oldest first: day separators, the customer's bubbles on the left and the
 * AI's, the team's and replies sent from elsewhere on the right, each run under one label.
 */
export function MessageList({
  messages,
  customerName,
  customerPhotoUrl = null,
  loaded,
  failed,
  hasOlder,
  onLoadOlder,
  bottomRef,
  historyImportedBefore,
  onResend,
  onDelete,
  onOrder,
}: {
  /** Oldest first. */
  messages: Message[];
  customerName: string | null;
  /** The photo `ThreadHeader` shows; initials when absent. */
  customerPhotoUrl?: string | null;
  loaded: boolean;
  failed: boolean;
  hasOlder: boolean;
  onLoadOlder: () => void;
  bottomRef: RefObject<HTMLDivElement | null>;
  /** The cutoff `conversations.history_imported_before`: everything strictly before it was
   * imported from Messenger, not received live. Null when no import ran for this conversation. */
  historyImportedBefore?: string | null;
  /** Send a failed reply again, or delete it. Resolve false when it did not work. */
  onResend?: (message: Message) => Promise<boolean>;
  onDelete?: (message: Message) => Promise<boolean>;
  /** Start an order with this product, from a card we sent. */
  onOrder?: (productId: string) => void;
}) {
  const { t } = useTranslation();
  // Ticks so "Today" turns into "Yesterday" past midnight without a reload.
  const now = useMinuteClock();
  const today = dhakaDay(now);
  const yesterday = dhakaDay(now - DAY);

  // Whether the merchant is reading the newest messages. The log changes size after the thread
  // has scrolled to the end (images load, the draft card appears, the reply box grows); while
  // at the bottom, stay there.
  const atBottom = useRef(true);
  const logRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const log = logRef.current;
    if (!log || !contentRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (atBottom.current) log.scrollTop = log.scrollHeight;
    });
    observer.observe(log);
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  function dayLabel(day: string) {
    if (day === today) return t('inbox.today');
    if (day === yesterday) return t('inbox.yesterday');
    return formatDate(day);
  }

  // The first message received live (not imported), so the divider sits right above it. -1 when
  // every message is live, or there is nothing to divide (no cutoff, or everything is before it).
  const cutoff = historyImportedBefore ? Date.parse(historyImportedBefore) : null;
  const firstLiveIndex =
    cutoff !== null ? messages.findIndex((m) => Date.parse(m.sent_at) >= cutoff) : -1;
  const showHistoryDivider = firstLiveIndex > 0;

  return (
    <div
      role="log"
      aria-label={t('inbox.messages')}
      ref={logRef}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      onScroll={(e) => {
        const box = e.currentTarget;
        atBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      }}
    >
      <div ref={contentRef} className="space-y-1">
        {hasOlder && (
          <button
            type="button"
            onClick={onLoadOlder}
            className="mx-auto block text-xs font-medium text-ink-muted underline hover:text-ink"
          >
            {t('inbox.loadOlder')}
          </button>
        )}
        {failed && (
          <p role="alert" className="rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
            {t('inbox.threadFailed')}
          </p>
        )}
        {loaded && !failed && messages.length === 0 && (
          <p className="text-center text-sm text-ink-faint">{t('inbox.noMessages')}</p>
        )}
        {messages.map((m, i) => {
          const previous = messages[i - 1];
          const day = dhakaDay(m.sent_at);
          const newDay = !previous || dhakaDay(previous.sent_at) !== day;
          // Same sender, day and window: one run, so one label and one time and status line.
          const firstOfRun = newDay || !continuesRun(previous, m);
          const showsStatusLine = showsLine(messages, i, t);
          return (
            <Fragment key={m.id}>
              {newDay && (
                <p className="flex items-center gap-3 py-3 text-xs font-medium text-ink-faint before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
                  {dayLabel(day)}
                </p>
              )}
              {showHistoryDivider && i === firstLiveIndex && (
                <p className="py-2 text-center text-xs text-ink-faint">
                  {t('inbox.historyImported')}
                </p>
              )}
              <MessageBubble
                message={m}
                customerName={customerName}
                customerPhotoUrl={customerPhotoUrl}
                firstOfRun={firstOfRun}
                showsStatusLine={showsStatusLine}
                onResend={onResend}
                onDelete={onDelete}
                onOrder={onOrder}
              />
            </Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

const OUTBOUND = {
  agent: 'bg-ai text-ink',
  merchant: 'bg-team text-ink',
  system: 'border border-line bg-panel-muted text-ink',
  page_external: 'border border-line bg-panel text-ink',
} as const;

/** The customer edited this message in Messenger. Tapping "Edited" shows the first version, so a
 * changed phone number or address can be compared by eye; there is no diff. */
function EditedNote({ originalText }: { originalText?: string | null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="max-w-full px-1 text-xs text-ink-muted">
      {originalText != null ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="font-medium underline hover:text-ink"
        >
          {t('inbox.edited')}
        </button>
      ) : (
        <span className="font-medium">{t('inbox.edited')}</span>
      )}
      {open && originalText != null && (
        <p data-testid="original-text" className="mt-0.5 font-mono break-words whitespace-pre-wrap">
          {t('inbox.originally', { text: originalText })}
        </p>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  customerName,
  customerPhotoUrl,
  firstOfRun,
  showsStatusLine,
  onResend,
  onDelete,
  onOrder,
}: {
  message: Message;
  customerName: string | null;
  customerPhotoUrl: string | null;
  firstOfRun: boolean;
  showsStatusLine: boolean;
  onResend?: (message: Message) => Promise<boolean>;
  onDelete?: (message: Message) => Promise<boolean>;
  onOrder?: (productId: string) => void;
}) {
  const { t } = useTranslation();
  const outbound = message.direction === 'out';
  const images = message.attachments.filter((a) => a.type === 'image');
  const others = message.attachments.filter((a) => a.type !== 'image');
  const tone = outbound
    ? (OUTBOUND[message.author as keyof typeof OUTBOUND] ?? OUTBOUND.page_external)
    : 'bg-panel-muted text-ink';
  // The customer tapped a button or quick reply we sent: its title, shown as a tap, not as words.
  const tapped = !outbound && message.payload != null && message.text != null;

  return (
    <div className={cx('flex gap-2', firstOfRun && 'pt-2', outbound && 'justify-end')}>
      {!outbound && (
        <span className="mb-5 w-6 shrink-0 self-end">
          {firstOfRun && (
            <CustomerAvatar name={customerName} photoUrl={customerPhotoUrl} size="xs" />
          )}
        </span>
      )}
      <div
        className={cx('flex max-w-[75%] flex-col gap-1', outbound ? 'items-end' : 'items-start')}
      >
        {outbound && firstOfRun && (
          <AuthorLabel author={message.author} fromDraft={message.from_draft} />
        )}
        {message.reply_to && (
          <p
            data-testid="reply-quote"
            className="max-w-full truncate rounded border-l-2 border-line bg-panel-muted/60 px-2 py-1 text-xs text-ink-muted"
          >
            {message.reply_to.text ??
              t('inbox.attachmentType', { type: message.reply_to.attachment_type ?? '' })}
          </p>
        )}
        {images.length === 1 && images[0] && (
          <Attachment
            identity={`${message.id}:0`}
            attachment={images[0]}
            outbound={outbound}
            failed={isFailure(message)}
          />
        )}
        {images.length > 1 && images.length <= COLLAGE_MAX && (
          // Two or three photos: overlapping square cards that alternate sides, the last one on
          // the sender's side, as Messenger draws them.
          <div data-testid="photo-collage" className="flex w-[min(12.2rem,52vw)] flex-col">
            {images.map((a, i) => (
              <div
                key={i}
                className={cx(
                  i > 0 && '-mt-4',
                  ((images.length - 1 - i) % 2 === 0) === outbound ? 'self-end' : 'self-start',
                )}
              >
                <Attachment
                  identity={`${message.id}:${i}`}
                  attachment={a}
                  outbound={outbound}
                  failed={isFailure(message)}
                  tile="collage"
                />
              </div>
            ))}
          </div>
        )}
        {images.length > COLLAGE_MAX && (
          // Four or more: Messenger shows one photo on a pile, but the merchant should see every
          // photo that went out, so they stay in a two-column grid.
          <div data-testid="photo-grid" className="grid grid-cols-2 gap-1">
            {images.map((a, i) => (
              <Attachment
                key={i}
                identity={`${message.id}:${i}`}
                attachment={a}
                outbound={outbound}
                failed={isFailure(message)}
                tile="grid"
              />
            ))}
          </div>
        )}
        {message.template && <TemplateMessage template={message.template} onOrder={onOrder} />}
        {tapped ? (
          // A tap is an event, not words: a quiet line beside the avatar, no bubble or frame.
          <p className="flex max-w-full items-center gap-1.5 px-1 py-1 text-xs break-words text-ink-muted">
            <MousePointerClick aria-hidden className="size-3.5 shrink-0" />
            <span>{t('inbox.tapped', { title: message.text })}</span>
          </p>
        ) : (
          (message.text || others.length > 0) && (
            <div
              className={cx(
                'max-w-full rounded-2xl px-3.5 py-2 text-sm',
                outbound ? 'rounded-br-md' : 'rounded-bl-md',
                tone,
              )}
            >
              {others.map((a, i) => (
                <Attachment key={i} identity={`${message.id}:${i}`} attachment={a} />
              ))}
              {message.text && <p className="break-words whitespace-pre-wrap">{message.text}</p>}
            </div>
          )
        )}
        {message.quick_replies.length > 0 && <QuickReplies items={message.quick_replies} />}
        {!outbound && message.edited_at && <EditedNote originalText={message.original_text} />}
        {showsStatusLine && (
          <p className="px-1 tabular-nums text-xs text-ink-faint">
            {formatTime(message.sent_at)}
            {outbound && (
              <span className={isFailure(message) ? 'text-danger-ink' : undefined}>
                {` · ${statusLabel(message, t)}`}
              </span>
            )}
          </p>
        )}
        {outbound && isFailure(message) && onResend && onDelete && (
          <FailedActions message={message} onResend={onResend} onDelete={onDelete} />
        )}
      </div>
    </div>
  );
}

/** Send again or delete, under a reply that did not go out. Neither shows while it may still
 * arrive (`unknown`): only `failed` is final. */
function FailedActions({
  message,
  onResend,
  onDelete,
}: {
  message: Message;
  onResend: (message: Message) => Promise<boolean>;
  onDelete: (message: Message) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function run(action: (message: Message) => Promise<boolean>) {
    setBusy(true);
    setError(false);
    // On success the bubble moves or goes away; only a failure needs this one to reset.
    if (!(await action(message))) {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-1 text-xs">
      {error && (
        <span role="alert" className="text-danger-ink">
          {t('inbox.failedActions.error')}
        </span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(onResend)}
        className="flex items-center gap-1 font-medium text-ink-muted hover:text-ink disabled:opacity-50"
      >
        <RotateCw aria-hidden className="size-3.5" />
        {t('inbox.failedActions.resend')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (window.confirm(t('inbox.failedActions.deleteConfirm'))) void run(onDelete);
        }}
        className="flex items-center gap-1 font-medium text-ink-muted hover:text-danger-ink disabled:opacity-50"
      >
        <Trash2 aria-hidden className="size-3.5" />
        {t('inbox.failedActions.delete')}
      </button>
    </div>
  );
}

function AuthorLabel({ author, fromDraft }: { author: Message['author']; fromDraft: boolean }) {
  const { t } = useTranslation();
  // The bubble's colour already says who wrote it, so the label is plain text: no icons.
  if (author === 'agent') {
    return <span className="px-1 text-xs font-medium text-ai-ink">{t('inbox.author.ai')}</span>;
  }
  if (author === 'system') {
    return (
      <span className="px-1 text-xs font-medium text-ink-faint">{t('inbox.author.system')}</span>
    );
  }
  if (author === 'merchant') {
    return (
      <span
        title={fromDraft ? t('inbox.author.fromDraftTitle') : undefined}
        className="flex items-center gap-1.5 px-1 text-xs font-medium"
      >
        <span className="text-ink-faint">{t('inbox.author.team')}</span>
        {fromDraft && (
          <span className="inline-flex items-center gap-0.5 text-ai-ink">
            <Sparkles aria-hidden className="size-3" />
            {t('inbox.author.fromDraft')}
          </span>
        )}
      </span>
    );
  }
  return <span className="px-1 text-xs text-ink-faint">{t('inbox.sentElsewhere')}</span>;
}

// An auto reply dropped because the customer wrote again while it was being typed (ADR 0021): the
// agent answers their newer message instead, so this is no failure to act on.
const SUPERSEDED = 'superseded_by_customer';
// The rest of a send is not sent once one message of it fails (images go out in order).
const PREVIOUS_FAILED = 'previous_failed';
// The recording would not convert to audio Messenger plays.
const VOICE_FAILED = 'audio_transcode_failed';

/** Whether a message has not settled: it is still sending, unconfirmed, or did not go out. A
 * delivered or read message has moved on, so a run that is part read, part delivered is no
 * reason for a line in the middle (read receipts arrive as a watermark). */
function isUnsettled(message: Message): boolean {
  return (
    message.send_status !== 'sent' && message.delivered_at === null && message.read_at === null
  );
}

/** Whether the message at `index` carries the time and status line: the last of its run, plus
 * (outbound only) a failed message and one that is unsettled while the end of its run is not
 * (still sending in a delivered run, say). Those speak for themselves. */
function showsLine(messages: Message[], index: number, t: (key: string) => string): boolean {
  const message = messages[index];
  if (!message) return false;
  let last = message;
  for (let i = index + 1; i < messages.length; i += 1) {
    const candidate = messages[i];
    if (!candidate || !continuesRun(last, candidate, false)) break;
    last = candidate;
  }
  if (last === message) return true;
  if (message.direction !== 'out') return false;
  return (
    isFailure(message) || (isUnsettled(message) && statusLabel(message, t) !== statusLabel(last, t))
  );
}

function isFailure(message: Message): boolean {
  return message.send_status === 'failed' && message.error !== SUPERSEDED;
}

function statusLabel(message: Message, t: (key: string) => string): string {
  if (message.read_at) return t('inbox.status.read');
  if (message.delivered_at) return t('inbox.status.delivered');
  switch (message.send_status) {
    case 'queued':
      return t('inbox.status.queued');
    case 'unknown':
      // Not confirmed by Meta yet; it settles to sent or failed. Never offer a resend meanwhile.
      return t('inbox.status.unknown');
    case 'failed':
      if (message.error === SUPERSEDED) return t('inbox.status.superseded');
      if (message.error === VOICE_FAILED) return t('inbox.status.voiceFailed');
      return t(
        message.error === PREVIOUS_FAILED ? 'inbox.status.previousFailed' : 'inbox.status.failed',
      );
    default:
      return t('inbox.status.sent');
  }
}

type AttachmentProps = {
  identity: string;
  attachment: components['schemas']['AttachmentRead'];
  outbound?: boolean;
  failed?: boolean;
  /** One of several photos: a card in the collage (overlapping) or a cell in the grid. */
  tile?: 'collage' | 'grid';
};

function Attachment(props: AttachmentProps) {
  const routed = useInRouterContext();
  const [open, setOpen] = useState(false);
  if (routed && props.attachment.type === 'image') return <RoutedAttachment {...props} />;
  return <AttachmentBody {...props} open={open} setOpen={setOpen} />;
}

function RoutedAttachment(props: AttachmentProps) {
  const [open, setOpen] = useUrlPanel('image', props.identity);
  return <AttachmentBody {...props} open={open} setOpen={setOpen} />;
}

function AttachmentBody({
  attachment,
  outbound = false,
  failed = false,
  tile,
  open,
  setOpen,
}: AttachmentProps & { open: boolean; setOpen: (value: boolean) => void }) {
  const { t } = useTranslation();
  const image = useStableSrc(
    attachment.type === 'image' ? (attachment.medium_url ?? attachment.url) : null,
  );
  const voice = useStableSrc(attachment.type === 'audio' ? attachment.url : null);
  const video = useStableSrc(attachment.type === 'video' ? attachment.url : null);
  if (attachment.type === 'audio') {
    // The transcript shows even when the audio cannot load: that is when it matters most.
    return (
      <>
        {voice.src ? (
          <VoicePlayer src={voice.src} onError={voice.onError} />
        ) : (
          <span className="block text-xs italic opacity-80">{t('inbox.voiceUnavailable')}</span>
        )}
        <VoiceTranscript transcript={attachment.transcript} status={attachment.transcript_status} />
      </>
    );
  }
  if (attachment.type === 'image') {
    if (!image.src) {
      return (
        <span className="block text-xs text-ink-faint italic">
          {t('inbox.attachmentType', { type: attachment.type })}
        </span>
      );
    }
    const alt = t(outbound ? 'inbox.sentImageAlt' : 'inbox.imageAlt');
    return (
      <>
        <button
          type="button"
          aria-label={t('inbox.openImage')}
          onClick={() => setOpen(true)}
          className="cursor-zoom-in rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-active"
        >
          <MediaImage
            image={attachment}
            size="medium"
            src={image.src}
            onError={image.onError}
            alt={alt}
            className={cx(
              'rounded-2xl border object-cover',
              tile === 'collage' && 'aspect-square h-auto w-[min(9rem,38vw)] ring-2 ring-panel',
              tile === 'grid' && 'aspect-square h-auto w-[min(8rem,32vw)]',
              !tile && 'h-auto max-h-56 max-w-[min(14rem,70vw)]',
              failed ? 'border-danger-ink opacity-60' : 'border-line',
            )}
          />
        </button>
        {open && (
          <ImageLightbox
            mediaId={attachment.media_id}
            originalUrl={attachment.url}
            src={attachment.large_url ?? image.src}
            alt={alt}
            onClose={() => setOpen(false)}
          />
        )}
      </>
    );
  }
  if (attachment.type === 'video') {
    if (!video.src) {
      return (
        <span className="block text-xs text-ink-faint italic">
          {t('inbox.attachmentType', { type: attachment.type })}
        </span>
      );
    }
    return (
      <video
        src={video.src}
        onError={video.onError}
        controls
        playsInline
        preload="metadata"
        aria-label={t(outbound ? 'inbox.sentVideoLabel' : 'inbox.videoLabel')}
        className={cx(
          'h-auto max-h-80 max-w-[min(20rem,70vw)] rounded-2xl border bg-black',
          failed ? 'border-danger-ink opacity-60' : 'border-line',
        )}
      />
    );
  }
  if (attachment.type === 'file') {
    const name = attachment.title ?? t('inbox.file');
    // A stored document downloads from a short-lived link; one we did not keep is only a name.
    if (attachment.url && /^https?:\/\//i.test(attachment.url)) {
      return (
        <a
          href={attachment.url}
          target="_blank"
          rel="noreferrer noopener"
          download={attachment.title ?? undefined}
          aria-label={t('inbox.downloadFile', { name })}
          className="mb-1 flex max-w-[min(20rem,70vw)] items-center gap-2 text-sm underline"
        >
          <FileText aria-hidden size={18} className="shrink-0" />
          <span className="truncate">{name}</span>
        </a>
      );
    }
    return (
      <span className="mb-1 flex max-w-[min(20rem,70vw)] items-center gap-2 text-sm">
        <FileText aria-hidden size={18} className="shrink-0 opacity-70" />
        <span className="min-w-0">
          <span className="block truncate">{name}</span>
          <span className="block text-xs italic opacity-80">{t('inbox.fileNotStored')}</span>
        </span>
      </span>
    );
  }
  // Shared posts and links: show the link only when it is a plain web URL.
  if (attachment.url && /^https?:\/\//i.test(attachment.url)) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noreferrer noopener"
        className="mb-1 block text-sm underline"
      >
        {attachment.title ?? t('inbox.sharedLink')}
      </a>
    );
  }
  return (
    <span className="mb-1 block text-xs italic opacity-80">
      {t('inbox.attachmentType', { type: attachment.type })}
    </span>
  );
}
