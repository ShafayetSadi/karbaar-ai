import { useToast } from '../components/ui';
import { LeaveGuard } from '../navigation/LeaveGuard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import { isAmbiguousRequestFailure, type ApiError } from '../api/errors';
import { formatDateTime } from '../i18n/format';
import type { Member } from '../team/useMembers';
import { effectiveAiMode } from './aiMode';
import { Composer } from './Composer';
import { AgentActivityCard, isWorking, type AgentStep } from './AgentActivityCard';
import { DraftCard, type Draft, type RejectReason } from './DraftCard';
import type { Conversation } from './InboxPage';
import { MessageList, type Message } from './MessageList';
import { ThreadHeader, type ConversationUpdate } from './ThreadHeader';
import { useAttachments } from './useAttachments';
import { useGenerate } from './useGenerate';
import { useProductCards } from './useProductCards';
import { isTypingTarget } from './keyboard';

const PAGE_SIZE = 30;

// Send failures whose inbox wording differs from the shared `errors.<CODE>`; every other code
// already arrives translated in `error.message`.
const SEND_ERRORS: Record<string, string> = {
  REPLY_WINDOW_CLOSED: 'inbox.error.windowClosed',
  CHANNEL_NOT_CONNECTED: 'inbox.error.notConnected',
};

export function Thread({
  conversation,
  refresh,
  draft,
  draftLoaded,
  note,
  panelOpen,
  onDraftDecided,
  members,
  meId,
  onChanged,
  onMoved,
  onTogglePanel,
  onOrderProduct,
  onClose,
}: {
  conversation: Conversation;
  refresh: number;
  draft: Draft | null;
  /** `draft` is this conversation's pending draft (its context has loaded). */
  draftLoaded: boolean;
  /** The team's note on the customer, for the header's status line. */
  note: string | null;
  panelOpen: boolean;
  /** The draft was sent, edited-and-sent, rejected or found replaced: refetch what is pending. */
  onDraftDecided: () => void;
  /** The shop's team, for the Assign menu; it only shows with more than one member. */
  members: Member[];
  meId: string | null;
  onChanged: (updated: Conversation) => void;
  /** Put off, brought back or (re)assigned: it may now belong to another list. */
  onMoved: (updated: Conversation) => void;
  onTogglePanel: () => void;
  /** A product card was clicked "+ Order": start an order with it in the customer panel. */
  onOrderProduct?: (productId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([]); // newest first, as the API returns
  const [cursor, setCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // The AI draft whose text is being edited in the composer; sending then records its outcome.
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  // Product cards the merchant took out of the pending draft, by draft, so a newer draft starts whole.
  const [removedCards, setRemovedCards] = useState<{ draftId: string; ids: string[] } | null>(null);
  const [removedChoices, setRemovedChoices] = useState<{ draftId: string; ids: string[] } | null>(
    null,
  );
  const [removedPhotos, setRemovedPhotos] = useState<{ draftId: string; ids: string[] } | null>(
    null,
  );
  const [draftError, setDraftError] = useState<string | null>(null);
  // One key per reply (its text and draft): a retry after a network error reuses it, so a reply is
  // never queued twice. A different text or draft gets a new key, and so does the next send.
  const leaveBypass = useRef(false);
  const keyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendDraftAsWrittenRef = useRef<(current: Draft) => Promise<void>>(async () => {});
  const attachments = useAttachments();
  const cards = useProductCards();
  const generate = useGenerate({
    conversationId: conversation.id,
    draft,
    draftLoaded,
    reloadDraft: onDraftDecided,
    text,
    setText,
  });
  const id = conversation.id;

  const loadLatest = useCallback(async () => {
    const result = await call(() =>
      api.GET('/v1/conversations/{conversation_id}/messages', {
        params: { path: { conversation_id: id }, query: { limit: PAGE_SIZE } },
      }),
    );
    if (result.ok) {
      setMessages((current) => {
        // Keep older pages already loaded; replace the newest page with the fresh one.
        const fresh = result.data.items;
        const freshIds = new Set(fresh.map((m) => m.id));
        const oldest = fresh[fresh.length - 1]?.sent_at;
        const older = current.filter(
          (m) => !freshIds.has(m.id) && oldest !== undefined && m.sent_at < oldest,
        );
        return [...fresh, ...older];
      });
      setCursor((current) => (loaded ? current : result.data.next_cursor));
      setFailed(false);
    } else {
      setFailed(true);
    }
    setLoaded(true);
  }, [id, loaded]);

  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- fetch on open and on live signals
    void loadLatest();
    // `refresh` changes when the stream signals; `loadLatest` changes once after the first load.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refresh]);

  // Opening the thread clears its unread count.
  useEffect(() => {
    if (conversation.unread_count === 0) return;
    void call(() =>
      api.POST('/v1/conversations/{conversation_id}/read', {
        params: { path: { conversation_id: id } },
      }),
    ).then((result) => {
      if (result.ok) onChanged(result.data);
    });
    // Only when the count becomes non-zero for this thread (opening it, or a new message in it).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [id, conversation.unread_count]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, id]);

  async function loadOlder() {
    if (!cursor) return;
    const result = await call(() =>
      api.GET('/v1/conversations/{conversation_id}/messages', {
        params: { path: { conversation_id: id }, query: { cursor, limit: PAGE_SIZE } },
      }),
    );
    if (result.ok) {
      setMessages((current) => [...current, ...result.data.items]);
      setCursor(result.data.next_cursor);
    }
  }

  function sendErrorText(error: ApiError) {
    const key = SEND_ERRORS[error.code];
    return key ? t(key) : error.message;
  }

  function idempotencyKey(fingerprint: string): string {
    if (keyRef.current?.fingerprint !== fingerprint) {
      keyRef.current = { fingerprint, key: crypto.randomUUID() };
    }
    return keyRef.current.key;
  }

  // Only the draft being sent as-is or edited is linked to the reply; anything else is the
  // merchant answering in their own words.
  // `productIds`: the draft's cards the merchant kept; left out when the draft has none.
  // `choiceIds`: the same for the draft's quick replies; `photoIds` for its photos.
  async function sendReply(
    body: string,
    draftId: string | null,
    mediaIds: string[] = [],
    productIds?: string[],
    choiceIds?: string[],
    photoIds?: string[],
  ): Promise<boolean> {
    const key = idempotencyKey(
      `${id}|${draftId ?? ''}|${JSON.stringify({ body, mediaIds, productIds, choiceIds, photoIds })}`,
    );
    const result = await call(() =>
      api.POST('/v1/conversations/{conversation_id}/messages', {
        params: { path: { conversation_id: id }, header: { 'Idempotency-Key': key } },
        body: {
          text: body || undefined,
          draft_id: draftId ?? undefined,
          attachments: mediaIds.length ? mediaIds.map((media_id) => ({ media_id })) : undefined,
          product_ids: productIds,
          choice_ids: choiceIds,
          photo_ids: photoIds,
        },
      }),
    );
    if (result.ok) {
      keyRef.current = null;
      // Newest first: the last message of the send goes on top.
      const queued = [...result.data.batch].reverse();
      setMessages((current) => {
        const have = new Set(current.map((m) => m.id));
        return [...queued.filter((m) => !have.has(m.id)), ...current];
      });
      return true;
    }
    if (result.error.code === 'DRAFT_NOT_PENDING') {
      // Replaced or decided elsewhere (another tab): show what is pending now, keep the text.
      setSendError(t('inbox.draft.replaced'));
      setEditingDraftId(null);
      onDraftDecided();
    } else {
      setSendError(sendErrorText(result.error));
    }
    // Retain the key when the server may have committed before the response was lost.
    if (!isAmbiguousRequestFailure(result.error)) keyRef.current = null;
    return false;
  }

  async function send() {
    const body = text.trim();
    const mediaIds = attachments.mediaIds;
    const picked = cards.productIds;
    if ((!body && mediaIds.length === 0 && picked.length === 0) || sending || attachments.uploading)
      return;
    setSending(true);
    setSendError(null);
    // An edited draft keeps the cards the merchant left on it; products picked here follow them.
    const draftCards = activeEditingId && draft ? keptCards(draft) : undefined;
    const productIds =
      draftCards || picked.length ? [...new Set([...(draftCards ?? []), ...picked])] : undefined;
    const choiceIds = activeEditingId && draft ? keptChoices(draft) : undefined;
    const photoIds = activeEditingId && draft ? keptPhotos(draft) : undefined;
    if (await sendReply(body, activeEditingId, mediaIds, productIds, choiceIds, photoIds)) {
      setText('');
      attachments.clear();
      cards.clear();
      setEditingDraftId(null);
      onDraftDecided();
    }
    setSending(false);
  }

  // A voice note goes on its own; whatever is typed stays in the box. Like any reply of the
  // merchant's own, it sets aside a pending draft.
  async function sendVoiceNote(mediaId: string): Promise<boolean> {
    if (sending) return false;
    setSending(true);
    setSendError(null);
    const sent = await sendReply('', null, [mediaId]);
    if (sent) {
      setEditingDraftId(null);
      onDraftDecided();
    }
    setSending(false);
    return sent;
  }

  // A resent reply keeps its id and moves to the end of the thread (newest first here).
  async function resendFailed(message: Message): Promise<boolean> {
    const result = await call(() =>
      api.POST('/v1/conversations/{conversation_id}/messages/{message_id}/resend', {
        params: { path: { conversation_id: id, message_id: message.id } },
      }),
    );
    if (!result.ok) return false;
    setMessages((current) => [result.data, ...current.filter((m) => m.id !== message.id)]);
    return true;
  }

  async function deleteFailed(message: Message): Promise<boolean> {
    const result = await call(() =>
      api.DELETE('/v1/conversations/{conversation_id}/messages/{message_id}', {
        params: { path: { conversation_id: id, message_id: message.id } },
      }),
    );
    if (!result.ok) return false;
    setMessages((current) => current.filter((m) => m.id !== message.id));
    return true;
  }

  function removedFrom(current: Draft): string[] {
    return removedCards?.draftId === current.id ? removedCards.ids : [];
  }

  function keptCards(current: Draft): string[] | undefined {
    if (current.cards.length === 0) return undefined;
    const removed = removedFrom(current);
    return current.cards
      .map((card) => card.product_id)
      .filter((productId): productId is string => !!productId && !removed.includes(productId));
  }

  function removedChoicesFrom(current: Draft): string[] {
    return removedChoices?.draftId === current.id ? removedChoices.ids : [];
  }

  function keptChoices(current: Draft): string[] | undefined {
    if (!current.choices) return undefined;
    const removed = removedChoicesFrom(current);
    return current.choices.items.map((item) => item.id).filter((id) => !removed.includes(id));
  }

  function removedPhotosFrom(current: Draft): string[] {
    return removedPhotos?.draftId === current.id ? removedPhotos.ids : [];
  }

  // Left out when nothing was removed, so the server sends every photo that can still go.
  function keptPhotos(current: Draft): string[] | undefined {
    const removed = removedPhotosFrom(current);
    if (removed.length === 0) return undefined;
    return (current.photos ?? []).map((p) => p.media_id).filter((id) => !removed.includes(id));
  }

  async function sendDraftAsWritten(current: Draft) {
    if (sending || draftBusy) return;
    setDraftBusy(true);
    setDraftError(null);
    setSendError(null);
    if (
      await sendReply(
        current.text,
        current.id,
        [],
        keptCards(current),
        keptChoices(current),
        keptPhotos(current),
      )
    )
      onDraftDecided();
    setDraftBusy(false);
  }
  useEffect(() => {
    sendDraftAsWrittenRef.current = sendDraftAsWritten;
  });

  async function rejectDraft(current: Draft, reason: RejectReason | null) {
    if (draftBusy) return;
    setDraftBusy(true);
    setDraftError(null);
    const result = await call(() =>
      api.POST('/v1/conversations/{conversation_id}/drafts/{draft_id}/reject', {
        params: { path: { conversation_id: id, draft_id: current.id } },
        body: { reason },
      }),
    );
    if (result.ok) {
      setEditingDraftId(null);
    } else {
      setDraftError(
        result.error.code === 'DRAFT_NOT_PENDING'
          ? t('inbox.draft.replaced')
          : t('inbox.draft.failed'),
      );
    }
    // Either way the pending draft may have changed: show the server's truth.
    onDraftDecided();
    setDraftBusy(false);
  }

  const replyRef = useRef<HTMLTextAreaElement>(null);

  function editDraft(current: Draft) {
    setText(current.text);
    setEditingDraftId(current.id);
    setDraftError(null);
    replyRef.current?.focus();
  }

  // An edit only counts while the draft it started from is still the pending one.
  const activeEditingId = draft !== null && editingDraftId === draft.id ? editingDraftId : null;

  async function patchConversation(body: ConversationUpdate) {
    const result = await call(() =>
      api.PATCH('/v1/conversations/{conversation_id}', {
        params: { path: { conversation_id: id } },
        body,
      }),
    );
    if (result.ok) {
      onChanged(result.data);
      if (body.ai_paused === false) {
        const current = await call(() => api.GET('/v1/merchant/ai-settings'));
        const mode = current.ok
          ? effectiveAiMode(result.data.ai_available, current.data)
          : 'unknown';
        toast({ message: t(`takeovers.handedBack.${mode}`) });
      }
    }
  }

  async function snooze(until: Date, note: string | null): Promise<boolean> {
    const result = await call(() =>
      api.POST('/v1/conversations/{conversation_id}/snooze', {
        params: { path: { conversation_id: id } },
        body: { until: until.toISOString(), note },
      }),
    );
    if (result.ok) onMoved(result.data);
    return result.ok;
  }

  async function unsnooze() {
    const result = await call(() =>
      api.DELETE('/v1/conversations/{conversation_id}/snooze', {
        params: { path: { conversation_id: id } },
      }),
    );
    if (result.ok) onMoved(result.data);
  }

  async function assign(userId: string | null) {
    const result = await call(() =>
      api.POST('/v1/conversations/{conversation_id}/assign', {
        params: { path: { conversation_id: id } },
        body: { user_id: userId },
      }),
    );
    if (result.ok) onMoved(result.data);
  }

  const closed = !conversation.window_open;
  // What the agent is doing here; a draft the merchant just asked for counts as queued until the
  // server says more.
  const activity = conversation.agent_activity ?? null;
  const step: AgentStep | null = activity?.phase ?? (generate.waitingForDraft ? 'queued' : null);
  // A draft the merchant asked for replaces the pending one; a run that started by itself (the
  // customer wrote again) leaves it usable until the new one lands.
  const shownDraft = generate.waitingForDraft ? null : draft;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey) return;
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        if (
          !shownDraft ||
          text.trim() ||
          attachments.items.length > 0 ||
          cards.items.length > 0 ||
          (isTypingTarget(event.target) && event.target !== replyRef.current)
        )
          return;
        event.preventDefault();
        void sendDraftAsWrittenRef.current(shownDraft);
        return;
      }
      if (event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
      if (
        event.key.toLowerCase() === 'e' &&
        shownDraft &&
        !activeEditingId &&
        !draftBusy &&
        !sending
      ) {
        event.preventDefault();
        editDraft(shownDraft);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    shownDraft,
    text,
    attachments.items.length,
    cards.items.length,
    activeEditingId,
    draftBusy,
    sending,
    replyRef,
  ]);

  return (
    <section
      aria-label={t('inbox.thread')}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-paper"
    >
      <LeaveGuard
        dirty={text.length > 0 || attachments.items.length > 0 || cards.items.length > 0}
        bypass={leaveBypass}
        message={t('navigation.leaveUnsaved')}
        ignoreParams={[
          'menu',
          'panel',
          'customer',
          'order',
          'image',
          'q',
          'assignee',
          'view',
          'needs_you',
          'waiting',
          'draft_ready',
        ]}
      />
      <ThreadHeader
        conversation={conversation}
        note={note}
        panelOpen={panelOpen}
        onPatch={(body) => void patchConversation(body)}
        onSnooze={snooze}
        onUnsnooze={() => void unsnooze()}
        members={members}
        meId={meId}
        onAssign={(userId) => void assign(userId)}
        onTogglePanel={onTogglePanel}
        onClose={onClose}
      />

      <MessageList
        messages={[...messages].reverse()}
        customerName={conversation.customer_name}
        customerPhotoUrl={conversation.customer_photo_url}
        loaded={loaded}
        failed={failed}
        hasOlder={cursor !== null}
        onLoadOlder={() => void loadOlder()}
        bottomRef={bottomRef}
        historyImportedBefore={conversation.history_imported_before}
        onResend={resendFailed}
        onDelete={deleteFailed}
        onOrder={onOrderProduct}
      />

      {conversation.ai_available === false && (
        <p className="border-t border-line px-4 py-2 text-sm text-ink-muted">
          {t('inbox.aiOffAccount')}
        </p>
      )}
      {conversation.status === 'closed' && (
        <p className="shrink-0 border-t border-line px-4 py-2 text-sm text-ink-muted">
          {t('inbox.closedNote')}
        </p>
      )}
      {closed ? (
        <p
          role="status"
          className="shrink-0 border-t border-warn-ink/20 bg-warn px-4 py-3 text-sm text-warn-ink"
        >
          {conversation.window_closes_at
            ? t('inbox.windowClosed', { when: formatDateTime(conversation.window_closes_at) })
            : t('inbox.windowNever')}
        </p>
      ) : (
        <Composer
          text={text}
          onTextChange={(value) => {
            setText(value);
            // Emptying the box abandons the draft: what is typed next is a reply of their own.
            if (value.trim() === '') setEditingDraftId(null);
          }}
          sending={sending}
          error={sendError}
          conversationId={conversation.id}
          windowClosesAt={conversation.window_closes_at}
          replyRef={replyRef}
          onSend={() => void send()}
          onSendVoiceNote={sendVoiceNote}
          attachments={attachments}
          // Messenger, the only channel the inbox sends through today, shows cards. A
          // channel without templates leaves `cards` out, so the composer does not offer them.
          cards={cards}
          generate={generate}
          aiAvailable={conversation.ai_available !== false}
          draftCard={
            <>
              {step && (
                <AgentActivityCard
                  step={step}
                  reason={activity?.reason}
                  startedAt={activity?.started_at}
                  updatedAt={activity?.updated_at}
                  // A pending draft stays usable while a newer run works on the next one.
                  compact={!!shownDraft && isWorking({ phase: step })}
                  canRetry={generate.canRequestDraft}
                  onRetry={generate.newDraft}
                />
              )}
              {shownDraft && (
                <DraftCard
                  key={shownDraft.id}
                  draft={shownDraft}
                  editing={activeEditingId === shownDraft.id}
                  busy={draftBusy || sending}
                  error={draftError}
                  removedCards={removedFrom(shownDraft)}
                  onRemoveCard={(productId) =>
                    setRemovedCards({
                      draftId: shownDraft.id,
                      ids: [...removedFrom(shownDraft), productId],
                    })
                  }
                  onRestoreCards={() => setRemovedCards(null)}
                  removedChoices={removedChoicesFrom(shownDraft)}
                  onRemoveChoice={(choiceId) =>
                    setRemovedChoices({
                      draftId: shownDraft.id,
                      ids: [...removedChoicesFrom(shownDraft), choiceId],
                    })
                  }
                  onRestoreChoices={() => setRemovedChoices(null)}
                  removedPhotos={removedPhotosFrom(shownDraft)}
                  onRemovePhoto={(mediaId) =>
                    setRemovedPhotos({
                      draftId: shownDraft.id,
                      ids: [...removedPhotosFrom(shownDraft), mediaId],
                    })
                  }
                  onRestorePhotos={() => setRemovedPhotos(null)}
                  onSend={() => void sendDraftAsWritten(shownDraft)}
                  onEdit={() => editDraft(shownDraft)}
                  onStopEditing={() => {
                    setEditingDraftId(null);
                    setText('');
                  }}
                  onReject={(reason) => void rejectDraft(shownDraft, reason)}
                />
              )}
            </>
          }
        />
      )}
    </section>
  );
}
