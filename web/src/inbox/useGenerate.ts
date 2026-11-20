import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { call } from '../api/call';
import type { Draft } from './DraftCard';

/** How long to wait for a requested draft before giving up on it. */
export const DRAFT_TIMEOUT_MS = 30_000;
/** While waiting, refetch the pending draft this often: the live stream may not be delivering. */
export const DRAFT_POLL_MS = 3_000;
/** The longest note "Draft from my note" sends (`RequestDraft.hint`); the box allows more. */
export const MAX_NOTE_LENGTH = 500;

// `polished` is the text the undo belongs to: once the box holds anything else, it is gone.
export type GenerateNotice =
  | { kind: 'undo'; previous: string; polished: string }
  | { kind: 'error'; key: string };

/**
 * The composer's Generate actions: ask for a new draft (optionally from the merchant's note) and
 * polish the text in the box. A requested draft arrives through the live stream like any other,
 * so "waiting" ends when a different draft becomes the pending one (or after `DRAFT_TIMEOUT_MS`).
 * `draftLoaded` says whether `draft` is this conversation's pending draft yet: until then a new
 * one could not be told from the old, so drafts cannot be asked for.
 */
export function useGenerate({
  conversationId,
  draft,
  draftLoaded,
  reloadDraft,
  text,
  setText,
}: {
  conversationId: string;
  draft: Draft | null;
  draftLoaded: boolean;
  /** Refetch the conversation's pending draft over REST. */
  reloadDraft: () => void;
  text: string;
  setText: (value: string) => void;
}) {
  const [waiting, setWaiting] = useState<{ since: string | null; fromNote: boolean } | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [notice, setNotice] = useState<GenerateNotice | null>(null);
  // The box as it is now, for a polish answer that arrives after the merchant typed on.
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Editing, sending or clearing the box ends the undo: it would bring back stale text.
  if (notice?.kind === 'undo' && text !== notice.polished) setNotice(null);

  const draftId = draft?.id ?? null;
  useEffect(() => {
    // Only a draft other than the one pending at the request is the answer. The pending one going
    // away (a teammate replied) is not: keep waiting, or the note would be cleared for nothing.
    if (waiting === null || draftId === null || draftId === waiting.since) return;
    // The new draft arrived; a note that became a draft leaves the box.
    if (waiting.fromNote) setText('');
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- the draft arrived
    setWaiting(null);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  useEffect(() => {
    if (waiting === null) return;
    const timer = setTimeout(() => {
      setWaiting(null);
      setNotice({ kind: 'error', key: 'inbox.generate.draftTimeout' });
    }, DRAFT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  // The stream normally delivers the new draft; polling keeps a dropped or buffered stream from
  // turning a finished draft into a false timeout.
  const reloadRef = useRef(reloadDraft);
  useEffect(() => {
    reloadRef.current = reloadDraft;
  });
  useEffect(() => {
    if (waiting === null) return;
    const poll = setInterval(() => reloadRef.current(), DRAFT_POLL_MS);
    return () => clearInterval(poll);
  }, [waiting]);

  async function requestDraft(fromNote: boolean) {
    const hint = fromNote ? text.trim() : '';
    if (!draftLoaded || waiting !== null) return;
    if (fromNote && (hint === '' || hint.length > MAX_NOTE_LENGTH)) return;
    setNotice(null);
    setWaiting({ since: draftId, fromNote });
    const result = await call(() =>
      api.POST('/v1/conversations/{conversation_id}/drafts', {
        params: { path: { conversation_id: conversationId } },
        body: hint ? { hint } : {},
      }),
    );
    if (!result.ok) {
      setWaiting(null);
      setNotice({ kind: 'error', key: errorKey(result.error.code, 'inbox.generate.draftFailed') });
    }
  }

  async function polish() {
    if (polishing || text.trim() === '') return;
    setNotice(null);
    setPolishing(true);
    const sent = text;
    const result = await call(() =>
      api.POST('/v1/conversations/{conversation_id}/polish', {
        params: { path: { conversation_id: conversationId } },
        body: { text: sent },
      }),
    );
    setPolishing(false);
    // The box is read-only while polishing, but a send can still empty it: never overwrite that.
    if (textRef.current !== sent) return;
    if (!result.ok) {
      setNotice({ kind: 'error', key: errorKey(result.error.code, 'inbox.generate.polishFailed') });
    } else if (result.data.outcome === 'unchanged_numbers_guard') {
      setNotice({ kind: 'error', key: 'inbox.generate.numbersGuard' });
    } else if (result.data.changed) {
      setText(result.data.text);
      setNotice({ kind: 'undo', previous: sent, polished: result.data.text });
    }
  }

  return {
    waitingForDraft: waiting !== null,
    canRequestDraft: draftLoaded && waiting === null,
    noteTooLong: text.trim().length > MAX_NOTE_LENGTH,
    polishing,
    notice,
    undo: () => {
      if (notice?.kind === 'undo') setText(notice.previous);
      setNotice(null);
    },
    newDraft: () => void requestDraft(false),
    draftFromNote: () => void requestDraft(true),
    polish: () => void polish(),
  };
}

export type Generate = ReturnType<typeof useGenerate>;

function errorKey(code: string, fallback: string): string {
  if (code === 'AI_ALLOWANCE_MONTHLY') return 'inbox.generate.budgetMonthly';
  if (code === 'AI_ALLOWANCE_DAILY') return 'inbox.generate.budgetDaily';
  if (code === 'AI_UNAVAILABLE_PLATFORM' || code === 'AI_ALLOWANCE_UNAVAILABLE')
    return 'inbox.generate.platformPaused';
  if (code === 'AI_REVIEW_PENDING') return 'inbox.generate.reviewPending';
  if (code === 'AI_UNAVAILABLE') return 'inbox.generate.unavailable';
  if (code === 'AI_MODE_OFF') return 'inbox.generate.modeOff';
  if (code === 'NOTHING_TO_DRAFT') return 'inbox.generate.nothingToDraft';
  if (code === 'RATE_LIMITED') return 'inbox.generate.rateLimited';
  return fallback;
}
