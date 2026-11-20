import {
  AlarmClock,
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  PanelRight,
  StickyNote,
  TriangleAlert,
  UserPlus,
  UserRound,
} from 'lucide-react';
import { useId } from 'react';
import { useTakeoverSettings } from '../settings/useTakeoverSettings';
import { useFeatures } from '../entitlements/useFeatures';
import { useTranslation } from 'react-i18next';
import { ActionButton, IconButton, SelectMenu, cx } from '../components/ui';
import type { components } from '../api/schema';
import { formatDateTime, formatAgo } from '../i18n/format';
import type { Member } from '../team/useMembers';
import { CustomerAvatar } from './CustomerAvatar';
import { initials } from './initials';
import type { Conversation } from './InboxPage';
import { effectiveAiMode } from './aiMode';
import { formatLaterUntil, isSnoozed } from './later';
import { LaterMenu } from './LaterMenu';
import { useMinuteClock } from './useMinuteClock';

export type ConversationUpdate = components['schemas']['ConversationUpdate'];

/** Who the chat is with, who is answering it, and the actions on the conversation itself. */
export function ThreadHeader({
  conversation,
  note,
  panelOpen,
  onPatch,
  onSnooze,
  onUnsnooze,
  members,
  meId,
  onAssign,
  onTogglePanel,
  onClose,
}: {
  conversation: Conversation;
  /** The team's note on the customer, shown on the status line. */
  note: string | null;
  panelOpen: boolean;
  onPatch: (body: ConversationUpdate) => void;
  /** Put it off until `until`; resolves true once the server accepted it. */
  onSnooze: (until: Date, note: string | null) => Promise<boolean>;
  onUnsnooze: () => void;
  members: Member[];
  meId: string | null;
  /** Assign to a teammate, or to nobody (`null`). */
  onAssign: (userId: string | null) => void;
  onTogglePanel: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const webChatEnabled = useFeatures().isEnabled('web_chat', false);
  const now = useMinuteClock();
  const snoozedUntil = isSnoozed(conversation.snoozed_until, now)
    ? conversation.snoozed_until
    : null;
  const assigner = assignerName(conversation.assigned_by?.name);

  return (
    <div className="@container shrink-0 border-b border-line">
      {/* One row: back, who the chat is with (and, under the name, who answers it), then the
          actions on the conversation. Alerts that need a person sit in strips below. */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <IconButton
          icon={ArrowLeft}
          label={t('inbox.backToList')}
          onClick={onClose}
          className="border-transparent bg-transparent"
        />
        {/* Hidden on narrow headers, where every pixel goes to the name. */}
        <span className="@max-md:hidden">
          <CustomerAvatar
            name={conversation.customer_name}
            photoUrl={conversation.customer_photo_url}
            size="sm"
            channel={conversation.channel === 'web' ? 'web' : 'messenger'}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate leading-snug font-semibold text-ink">
              {conversation.customer_name ??
                (conversation.channel === 'web'
                  ? t('inbox.websiteVisitor')
                  : t('inbox.unknownCustomer'))}
            </h2>
            {conversation.channel !== 'web' || webChatEnabled ? (
              <span className="sr-only">
                {t(`inbox.channel.${conversation.channel === 'web' ? 'web' : 'messenger'}`)}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            <HandlerStatus
              paused={conversation.ai_paused}
              aiAvailable={conversation.ai_available !== false}
            />
            {conversation.takeover_deadline && (
              <p className="tabular-nums">
                {t('takeovers.deadline', {
                  when: formatDateTime(conversation.takeover_deadline),
                  minutes: Math.max(
                    0,
                    Math.ceil((new Date(conversation.takeover_deadline).getTime() - now) / 60000),
                  ),
                })}
                {snoozedUntil &&
                  new Date(snoozedUntil) > new Date(conversation.takeover_deadline) && (
                    <span> {t('takeovers.laterDeferral')}</span>
                  )}
              </p>
            )}
            {assigner && (
              <p className="min-w-0 truncate">
                {conversation.assigned_at
                  ? t('inbox.assign.assignedBy', {
                      name: assigner,
                      ago: formatAgo(conversation.assigned_at, now),
                    })
                  : t('inbox.assign.assignedByName', { name: assigner })}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {members.length > 1 && (
            <AssignMenu
              assignee={conversation.assignee ?? null}
              members={members}
              meId={meId}
              onAssign={onAssign}
            />
          )}
          <HandlerAction
            paused={conversation.ai_paused}
            aiAvailable={conversation.ai_available !== false}
            onPatch={onPatch}
          />
          {conversation.status === 'open' && <LaterMenu onSnooze={onSnooze} />}
          {conversation.status === 'open' ? (
            <ActionButton
              size="sm"
              icon={Check}
              title={t('inbox.done')}
              className="h-8"
              onClick={() => onPatch({ status: 'closed' })}
            >
              <span className="@max-sm:sr-only">{t('inbox.done')}</span>
            </ActionButton>
          ) : (
            <ActionButton size="sm" className="h-8" onClick={() => onPatch({ status: 'open' })}>
              {t('inbox.reopen')}
            </ActionButton>
          )}
          <IconButton
            icon={PanelRight}
            label={t(panelOpen ? 'inbox.hidePanel' : 'inbox.showPanel')}
            aria-expanded={panelOpen}
            onClick={onTogglePanel}
            className="xl:hidden"
          />
        </div>
      </div>

      {conversation.needs_human && (
        <p className="flex min-w-0 items-center gap-2 border-t border-warn-ink/20 bg-warn px-4 py-1.5 text-xs text-warn-ink">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate font-medium">
            {conversation.escalation_reason
              ? t(`inbox.escalation.${conversation.escalation_reason}`)
              : t('inbox.escalatedTitle')}
          </span>
          <ActionButton
            size="sm"
            tone="ghost"
            className="shrink-0 text-warn-ink hover:bg-panel/60 hover:text-warn-ink"
            onClick={() => onPatch({ needs_human: false })}
          >
            {t('inbox.clearNeedsHuman')}
          </ActionButton>
        </p>
      )}

      {snoozedUntil ? (
        <p className="flex min-w-0 items-center gap-2 border-t border-line px-4 py-1.5 text-xs">
          <AlarmClock aria-hidden className="size-3.5 shrink-0 text-warn-ink" />
          <span className="shrink-0 font-medium text-warn-ink">
            {t('inbox.later.until', { when: formatLaterUntil(snoozedUntil, now) })}
          </span>
          {conversation.snooze_note && (
            <span className="min-w-0 truncate text-ink-muted" title={conversation.snooze_note}>
              {conversation.snooze_note}
            </span>
          )}
          <ActionButton size="sm" tone="ghost" className="ml-auto shrink-0" onClick={onUnsnooze}>
            {t('inbox.later.backNow')}
          </ActionButton>
        </p>
      ) : (
        // The customer panel shows the note from xl, so the header carries it only below that.
        note && (
          <p className="flex min-w-0 items-center gap-2 border-t border-line px-4 py-1.5 text-xs xl:hidden">
            <StickyNote aria-hidden className="size-3.5 shrink-0 text-team-ink" />
            <span className="truncate text-ink-muted" title={note}>
              <span className="sr-only">{t('inbox.panel.teamNote')}: </span>
              {note}
            </span>
          </p>
        )
      )}
    </div>
  );
}

/** A person's name for the "Assigned by" line. An email standing in for a missing name is not one. */
function assignerName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? '';
  if (!trimmed || trimmed.includes('@')) return null;
  return trimmed;
}

/** Who answers the chat right now, as a quiet badge. The action to change it sits in the header. */
function HandlerStatus({ paused, aiAvailable }: { paused: boolean; aiAvailable: boolean }) {
  const { t } = useTranslation();
  const { settings } = useTakeoverSettings();
  const hintId = useId();
  // Until the shop's AI mode is known any badge could be wrong.
  if (!settings) return null;
  const state = paused ? 'team' : effectiveAiMode(aiAvailable, settings);
  // In Draft mode "AI" alone suggests it replies, so the badge says it never sends.
  const hint = state === 'draft' ? t('inbox.handlerStatus.draftHint') : undefined;
  return (
    <span
      title={hint}
      aria-describedby={hint ? hintId : undefined}
      className={cx(
        // Coloured text on the status line, not a pill: the line stays one quiet row of facts.
        'inline-flex items-center gap-1 font-medium whitespace-nowrap',
        state === 'team' && 'text-ok-ink',
        (state === 'draft' || state === 'auto') && 'text-ai-ink',
        state === 'off' && 'text-ink-muted',
      )}
    >
      {state === 'team' ? (
        <UserRound aria-hidden className="size-3.5" />
      ) : (
        <Bot aria-hidden className="size-3.5" />
      )}
      {t(`inbox.handlerStatus.${state}`)}
      {hint && (
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      )}
    </span>
  );
}

/**
 * Switches who answers the chat: take over from the AI, or hand back to it. The duration menu
 * beside Take over sets when a takeover ends. Narrow headers keep only the icon.
 */
function HandlerAction({
  paused,
  aiAvailable,
  onPatch,
}: {
  paused: boolean;
  aiAvailable: boolean;
  onPatch: (body: ConversationUpdate) => void;
}) {
  const { t } = useTranslation();
  const { settings, error } = useTakeoverSettings();
  const mode = settings ? effectiveAiMode(aiAvailable, settings) : null;
  // With the AI off there is nothing to take over. A pause already in place can still be lifted.
  // Until the mode is known the button would flicker in and out, unless it can never be known.
  if (!paused && (mode === 'off' || (mode === null && !error))) return null;
  const action = t(paused ? 'inbox.handBackToAi' : 'inbox.takeOver');
  const hint = paused
    ? t('inbox.handBackHint')
    : mode === null
      ? undefined
      : t(`inbox.takeOverHint.${mode}`);
  return (
    <div className="flex items-center gap-0.5">
      <ActionButton
        size="sm"
        tone={paused ? 'soft-ai' : undefined}
        icon={paused ? Bot : UserRound}
        aria-label={action}
        title={hint}
        className="h-8"
        onClick={() => onPatch({ ai_paused: !paused })}
      >
        <span className="@max-lg:hidden">{action}</span>
      </ActionButton>
      {!paused && (
        <SelectMenu
          value=""
          onChange={(value) =>
            onPatch({
              ai_paused: true,
              takeover_duration_minutes:
                value === 'never' ? null : (Number(value) as 30 | 60 | 360),
            })
          }
          options={[30, 60, 360, 'never'].map((value) => ({
            value: String(value),
            label: t(`takeovers.duration.${value}`),
            hint:
              settings && (settings.takeover_default_minutes ?? 'never') === value
                ? t('takeovers.shopDefault')
                : undefined,
          }))}
          trigger={<IconButton icon={ChevronDown} label={t('takeovers.chooseDuration')} />}
        />
      )}
    </div>
  );
}

// Not a user id (those are UUIDs): the menu's "nobody" choice.
const UNASSIGNED = 'unassigned';

/** Who looks after the chat. Independent of the AI: assigning does not take over. */
function AssignMenu({
  assignee,
  members,
  meId,
  onAssign,
}: {
  assignee: Conversation['assignee'];
  members: Member[];
  meId: string | null;
  onAssign: (userId: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <SelectMenu
      value={assignee?.id ?? UNASSIGNED}
      onChange={(value) => {
        if (value !== (assignee?.id ?? UNASSIGNED)) onAssign(value === UNASSIGNED ? null : value);
      }}
      options={[
        { value: UNASSIGNED, label: t('inbox.assign.nobody') },
        ...members.map((m) => ({
          value: m.user_id,
          label: m.user_id === meId ? t('inbox.assign.you', { name: m.name }) : m.name,
          hint: m.role === 'owner' ? t('inbox.assign.owner') : undefined,
        })),
      ]}
      trigger={
        assignee ? (
          <button
            type="button"
            aria-label={t('inbox.assign.assignedTo', { name: assignee.name })}
            title={t('inbox.assign.assignedTo', { name: assignee.name })}
            className="inline-flex size-8 items-center justify-center rounded-md border border-line bg-panel text-[0.65rem] font-semibold text-team-ink hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-active"
          >
            <span
              aria-hidden
              className="flex size-6 items-center justify-center rounded-full bg-team"
            >
              {initials(assignee.name)}
            </span>
          </button>
        ) : (
          <IconButton icon={UserPlus} label={t('inbox.assign.button')} />
        )
      }
    />
  );
}
