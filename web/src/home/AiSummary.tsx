import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import { unwrap } from '../api/query';
import { dhakaDay } from '../i18n/format';
import { useAttentionSource } from './useAttentionSource';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One line under the greeting: how many of yesterday's chats Sowdagor AI replied in, and how many
 * customers are waiting now. Yesterday, because it is a whole day. `waiting` is the Waiting for a
 * reply count, or null while it is unknown. Owners of a set-up shop only.
 */
export function AiSummary({ waiting }: { waiting: number | null }) {
  const { t } = useTranslation();
  const query = useAttentionSource('ai-summary', async () => {
    const yesterday = dhakaDay(Date.now() - DAY_MS);
    const day = unwrap(
      await call(() =>
        api.GET('/v1/analytics/overview', {
          params: { query: { from: yesterday, to: yesterday } },
        }),
      ),
    ).days[0];
    // Any AI reply counts, whether or not a person also helped in that chat.
    return {
      chats: day?.chats ?? 0,
      ai: (day?.chats_ai_only ?? 0) + (day?.chats_ai_with_help ?? 0),
    };
  });
  const parts: string[] = [];
  if (query.data && query.data.chats > 0)
    parts.push(t('home.aiSummary.replied', { ai: query.data.ai, count: query.data.chats }));
  if (waiting !== null && (waiting > 0 || parts.length > 0))
    parts.push(
      waiting > 0 ? t('home.aiSummary.waiting', { count: waiting }) : t('home.aiSummary.nobody'),
    );
  if (parts.length === 0) return null;
  return <p className="mt-1 break-words text-sm text-ink">{parts.join(' · ')}</p>;
}
