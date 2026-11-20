import type { TFunction } from 'i18next';
import { AlarmClock, CalendarClock, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Section } from '../components/ui';
import { formatAgo } from '../i18n/format';
import type { Conversation } from './InboxPage';
import { formatLaterUntil, isBackFromLater, isSnoozed } from './later';
import { useMinuteClock } from './useMinuteClock';
import type { ConversationContext } from './useConversationContext';

/**
 * What is coming up on this chat: the team's own Later reminder (set and cleared from the thread
 * header) and the one nudge the AI may send a customer who went quiet.
 */
export function FollowUps({
  conversation,
  followUp,
}: {
  conversation: Conversation;
  followUp: ConversationContext['follow_up'];
}) {
  const { t } = useTranslation();
  const now = useMinuteClock();
  const until = conversation.snoozed_until;
  const note = conversation.snooze_note;

  let later: ReactNode;
  if (until && isSnoozed(until, now)) {
    later = t('inbox.later.until', { when: formatLaterUntil(until, now) });
  } else if (until && isBackFromLater(until, now)) {
    later = t('inbox.later.back');
  } else {
    later = <span className="text-ink-faint">{t('inbox.followUps.laterNone')}</span>;
  }

  let nudge: ReactNode;
  if (!followUp.enabled) {
    nudge = (
      <span className="text-ink-faint">
        {t('inbox.followUps.off')}{' '}
        <Link to="/settings" className="underline underline-offset-2 hover:text-ink">
          {t('inbox.followUps.settings')}
        </Link>
      </span>
    );
  } else if (followUp.opted_out_at) {
    nudge = t('inbox.followUps.optedOut', { ago: formatAgo(followUp.opted_out_at, now) });
  } else if (followUp.requested_at) {
    nudge = t('inbox.followUps.requested', { ago: formatAgo(followUp.requested_at, now) });
  } else if (followUp.check_at) {
    nudge = t('inbox.followUps.checkAt', { when: formatLaterUntil(followUp.check_at, now) });
  } else {
    nudge = <span className="text-ink-faint">{t('inbox.followUps.none')}</span>;
  }

  return (
    <Section
      title={t('inbox.followUps.title')}
      icon={CalendarClock}
      summary={followUpSummary(until, now, followUp, t)}
      storageKey="inbox.panel.followUps"
    >
      <dl className="space-y-2">
        <div className="flex gap-2">
          <dt>
            <AlarmClock aria-hidden className="mt-0.5 size-3.5 text-warn-ink" />
            <span className="sr-only">{t('inbox.followUps.later')}</span>
          </dt>
          <dd className="min-w-0 text-ink">
            {later}
            {until && note && <p className="mt-0.5 break-words text-ink-muted">{note}</p>}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>
            <Sparkles aria-hidden className="mt-0.5 size-3.5 text-ink-muted" />
            <span className="sr-only">{t('inbox.followUps.nudge')}</span>
          </dt>
          <dd className="min-w-0 text-ink">{nudge}</dd>
        </div>
      </dl>
    </Section>
  );
}

/** The one line on the collapsed header: the sooner upcoming reminder, or none. */
function followUpSummary(
  until: string | null,
  now: number,
  followUp: ConversationContext['follow_up'],
  t: TFunction,
): string {
  const aiAt =
    followUp.enabled && !followUp.opted_out_at && !followUp.requested_at ? followUp.check_at : null;
  const laterFirst =
    until != null && isSnoozed(until, now) && (aiAt == null || new Date(until) <= new Date(aiAt));
  if (laterFirst && until) return t('inbox.later.until', { when: formatLaterUntil(until, now) });
  if (aiAt) return t('inbox.followUps.summaryAi', { when: formatLaterUntil(aiAt, now) });
  return t('inbox.followUps.summaryNone');
}
