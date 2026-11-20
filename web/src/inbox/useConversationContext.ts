import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { call } from '../api/call';
import type { components } from '../api/schema';

export type ConversationContext = components['schemas']['ConversationContext'];

/**
 * The open conversation's side data: customer, origin and the AI's pending draft. One fetch feeds
 * both the thread (draft card) and the customer panel. Refetches when `refresh` changes (a live
 * signal) and on `reload()`, which the draft card calls after the merchant decides.
 */
export function useConversationContext(conversationId: string, refresh: number) {
  const [context, setContext] = useState<ConversationContext | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void call(() =>
      api.GET('/v1/conversations/{conversation_id}/context', {
        params: { path: { conversation_id: conversationId } },
      }),
    ).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setContext(result.data);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, refresh, reloads]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);
  return { context, failed, reload, setContext };
}
