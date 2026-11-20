import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { call } from '../api/call';
import { useAuth } from '../auth/AuthProvider';
import { useToast } from '../components/ui';
import { inboxLink } from './LaterReminders';
import { useInboxStream } from './useInboxStream';

/** Ignore assignments older than two minutes so a reconnect/resync never replays old alerts. */
const FRESH_ASSIGNMENT_MS = 2 * 60_000;

function stripTitleCount(title: string): string {
  return title.replace(/^\(\d+\)\s*/, '');
}

/**
 * Alerts the signed-in member on any page when a teammate assigns a conversation to them: a toast
 * with who assigned it, the customer's name and an Open button, plus a `(N)` count on the tab title
 * while the tab is in the background. Mounted once in the shell.
 */
export function AssignmentAlerts() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const alerted = useRef(new Set<string>());
  const unseen = useRef(0);
  const meId = state.status === 'authenticated' ? state.me.user.id : null;

  useEffect(() => {
    function clearTitleCount() {
      if (document.hidden || unseen.current === 0) return;
      unseen.current = 0;
      document.title = stripTitleCount(document.title);
    }
    document.addEventListener('visibilitychange', clearTitleCount);
    return () => {
      document.removeEventListener('visibilitychange', clearTitleCount);
      if (unseen.current > 0) {
        unseen.current = 0;
        document.title = stripTitleCount(document.title);
      }
    };
  }, []);

  useInboxStream((signal) => {
    if (signal.kind !== 'assigned' || !signal.conversationId || !meId) return;
    const conversationId = signal.conversationId;
    void call(() =>
      api.GET('/v1/conversations/{conversation_id}', {
        params: { path: { conversation_id: conversationId } },
      }),
    ).then((result) => {
      if (!result.ok) return;
      const c = result.data;
      if (c.assignee?.id !== meId) return;
      if (!c.assigned_by || c.assigned_by.id === meId) return;
      if (!c.assigned_at) return;
      const age = Date.now() - new Date(c.assigned_at).getTime();
      if (Number.isNaN(age) || age >= FRESH_ASSIGNMENT_MS) return;

      const key = `${c.id}:${c.assigned_at}`;
      if (alerted.current.has(key)) return;
      alerted.current.add(key);

      if (document.hidden) {
        unseen.current += 1;
        const base = stripTitleCount(document.title) || t('inbox.title');
        document.title = `(${unseen.current}) ${base}`;
      }

      const customer = c.customer_name ?? t('inbox.unknownCustomer');
      toast({
        message: t('inbox.assign.alert', { by: c.assigned_by.name, customer }),
        action: {
          label: t('inbox.assign.alertOpen'),
          onClick: () => navigate(inboxLink(c.id)),
        },
      });
    });
  });

  return null;
}
