import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { call } from '../api/call';
import { useToast } from '../components/ui';
import { isBackFromLater } from './later';
import { useInboxStream } from './useInboxStream';

/** Opens the inbox on one conversation (read by `InboxPage`). */
export function inboxLink(conversationId: string) {
  return `/inbox?${new URLSearchParams({ conversation: conversationId })}`;
}

/**
 * Reminds the merchant, on whatever page they are, when a conversation put off for Later is due:
 * a toast with its customer and note, and a button that opens it. Mounted once in the shell.
 */
export function LaterReminders() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  // One reminder per snooze, however many times its wake signal arrives.
  const reminded = useRef(new Set<string>());

  useInboxStream((signal) => {
    if (signal.kind !== 'snooze_ended' || !signal.conversationId) return;
    const conversationId = signal.conversationId;
    void call(() =>
      api.GET('/v1/conversations/{conversation_id}', {
        params: { path: { conversation_id: conversationId } },
      }),
    ).then((result) => {
      if (!result.ok) return;
      const c = result.data;
      // Already acted on (replied, closed, put off again) by the time it arrived: nothing to say.
      if (c.status !== 'open' || !isBackFromLater(c.snoozed_until, Date.now())) return;
      const key = `${c.id}:${c.snoozed_until}`;
      if (reminded.current.has(key)) return;
      reminded.current.add(key);
      const name = c.customer_name ?? t('inbox.unknownCustomer');
      toast({
        message: c.snooze_note
          ? t('inbox.later.reminderNote', { name, note: c.snooze_note })
          : t('inbox.later.reminder', { name }),
        action: { label: t('inbox.later.reminderOpen'), onClick: () => navigate(inboxLink(c.id)) },
      });
    });
  });

  return null;
}
