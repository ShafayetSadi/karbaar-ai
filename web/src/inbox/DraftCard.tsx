import { MediaImage } from '../components/MediaImage';
import { Pencil, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { components } from '../api/schema';
import { ActionButton, Chip, Kbd, Tooltip, TooltipProvider } from '../components/ui';
import { Carousel } from './TemplateMessage';

export type Draft = components['schemas']['DraftRead'];
export type RejectReason = NonNullable<components['schemas']['RejectDraft']['reason']>;

const REASONS: RejectReason[] = ['wrong_product', 'wrong_info', 'tone', 'other'];
const onMac = () => /Mac|iPhone|iPad/.test(navigator.userAgent);
const KNOWN_FLAGS = new Set([
  'price_mismatch',
  'currency_mismatch',
  'stock_mismatch',
  'unknown_product_ref',
  'card_unknown_product',
  'choice_unknown_id',
  'size_mismatch',
  'product_mismatch',
  'language_mismatch',
  'honorific_misuse',
  'details_other_product',
  'delivery_zone_guessed',
  'photos_not_sendable',
  'shop_info_mismatch',
  'knowledge_mismatch',
  'knowledge_unknown_source',
]);
// Flags whose detail is only an id: it means nothing to the merchant, so it is not shown, and the
// same warning twice is shown once.
const ID_FLAGS = new Set([
  'unknown_product_ref',
  'card_unknown_product',
  'choice_unknown_id',
  'photos_not_sendable',
]);

/** The warnings as the merchant reads them: each once, with its detail when that is a name. */
function flagLines(flags: Draft['flags'], t: (key: string) => string): string[] {
  const lines = flags.map((flag) => {
    const text = KNOWN_FLAGS.has(flag.code) ? t(`inbox.draft.flag.${flag.code}`) : flag.code;
    return flag.detail && !ID_FLAGS.has(flag.code) ? `${text} (${flag.detail})` : text;
  });
  return [...new Set(lines)];
}

/**
 * The AI's proposed reply. Nothing is sent until the merchant acts: send it as written, edit it in
 * the composer first, or reject it (optionally saying why). What they do is recorded server-side
 * as the draft's outcome. Product cards the AI chose show under the text as the customer will get
 * them; the merchant can remove any before sending (`removedCards`, kept by the thread so an edited
 * send leaves them out too). Quick replies the AI offers (category or size buttons) show as chips
 * the same way (`removedChoices`). A reply to a Details tap goes with more photos of the product,
 * sent before the text; they show above it and can be removed too (`removedPhotos`).
 */
export function DraftCard({
  draft,
  editing,
  busy,
  error,
  removedCards = [],
  onRemoveCard,
  onRestoreCards,
  removedChoices = [],
  onRemoveChoice,
  onRestoreChoices,
  removedPhotos = [],
  onRemovePhoto,
  onRestorePhotos,
  onSend,
  onEdit,
  onStopEditing,
  onReject,
}: {
  draft: Draft;
  editing: boolean;
  busy: boolean;
  error: string | null;
  removedCards?: string[];
  onRemoveCard?: (productId: string) => void;
  onRestoreCards?: () => void;
  removedChoices?: string[];
  onRemoveChoice?: (choiceId: string) => void;
  onRestoreChoices?: () => void;
  removedPhotos?: string[];
  onRemovePhoto?: (mediaId: string) => void;
  onRestorePhotos?: () => void;
  onSend: () => void;
  onEdit: () => void;
  onStopEditing: () => void;
  onReject: (reason: RejectReason | null) => void;
}) {
  const { t } = useTranslation();
  const [choosingReason, setChoosingReason] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (
        !(event.target instanceof HTMLElement) ||
        event.target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)
      )
        return;
      if (event.key.toLowerCase() === 'r' && !busy) {
        event.preventDefault();
        setChoosingReason(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy]);
  const cards = draft.cards.filter(
    (card) => !card.product_id || !removedCards.includes(card.product_id),
  );
  const choices = (draft.choices?.items ?? []).filter((item) => !removedChoices.includes(item.id));
  const photos = (draft.photos ?? [])
    .map((photo, i) => ({ ...photo, n: i + 1 }))
    .filter((photo) => !removedPhotos.includes(photo.media_id));

  return (
    <section
      aria-label={t('inbox.draft.title')}
      // The left rule marks it as the AI's, waiting: a proposal above the box, not a sent bubble.
      className="rounded-lg border border-l-[3px] border-ai-ink/25 border-l-ai-ink bg-ai/40 px-3.5 py-3 text-sm"
    >
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ai-ink">
        <Sparkles aria-hidden className="size-3.5" />
        {t('inbox.draft.title')}
      </h3>

      {draft.flags.length > 0 && (
        <div role="alert" className="mt-2 space-y-1">
          <p className="text-xs font-medium text-warn-ink">{t('inbox.draft.flagsTitle')}</p>
          <ul className="flex flex-wrap gap-1">
            {flagLines(draft.flags, t).map((line) => (
              <li key={line}>
                <Chip tone="warn" className="leading-snug whitespace-normal">
                  {line}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      )}

      {draft.needs_human && (
        <p className="mt-2">
          <Chip tone="warn" className="leading-snug whitespace-normal">
            {t('inbox.draft.needsHuman')}
          </Chip>
        </p>
      )}

      {photos.length > 0 && (
        <ul aria-label={t('inbox.draft.photos')} className="mt-2 flex flex-wrap gap-1.5">
          {photos.map((photo) => (
            <li key={photo.media_id} className="relative">
              {photo.url ? (
                <MediaImage
                  src={photo.url}
                  alt={t('inbox.draft.photo', { n: photo.n })}
                  className="size-16 rounded-md border border-line object-cover"
                />
              ) : (
                <div className="size-16 rounded-md border border-line bg-panel-muted" />
              )}
              {onRemovePhoto && !busy && (
                <button
                  type="button"
                  onClick={() => onRemovePhoto(photo.media_id)}
                  aria-label={t('inbox.draft.removePhoto', { n: photo.n })}
                  className="absolute -top-1.5 -right-1.5 rounded-full border border-line bg-panel p-0.5 hover:bg-panel-muted"
                >
                  <X aria-hidden className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {removedPhotos.length > 0 && (
        <p className="mt-1 text-xs text-ink-muted">
          {t('inbox.draft.photosRemoved', { count: removedPhotos.length })}{' '}
          {onRestorePhotos && (
            <button type="button" onClick={onRestorePhotos} className="font-medium underline">
              {t('inbox.draft.restoreCards')}
            </button>
          )}
        </p>
      )}

      <p className="mt-1.5 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap text-ink">
        {draft.text}
      </p>

      {cards.length > 0 && (
        <div className="mt-2">
          <Carousel
            cards={cards}
            label={t('inbox.draft.cards')}
            onRemove={
              onRemoveCard && !busy
                ? (card) => card.product_id && onRemoveCard(card.product_id)
                : undefined
            }
          />
        </div>
      )}
      {removedCards.length > 0 && (
        <p className="mt-1 text-xs text-ink-muted">
          {t('inbox.draft.cardsRemoved', { count: removedCards.length })}{' '}
          {onRestoreCards && (
            <button type="button" onClick={onRestoreCards} className="font-medium underline">
              {t('inbox.draft.restoreCards')}
            </button>
          )}
        </p>
      )}

      {choices.length > 0 && (
        <ul aria-label={t('inbox.draft.choices')} className="mt-2 flex flex-wrap gap-1.5">
          {choices.map((item) => (
            <li
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full border border-ai-ink/40 bg-panel px-2.5 py-0.5 text-xs font-medium text-ai-ink"
            >
              {item.title}
              {onRemoveChoice && !busy && (
                <button
                  type="button"
                  onClick={() => onRemoveChoice(item.id)}
                  aria-label={t('inbox.draft.removeChoice', { name: item.title })}
                  className="rounded-full hover:bg-panel-muted"
                >
                  <X aria-hidden className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {removedChoices.length > 0 && (
        <p className="mt-1 text-xs text-ink-muted">
          {t('inbox.draft.choicesRemoved', { count: removedChoices.length })}{' '}
          {onRestoreChoices && (
            <button type="button" onClick={onRestoreChoices} className="font-medium underline">
              {t('inbox.draft.restoreCards')}
            </button>
          )}
        </p>
      )}

      {draft.product_refs.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
          <span>{t('inbox.draft.about')}</span>
          {draft.product_refs.map((ref) => (
            <span
              key={ref.product_id}
              title={ref.name}
              className="max-w-56 min-w-0 truncate font-medium text-ink"
            >
              {ref.name}
            </span>
          ))}
        </p>
      )}

      {(draft.sources ?? []).length > 0 && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
          <span>{t('inbox.draft.from')}</span>
          {(draft.sources ?? []).map((source) => (
            <span
              key={source.entry_id}
              title={t('inbox.draft.openSource', { title: source.title })}
              className="max-w-56 min-w-0 truncate font-medium text-ai-ink"
            >
              {source.title}
            </span>
          ))}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-md bg-danger px-3 py-2 text-danger-ink">
          {error}
        </p>
      )}

      {editing && (
        <p className="mt-2 text-xs text-ink-muted">
          {t('inbox.draft.editing')}{' '}
          <button type="button" onClick={onStopEditing} className="font-medium underline">
            {t('inbox.draft.stopEditing')}
          </button>
        </p>
      )}

      <TooltipProvider>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Tooltip
            side="top"
            content={
              <>
                <span className="mr-2">{t('inbox.draft.send')}</span>
                <Kbd>{onMac() ? '⌘ ↵' : 'Ctrl ↵'}</Kbd>
              </>
            }
          >
            <ActionButton tone="primary" icon={Send} disabled={busy || editing} onClick={onSend}>
              {t('inbox.draft.send')}
            </ActionButton>
          </Tooltip>
          <Tooltip
            side="top"
            content={
              <>
                <span className="mr-2">{t('inbox.draft.edit')}</span>
                <Kbd>E</Kbd>
              </>
            }
          >
            <ActionButton tone="ghost" icon={Pencil} disabled={busy || editing} onClick={onEdit}>
              {t('inbox.draft.edit')}
            </ActionButton>
          </Tooltip>
          <Tooltip
            side="top"
            content={
              <>
                <span className="mr-2">{t('inbox.draft.reject')}</span>
                <Kbd>R</Kbd>
              </>
            }
          >
            <ActionButton
              tone="ghost"
              icon={X}
              disabled={busy}
              aria-expanded={choosingReason}
              onClick={() => setChoosingReason((open) => !open)}
            >
              {t('inbox.draft.reject')}
            </ActionButton>
          </Tooltip>
        </div>
      </TooltipProvider>

      {choosingReason && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group">
          <span className="text-xs text-ink-muted">{t('inbox.draft.rejectWhy')}</span>
          {REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              disabled={busy}
              onClick={() => onReject(reason)}
              className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-xs font-medium text-ink hover:bg-panel-muted disabled:opacity-60"
            >
              {t(`inbox.draft.reason.${reason}`)}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => onReject(null)}
            className="text-xs font-medium text-ink-muted underline disabled:opacity-60"
          >
            {t('inbox.draft.noReason')}
          </button>
        </div>
      )}
    </section>
  );
}
