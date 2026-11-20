import { useModalFocus } from '../navigation/useModalFocus';
import { useMediaQuery } from '../components/useMediaQuery';
import { useUrlPanel } from '../navigation/useUrlPanel';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { call } from '../api/call';
import type { components } from '../api/schema';
import { useAuth } from '../auth/AuthProvider';
import { cx } from '../components/ui';
import { useMembers, type Member } from '../team/useMembers';
import { ContextPanel } from './ContextPanel';
import {
  ConversationList,
  type AssigneeFilter,
  type Attention,
  type ConversationFilter,
} from './ConversationList';
import { MAX_SEARCH } from './SearchBox';
import { TakeoverSuggestion } from '../settings/TakeoverSettings';
import { Thread } from './Thread';
import { useConversationContext } from './useConversationContext';
import { useInboxStream } from './useInboxStream';
import { isTypingTarget } from './keyboard';

export type Conversation = components['schemas']['ConversationRead'];
export type AttentionCounts = components['schemas']['AttentionCountsRead'];
export type BulkAction = components['schemas']['BulkAction']['action'];
export type BulkResult = components['schemas']['BulkResult'];

const PAGE_SIZE = 25;

/** What the list shows: a status tab, narrowed by the attention chips, who it is assigned to
 * and by a search (may be empty). */
type View = {
  tab: ConversationFilter;
  attention: Attention;
  assignee: AssigneeFilter;
  q: string;
};

function viewKey(view: View) {
  return JSON.stringify([
    view.tab,
    view.attention.needsYou,
    view.attention.waiting,
    view.attention.draftReady,
    view.assignee,
    view.q,
  ]);
}

/** `?view=` values from before the chips existed, so an old bookmark lands on the same list. */
const LEGACY_VIEWS = new Map<string, Partial<Attention>>([
  ['needs_human', { needsYou: true }],
  ['needs_reply', { waiting: true }],
  ['snoozed', {}],
]);

// Put-off ("Later") conversations leave Open until they are due. Needs you keeps them, since a
// flagged conversation is never hidden; Waiting for a reply leaves them out by definition, so
// it wins when both are on.
function filterQuery({ tab, attention, assignee, q }: View) {
  const keepsLater = attention.needsYou && !attention.waiting && !attention.draftReady;
  return {
    status: tab,
    ...(tab === 'open' && !keepsLater && { snoozed: false }),
    ...(attention.needsYou && { needs_human: true }),
    ...(attention.waiting && { needs_reply: true }),
    ...(attention.draftReady && { draft_ready: true }),
    ...(assignee !== 'all' && { assignee }),
    ...(q && { q }),
  };
}

export function InboxPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useAuth();
  const meId = state.status === 'authenticated' ? state.me.user.id : null;
  const { members } = useMembers();
  // The tab (`?view=`), the chips (`?needs_you=1`, `?waiting=1`, `?draft_ready=1`), the search (`?q=`) and the
  // assignee filter (`?assignee=`) live in the URL, so a refresh, a shared link, or the
  // assignment digest email (`?assignee=me`) lands on the right list.
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') ?? '';
  const legacy = LEGACY_VIEWS.get(view);
  const filter: ConversationFilter = view === 'closed' ? 'closed' : 'open';
  const needsYou = searchParams.get('needs_you') === '1' || !!legacy?.needsYou;
  // Waiting for a reply is only offered on Open: on Done the param is ignored, not rewritten.
  const waiting = filter === 'open' && (searchParams.get('waiting') === '1' || !!legacy?.waiting);
  // Draft ready is only offered on Open too: a closed conversation has no draft waiting.
  const draftReady = filter === 'open' && searchParams.get('draft_ready') === '1';
  const attention = useMemo<Attention>(
    () => ({ needsYou, waiting, draftReady }),
    [needsYou, waiting, draftReady],
  );
  const setFilter = (value: ConversationFilter) => {
    const next = new URLSearchParams(searchParams);
    next.set('view', value);
    if (value === 'closed') {
      next.delete('waiting');
      next.delete('draft_ready');
    }
    setSearchParams(next);
  };
  // Rewrite an old `?view=needs_human|needs_reply|snoozed` into the tab and chip it means. The
  // list already reads it that way, so there is no flash; `replace` keeps Back from looping.
  useEffect(() => {
    if (!legacy) return;
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('view', 'open');
        if (legacy.needsYou) next.set('needs_you', '1');
        if (legacy.waiting) next.set('waiting', '1');
        return next;
      },
      { replace: true },
    );
  }, [legacy, setSearchParams]);
  const query = (searchParams.get('q') ?? '').trim().slice(0, MAX_SEARCH);
  const assignee: AssigneeFilter = (searchParams.get('assignee') ?? '').trim() || 'all';
  const [items, setItems] = useState<Conversation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [counts, setCounts] = useState<AttentionCounts | null>(null);
  const selectedId = searchParams.get('conversation');
  const selectConversation = useCallback(
    (id: string) => {
      if (id === selectedId) return;
      const next = new URLSearchParams(searchParams);
      next.set('conversation', id);
      for (const key of ['panel', 'customer', 'order', 'image']) next.delete(key);
      setSearchParams(next, {
        replace: !!selectedId,
        state: selectedId ? location.state : { inboxList: location.key },
      });
    },
    [selectedId, searchParams, setSearchParams, location.state, location.key],
  );
  useEffect(() => {
    if (!selectedId || !items.some((item) => item.id === selectedId)) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTypingTarget(event.target)
      )
        return;
      if (event.key !== 'j' && event.key !== 'k') return;
      const index = items.findIndex((item) => item.id === selectedId);
      const nextIndex = index < 0 ? 0 : index + (event.key === 'j' ? 1 : -1);
      if (nextIndex < 0 || nextIndex >= items.length) return;
      event.preventDefault();
      selectConversation(items[nextIndex]!.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, selectedId, selectConversation]);
  const closeConversation = () => {
    if (location.state?.inboxList) {
      void navigate(-1);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('conversation');
    for (const key of ['panel', 'customer', 'order', 'image']) next.delete(key);
    setSearchParams(next, { replace: true });
  };
  const [linkedConversation, setLinkedConversation] = useState<Conversation | null>(null);
  const [selectionFailed, setSelectionFailed] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  // Bumped on each live signal so the open thread refetches too.
  const [refresh, setRefresh] = useState(0);
  const viewRef = useRef<View>({ tab: filter, attention, assignee, q: query });

  useEffect(() => {
    viewRef.current = { tab: filter, attention, assignee, q: query };
  }, [filter, attention, assignee, query]);

  const selectAttention = useCallback(
    (key: keyof Attention, on: boolean) =>
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          const param = { needsYou: 'needs_you', waiting: 'waiting', draftReady: 'draft_ready' }[
            key
          ];
          if (on) next.set(param, '1');
          else next.delete(param);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const search = useCallback(
    (q: string) =>
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (q) next.set('q', q);
          else next.delete('q');
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const selectAssignee = useCallback(
    (nextAssignee: AssigneeFilter) =>
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (nextAssignee && nextAssignee !== 'all') next.set('assignee', nextAssignee);
          else next.delete('assignee');
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  // A direct link may point outside the current filtered or paginated list. Always use the
  // tenant-authorized detail endpoint; never infer absence from the visible list.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void call(() =>
      api.GET('/v1/conversations/{conversation_id}', {
        params: { path: { conversation_id: selectedId } },
      }),
    ).then((result) => {
      if (cancelled) return;
      setSelectionFailed(result.ok ? null : selectedId);
      setLinkedConversation(result.ok ? result.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, refresh]);

  const load = useCallback(async (after: string | null, view: View) => {
    setLoading(true);
    const result = await call(() =>
      api.GET('/v1/conversations', {
        params: { query: { ...filterQuery(view), cursor: after, limit: PAGE_SIZE } },
      }),
    );
    // A slower answer for a filter or search the merchant already left must not overwrite the
    // current one.
    if (viewKey(view) !== viewKey(viewRef.current)) return;
    if (result.ok) {
      setItems((current) => (after ? [...current, ...result.data.items] : result.data.items));
      setCursor(result.data.next_cursor);
      setFailed(false);
    } else {
      setFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- fetch on filter change
    void load(null, { tab: filter, attention, assignee, q: query });
  }, [load, filter, attention, assignee, query]);

  // The tab badges. A failed fetch keeps the last numbers: they are a hint, not the data.
  const loadCounts = useCallback(async () => {
    const result = await call(() => api.GET('/v1/conversations/counts'));
    if (result.ok) setCounts(result.data);
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/channels/messenger')).then((result) => {
      if (!cancelled && result.ok) setConnected(result.data !== null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The latest activity request per conversation: an older answer arriving late is dropped.
  const activityRequests = useRef(new Map<string, number>());
  const loadActivity = useCallback(async (conversationId: string) => {
    const sent = (activityRequests.current.get(conversationId) ?? 0) + 1;
    activityRequests.current.set(conversationId, sent);
    const result = await call(() =>
      api.GET('/v1/conversations/{conversation_id}/agent-activity', {
        params: { path: { conversation_id: conversationId } },
      }),
    );
    if (!result.ok || activityRequests.current.get(conversationId) !== sent) return;
    const activity = result.data.agent_activity;
    setItems((current) =>
      current.map((c) => (c.id === conversationId ? { ...c, agent_activity: activity } : c)),
    );
  }, []);

  useInboxStream((signal) => {
    // The agent moved on: only its activity changed, so fetch just that.
    if (signal.kind === 'agent') {
      if (signal.conversationId) void loadActivity(signal.conversationId);
      return;
    }
    // Ids only arrive; the list is cheap to refetch and keeps ordering and counts server-true.
    void load(null, viewRef.current);
    void loadCounts();
    setRefresh((n) => n + 1);
  });

  /** Every open conversation is shown read at once; the server's answer settles the counts. */
  async function markAllRead(): Promise<boolean> {
    const before = new Map(items.map((c) => [c.id, c.unread_count]));
    setItems((current) =>
      current.map((c) => (c.status === 'open' && c.unread_count ? { ...c, unread_count: 0 } : c)),
    );
    const result = await call(() => api.POST('/v1/conversations/read-all'));
    if (!result.ok) {
      // Put back only what this call cleared; anything refetched since stays as it is.
      setItems((current) =>
        current.map((c) => {
          const was = before.get(c.id);
          return c.unread_count === 0 && was ? { ...c, unread_count: was } : c;
        }),
      );
    }
    void loadCounts();
    return result.ok;
  }

  /** Close or mark read the conversations picked in select mode. Null when the call failed. */
  async function bulkUpdate(action: BulkAction, ids: string[]): Promise<BulkResult | null> {
    const result = await call(() => api.POST('/v1/conversations/bulk', { body: { ids, action } }));
    if (!result.ok) return null;
    // Closed ones leave the Open lists: refetch rather than patch.
    void load(null, viewRef.current);
    void loadCounts();
    return result.data;
  }

  function replaceConversation(updated: Conversation) {
    setLinkedConversation(updated);
    setItems((current) => current.map((c) => (c.id === updated.id ? updated : c)));
    // Reading, closing or flagging a conversation moves the tab numbers.
    void loadCounts();
  }

  const selected =
    selectionFailed === selectedId && selectedId
      ? null
      : (items.find((c) => c.id === selectedId) ??
        (linkedConversation?.id === selectedId ? linkedConversation : null));

  // Three panes at full height, each scrolling on its own. Below md only one of list or thread
  // shows; below xl the customer panel becomes a slide-over opened from the thread header.
  // `relative overflow-clip` keeps `sr-only` (absolute) labels in the rows from escaping the pane
  // scrollers: their containing block would otherwise be AppLayout's scrolling <main>, which then
  // overflows, and Thread's scrollIntoView scrolls the whole page up.
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-clip">
      <TakeoverSuggestion />
      <div className="flex min-h-0 flex-1">
        <section
          className={cx(
            'min-h-0 w-full shrink-0 flex-col border-line bg-panel md:flex md:w-[22rem] md:border-r',
            selectedId ? 'hidden' : 'flex',
          )}
        >
          <ConversationList
            items={items}
            selectedId={selectedId}
            filter={filter}
            attention={attention}
            assignee={assignee}
            members={members}
            meId={meId}
            query={query}
            counts={counts}
            connected={connected}
            onFilter={setFilter}
            onAttention={selectAttention}
            onAssignee={selectAssignee}
            onSearch={search}
            onSelect={selectConversation}
            loading={loading}
            failed={failed}
            hasMore={cursor !== null}
            onLoadMore={() => void load(cursor, { tab: filter, attention, assignee, q: query })}
            onMarkAllRead={markAllRead}
            onBulk={bulkUpdate}
          />
        </section>

        {selected ? (
          <ConversationView
            key={selected.id}
            conversation={selected}
            refresh={refresh}
            members={members}
            meId={meId}
            onChanged={replaceConversation}
            onMoved={(updated) => {
              replaceConversation(updated);
              // Put off, brought back or (re)assigned: it may now belong to another list.
              void load(null, viewRef.current);
            }}
            onClose={closeConversation}
            onCustomerSaved={() => void load(null, viewRef.current)}
          />
        ) : selectedId ? (
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 p-6">
            <p role={selectionFailed === selectedId ? 'alert' : 'status'}>
              {t(selectionFailed === selectedId ? 'inbox.openFailed' : 'editor.loading')}
            </p>
            <button type="button" onClick={closeConversation} className="text-active underline">
              {t('inbox.backToList')}
            </button>
          </div>
        ) : (
          <div className="hidden min-w-0 flex-1 items-center justify-center p-10 text-center text-sm text-ink-faint md:flex">
            {items.length === 0 &&
            !loading &&
            !failed &&
            !query &&
            !needsYou &&
            !waiting &&
            !draftReady &&
            assignee === 'all'
              ? t('inbox.empty')
              : t('inbox.pick')}
          </div>
        )}
      </div>
    </div>
  );
}

// One context fetch feeds the thread (draft card, note line) and the customer panel.
function ConversationView({
  conversation,
  refresh,
  members,
  meId,
  onChanged,
  onMoved,
  onClose,
  onCustomerSaved,
}: {
  conversation: Conversation;
  refresh: number;
  members: Member[];
  meId: string | null;
  onChanged: (updated: Conversation) => void;
  onMoved: (updated: Conversation) => void;
  onClose: () => void;
  onCustomerSaved: () => void;
}) {
  const { t } = useTranslation();
  const { context, failed, reload } = useConversationContext(conversation.id, refresh);
  const [panelOpen, setPanelOpen] = useUrlPanel('panel');
  const narrow = !useMediaQuery('(min-width: 80rem)');
  const panelRef = useModalFocus(panelOpen && narrow, () => setPanelOpen(false), !narrow);
  // A product the merchant clicked "+ Order" on, until the order form has taken it.
  const [orderProductId, setOrderProductId] = useState<string | null>(null);

  return (
    <>
      <Thread
        conversation={conversation}
        refresh={refresh}
        draft={context?.draft ?? null}
        draftLoaded={context?.conversation.id === conversation.id}
        note={context?.customer.notes ?? null}
        panelOpen={panelOpen}
        onDraftDecided={reload}
        members={members}
        meId={meId}
        onChanged={onChanged}
        onMoved={onMoved}
        onTogglePanel={() => setPanelOpen(!panelOpen)}
        onOrderProduct={(productId) => {
          setPanelOpen(true);
          setOrderProductId(productId);
        }}
        onClose={onClose}
      />
      <dialog
        ref={panelRef}
        role={narrow ? 'dialog' : 'presentation'}
        aria-label={t('inbox.hidePanel')}
        className={cx(
          'min-h-0 w-[22rem] max-w-full shrink-0 flex-col overflow-y-auto border-0 border-l border-line bg-panel p-0 text-ink backdrop:bg-ink/30 xl:m-0 xl:h-auto',
          panelOpen
            ? 'fixed inset-y-0 right-0 left-auto z-40 m-0 h-dvh flex shadow-xl xl:static xl:z-auto xl:shadow-none'
            : 'hidden xl:static xl:flex',
        )}
      >
        <button
          type="button"
          onClick={() => setPanelOpen(false)}
          className="m-2 self-end rounded border border-line px-3 py-2 xl:hidden"
        >
          {t('inbox.hidePanel')}
        </button>
        <ContextPanel
          conversation={conversation}
          context={context}
          failed={failed}
          onChanged={onChanged}
          onReload={reload}
          orderProductId={orderProductId}
          onOrderProductUsed={() => setOrderProductId(null)}
          onCustomerSaved={() => {
            reload();
            // The list shows the customer's name.
            onCustomerSaved();
          }}
        />
      </dialog>
    </>
  );
}
