import {
  AlarmClock,
  AlertTriangle,
  Check,
  CheckCheck,
  ChevronDown,
  ListChecks,
  Sparkles,
  Timer,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ActionButton,
  Chip,
  FilterTabs,
  IconButton,
  SelectMenu,
  cx,
  type FilterTab,
} from '../components/ui';
import { formatAge, formatWaiting } from '../i18n/format';
import type { Member } from '../team/useMembers';
import { isWorking } from './AgentActivityCard';
import { CustomerAvatar } from './CustomerAvatar';
import { initials } from './initials';
import type { AttentionCounts, BulkAction, BulkResult, Conversation } from './InboxPage';
import { formatLaterUntil, isBackFromLater, isSnoozed } from './later';
import { SearchBox } from './SearchBox';
import { useMinuteClock } from './useMinuteClock';

/** The status tabs. What needs attention narrows a tab through the chips (`Attention`). */
export type ConversationFilter = 'open' | 'closed';
/** `all`, `me`, `unassigned`, or a teammate's user id. */
export type AssigneeFilter = string;
/** The chips: each answers one question, and they combine with the tab and the assignee. */
export type Attention = {
  /** `needs_human`: an escalation nobody has marked handled. */
  needsYou: boolean;
  /** `needs_reply`: open, and the customer wrote last. Only offered on Open. */
  waiting: boolean;
  /** `draft_ready`: open, with an AI draft waiting for the team. Only offered on Open. */
  draftReady: boolean;
};

const FILTERS: ConversationFilter[] = ['open', 'closed'];

/** The tab's badge: how many conversations it holds, before search narrows it. A zero is not
 * shown, so an empty tab stays quiet. */
function badge(filter: ConversationFilter, counts: AttentionCounts | null): number | null {
  if (!counts) return null;
  const count = filter === 'closed' ? counts.closed : counts.open;
  return count ? count : null;
}

/** The customer wrote last and the conversation is still open: someone owes them a reply. */
function waitingSince(c: Conversation): string | null {
  if (c.status !== 'open' || c.last_message?.direction !== 'in') return null;
  return c.last_inbound_at ?? c.last_message_at;
}

export function ConversationList({
  items,
  selectedId,
  filter,
  attention,
  assignee,
  members,
  meId,
  query,
  counts,
  connected,
  onFilter,
  onAttention,
  onAssignee,
  onSearch,
  onSelect,
  loading,
  failed,
  hasMore,
  onLoadMore,
  onMarkAllRead,
  onBulk,
}: {
  items: Conversation[];
  selectedId: string | null;
  filter: ConversationFilter;
  attention: Attention;
  assignee: AssigneeFilter;
  /** The shop's team; the assignee filters only show with more than one member. */
  members: Member[];
  meId: string | null;
  /** The search in effect, empty for none. */
  query: string;
  counts: AttentionCounts | null;
  /** Whether a Facebook Page is connected; null until known. */
  connected: boolean | null;
  onFilter: (filter: ConversationFilter) => void;
  onAttention: (key: keyof Attention, on: boolean) => void;
  onAssignee: (assignee: AssigneeFilter) => void;
  onSearch: (q: string) => void;
  onSelect: (id: string) => void;
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  /** Resolves false when the server refused; the list has already been put back. */
  onMarkAllRead: () => Promise<boolean>;
  /** Resolves null when the call failed. */
  onBulk: (action: BulkAction, ids: string[]) => Promise<BulkResult | null>;
}) {
  const { t } = useTranslation();
  const now = useMinuteClock();
  // Select mode: rows get a checkbox and a bar at the bottom acts on the ones ticked.
  const [selecting, setSelecting] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Only what is still listed counts: a refetch may have dropped a ticked conversation.
  const picked = items.filter((c) => checked.has(c.id)).map((c) => c.id);
  const team = members.length > 1;
  // A chip or an assignee is on, so an empty list may only mean they leave nothing.
  const narrowed =
    attention.needsYou || attention.waiting || attention.draftReady || assignee !== 'all';

  function stopSelecting() {
    setSelecting(false);
    setChecked(new Set());
  }

  useEffect(() => {
    if (!selecting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelecting(false);
        setChecked(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting]);

  function toggle(id: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function markAllRead() {
    setError(null);
    setNotice(null);
    if (!(await onMarkAllRead())) setError(t('inbox.bulk.markAllReadFailed'));
  }

  async function bulk(action: BulkAction) {
    if (picked.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await onBulk(action, picked);
    setBusy(false);
    if (!result) {
      setError(t('inbox.bulk.bulkFailed'));
      return;
    }
    stopSelecting();
    if (result.not_found.length) {
      setNotice(t('inbox.bulk.bulkNotFound', { count: result.not_found.length }));
    }
  }

  return (
    <>
      {connected === false && (
        <p role="status" className="shrink-0 bg-warn px-4 py-2 text-xs text-warn-ink">
          {t('inbox.notConnected')}{' '}
          <Link to="/settings" className="font-medium underline">
            {t('inbox.connectLink')}
          </Link>
        </p>
      )}

      {/* Title and the bulk actions, the search, then one row each for the tab and the chips: the
          list starts after three short rows instead of a wrapped block of pills. */}
      <div className="shrink-0 space-y-2.5 px-3 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 px-1 text-base font-semibold text-ink">
            {t('inbox.title')}
          </h1>
          <IconButton
            icon={ListChecks}
            label={t('inbox.bulk.select')}
            aria-pressed={selecting}
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            className={cx(QUIET_ICON, selecting && 'bg-ink/8 text-ink')}
          />
          <IconButton
            icon={CheckCheck}
            label={t('inbox.bulk.markAllRead')}
            onClick={() => void markAllRead()}
            className={QUIET_ICON}
          />
        </div>
        <SearchBox value={query} onSearch={onSearch} />
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <FilterTabs
              label={t('inbox.filters')}
              value={filter}
              onChange={onFilter}
              tabs={FILTERS.map((value): FilterTab<ConversationFilter> => {
                const count = badge(value, counts);
                return {
                  value,
                  label: t(`inbox.filter.${value}`),
                  count,
                  countLabel: count != null ? t(`inbox.tabCount.${value}`, { count }) : undefined,
                  // Bare numbers, so the row does not crowd on a phone.
                  countTone: 'plain',
                };
              })}
            />
          </div>
          {team && (
            <AssigneeMenu value={assignee} members={members} meId={meId} onChange={onAssignee} />
          )}
        </div>
        {/* Always shown, so a solo owner has the chips too; Mine needs a team. One line that
            scrolls sideways, never a wrapped block. */}
        <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 [scrollbar-width:none]">
          <AttentionChip
            pressed={attention.needsYou}
            label={t('inbox.filter.needs_human')}
            count={counts?.needs_human}
            countLabel={(count) => t('inbox.tabCount.needs_human', { count })}
            alert
            onToggle={() => onAttention('needsYou', !attention.needsYou)}
          />
          {filter === 'open' && (
            <AttentionChip
              pressed={attention.draftReady}
              label={t('inbox.filter.draft_ready')}
              count={counts?.draft_ready}
              countLabel={(count) => t('inbox.tabCount.draft_ready', { count })}
              onToggle={() => onAttention('draftReady', !attention.draftReady)}
            />
          )}
          {filter === 'open' && (
            <AttentionChip
              pressed={attention.waiting}
              label={t('inbox.filter.needs_reply')}
              count={counts?.needs_reply}
              countLabel={(count) => t('inbox.tabCount.needs_reply', { count })}
              onToggle={() => onAttention('waiting', !attention.waiting)}
            />
          )}
          {team && (
            <button
              type="button"
              aria-pressed={assignee === 'me'}
              onClick={() => onAssignee(assignee === 'me' ? 'all' : 'me')}
              className={filterPillClass(assignee === 'me')}
            >
              <UserRound aria-hidden className="size-3.5" />
              {t('inbox.assigneeFilter.mine')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mx-3 mb-2 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink"
        >
          {error}
        </p>
      )}
      {notice && <p className="mx-3 mb-2 text-xs text-ink-muted">{notice}</p>}

      {failed && (
        <p
          role="alert"
          className="mx-3 mb-2 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink"
        >
          {t('inbox.loadFailed')}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
        <ul>
          {items.map((c) => (
            <li key={c.id}>
              <Row
                conversation={c}
                selected={c.id === selectedId}
                now={now}
                onSelect={() => onSelect(c.id)}
                checked={selecting ? checked.has(c.id) : undefined}
                onCheck={() => toggle(c.id)}
              />
            </li>
          ))}
        </ul>

        {items.length === 0 && !loading && !failed && (query || narrowed) && (
          <p className="p-3 text-sm text-ink-muted">
            {t(query ? 'inbox.search.noMatch' : 'inbox.filtersNoMatch')}
          </p>
        )}
        {loading && <p className="p-3 text-sm text-ink-muted">{t('inbox.loading')}</p>}
        {hasMore && !loading && (
          <div className="p-2 text-center">
            <ActionButton tone="ghost" onClick={onLoadMore}>
              {t('inbox.loadMore')}
            </ActionButton>
          </div>
        )}
      </div>

      {selecting && (
        <div
          role="toolbar"
          aria-label={t('inbox.bulk.toolbar')}
          className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-panel px-3 py-2"
        >
          <span className="mr-auto tabular-nums text-xs text-ink-muted">
            {t('inbox.bulk.selected', { count: picked.length })}
          </span>
          <ActionButton
            tone="primary"
            size="sm"
            icon={Check}
            disabled={busy || picked.length === 0}
            onClick={() => void bulk('close')}
          >
            {t('inbox.done')}
          </ActionButton>
          <ActionButton
            size="sm"
            icon={CheckCheck}
            disabled={busy || picked.length === 0}
            onClick={() => void bulk('mark_read')}
          >
            {t('inbox.bulk.markRead')}
          </ActionButton>
          <ActionButton tone="ghost" size="sm" onClick={stopSelecting}>
            {t('inbox.bulk.cancel')}
          </ActionButton>
        </div>
      )}
    </>
  );
}

/** The header's icon actions ("Select", "Mark all read"): no frame until hovered. */
const QUIET_ICON = 'border-transparent bg-transparent';

/** One look for every control in the filter row: a rounded pill, filled when it is on. */
const FILTER_PILL =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-active';
const FILTER_PILL_OFF = 'border-line bg-panel text-ink-muted hover:bg-panel-muted hover:text-ink';
// The lime tint of the chosen tab, not a solid lime fill: Send draft stays the one lime button.
const FILTER_PILL_ON = 'border-active/40 bg-accent/20 text-ink';

function filterPillClass(pressed: boolean) {
  return cx(FILTER_PILL, pressed ? FILTER_PILL_ON : FILTER_PILL_OFF);
}

/** A toggle that narrows the tab to one question. The count is shop-wide, and a zero is hidden. */
function AttentionChip({
  pressed,
  label,
  count,
  countLabel,
  alert = false,
  onToggle,
}: {
  pressed: boolean;
  label: string;
  count: number | undefined;
  countLabel: (count: number) => string;
  /** The count is amber: something for a person to do. */
  alert?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={filterPillClass(pressed)}
    >
      {label}
      {count ? (
        <span
          aria-label={countLabel(count)}
          className={cx(
            'min-w-5 rounded-full px-1.5 text-center text-[0.6875rem] leading-5 font-semibold tabular-nums',
            pressed
              ? 'bg-ink/8 text-ink'
              : alert
                ? 'bg-warn text-warn-ink'
                : 'bg-panel-muted text-ink-muted',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

/** Whose conversations to show: anyone's, nobody's, yours or a teammate's. */
function AssigneeMenu({
  value,
  members,
  meId,
  onChange,
}: {
  value: AssigneeFilter;
  members: Member[];
  meId: string | null;
  onChange: (value: AssigneeFilter) => void;
}) {
  const { t } = useTranslation();
  const options = [
    { value: 'all', label: t('inbox.assigneeFilter.all') },
    { value: 'unassigned', label: t('inbox.assigneeFilter.unassigned') },
    ...members.map((m) =>
      m.user_id === meId
        ? { value: 'me', label: t('inbox.assigneeFilter.you') }
        : { value: m.user_id, label: m.name },
    ),
  ];
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <SelectMenu
      value={value}
      onChange={onChange}
      options={options}
      trigger={
        <button
          type="button"
          aria-label={t('inbox.assigneeFilter.label')}
          className={cx(filterPillClass(value !== 'all'), 'pr-2.5')}
        >
          <span className="max-w-28 truncate">{current?.label}</span>
          <ChevronDown aria-hidden className="size-3.5 opacity-70" />
        </button>
      }
    />
  );
}

function Row({
  conversation: c,
  selected,
  now,
  onSelect,
  checked,
  onCheck,
}: {
  conversation: Conversation;
  selected: boolean;
  now: number;
  onSelect: () => void;
  /** Set in select mode: the row toggles a checkbox instead of opening the thread. */
  checked?: boolean;
  onCheck: () => void;
}) {
  const { t } = useTranslation();
  const unread = c.unread_count > 0;
  const waiting = waitingSince(c);
  const last = c.last_message;
  const open = c.status === 'open';
  const snoozedUntil = open && isSnoozed(c.snoozed_until, now) ? c.snoozed_until : null;
  const back = open && isBackFromLater(c.snoozed_until, now);
  const prefix =
    last?.author === 'agent' ? (
      <span className="text-ai-ink">{t('inbox.author.ai')} · </span>
    ) : last?.author === 'system' ? (
      <span>{t('inbox.author.system')} · </span>
    ) : last?.direction === 'out' ? (
      <span>{t('inbox.you')} · </span>
    ) : null;

  const name =
    c.customer_name ??
    (c.channel === 'web' ? t('inbox.websiteVisitor') : t('inbox.unknownCustomer'));
  const selecting = checked !== undefined;
  const className = cx(
    'flex w-full gap-3 border-b border-l-[3px] border-b-line py-2.5 pr-3 pl-2.5 text-left',
    selecting
      ? 'cursor-pointer has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-active'
      : 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-active',
    selected || checked
      ? 'border-l-transparent bg-panel-muted'
      : c.needs_human
        ? 'border-l-warn-ink hover:bg-panel-muted/60'
        : 'border-l-transparent hover:bg-panel-muted/60',
  );
  const content = (
    <>
      <CustomerAvatar
        name={c.customer_name}
        photoUrl={c.customer_photo_url}
        channel={c.channel === 'web' ? 'web' : 'messenger'}
      />
      <span className="block min-w-0 flex-1 space-y-1">
        <span className="flex items-center gap-1.5">
          {unread && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-ok-ink" />}
          <span
            className={cx(
              'min-w-0 flex-1 truncate text-sm',
              unread ? 'font-semibold text-ink' : 'text-ink-muted',
            )}
          >
            {name}
          </span>
          {unread && (
            <span className="sr-only">{t('inbox.unread', { count: c.unread_count })}</span>
          )}
          {c.last_message_at && (
            <span className="shrink-0 tabular-nums text-xs text-ink-faint">
              {formatAge(c.last_message_at, now)}
            </span>
          )}
        </span>

        <span className="flex items-center gap-2">
          <span
            className={cx(
              'min-w-0 flex-1 truncate text-sm',
              unread ? 'text-ink' : 'text-ink-muted',
            )}
          >
            {prefix}
            {last?.text ??
              (last?.template_type
                ? t(`inbox.template.preview.${last.template_type}`)
                : last?.has_attachments
                  ? t('inbox.attachment')
                  : '')}
          </span>
          {isWorking(c.agent_activity) ? (
            <Chip tone="ai" icon={Sparkles} className="[&>svg]:animate-pulse">
              {t('inbox.activity.chip.working')}
            </Chip>
          ) : c.agent_activity?.phase === 'failed' ? (
            <Chip tone="warn" icon={AlertTriangle}>
              {t('inbox.activity.chip.failed')}
            </Chip>
          ) : waiting ? (
            // Plain text, not an amber chip: nearly every open row waits, and amber is kept for
            // what needs a person (Needs you, a failed run, Back from Later).
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums text-ink-muted">
              <Timer aria-hidden className="size-3.5" />
              <span className="sr-only">{t('inbox.waiting')} </span>
              {formatWaiting(waiting, now)}
            </span>
          ) : c.ai_paused ? (
            <Chip tone="team" icon={c.takeover_deadline ? Timer : undefined}>
              {t('inbox.handler.person')}
            </Chip>
          ) : null}
          {c.assignee && (
            <span
              title={t('inbox.assign.assignedTo', { name: c.assignee.name })}
              className="flex size-5 shrink-0 items-center justify-center rounded-full border border-line bg-team font-medium text-[0.6rem] text-team-ink"
            >
              <span aria-hidden>{initials(c.assignee.name)}</span>
              <span className="sr-only">
                {t('inbox.assign.assignedTo', { name: c.assignee.name })}
              </span>
            </span>
          )}
        </span>

        {(c.needs_human || !c.window_open || snoozedUntil || back) && (
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            {snoozedUntil && (
              <Chip icon={AlarmClock} className="max-w-full">
                <span className="truncate">
                  {t('inbox.later.chipUntil', { when: formatLaterUntil(snoozedUntil, now) })}
                </span>
              </Chip>
            )}
            {back && (
              <Chip tone="warn" icon={AlarmClock} className="max-w-full">
                <span className="truncate">
                  {t('inbox.later.back')}
                  {c.snooze_note && ` · ${c.snooze_note}`}
                </span>
              </Chip>
            )}
            {c.needs_human && (
              <Chip tone="warn" icon={AlertTriangle}>
                {c.escalation_reason
                  ? t(`inbox.escalationShort.${c.escalation_reason}`)
                  : t('inbox.needsHuman')}
              </Chip>
            )}
            {!c.window_open && <Chip>{t('inbox.windowClosedShort')}</Chip>}
          </span>
        )}
      </span>
    </>
  );

  if (selecting) {
    return (
      <label className={className}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onCheck}
          aria-label={t('inbox.bulk.selectRow', { name })}
          className="mt-3 size-4 shrink-0 accent-active"
        />
        {content}
      </label>
    );
  }
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      className={className}
    >
      {content}
    </button>
  );
}
