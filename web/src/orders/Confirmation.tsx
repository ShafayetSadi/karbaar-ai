import { useTranslation } from 'react-i18next';
import type { components } from '../api/schema';
import { Chip, type ChipTone } from '../components/ui';
import { formatDateTime } from '../i18n/format';

type Confirmation = components['schemas']['OrderConfirmationRead'];
type ConfirmationStatus = Confirmation['status'];

// `superseded` (the merchant decided first) and `skipped` (never sent) need no badge.
const TONES: Partial<Record<ConfirmationStatus, ChipTone>> = {
  requested: 'ai',
  confirmed: 'ok',
  cancelled: 'neutral',
  change_requested: 'warn',
  needs_call: 'danger',
};

/** Where the Messenger confirmation request stands: "Awaiting customer", "To call: no reply". */
export function ConfirmationBadge({
  confirmation,
}: {
  confirmation: Confirmation | null | undefined;
}) {
  const { t } = useTranslation();
  if (!confirmation) return null;
  const tone = TONES[confirmation.status];
  if (!tone) return null;
  const label =
    confirmation.status === 'needs_call' && confirmation.needs_call_reason
      ? t(`orders.confirmation.toCall.${confirmation.needs_call_reason}`)
      : t(`orders.confirmation.badge.${confirmation.status}`);
  return <Chip tone={tone}>{label}</Chip>;
}

/** The request's steps on the order page: sent, reminded, to call, and how it ended. */
export function ConfirmationTimeline({
  confirmation,
}: {
  confirmation: Confirmation | null | undefined;
}) {
  const { t } = useTranslation();
  if (!confirmation || (!confirmation.requested_at && !confirmation.needs_call_at)) return null;
  const steps: { key: string; label: string; at: string }[] = [];
  if (confirmation.requested_at) {
    steps.push({
      key: 'sent',
      label: t('orders.confirmation.step.sent'),
      at: confirmation.requested_at,
    });
  }
  if (confirmation.reminded_at) {
    steps.push({
      key: 'reminded',
      label: t('orders.confirmation.step.reminded'),
      at: confirmation.reminded_at,
    });
  }
  if (confirmation.needs_call_at) {
    steps.push({
      key: 'toCall',
      label:
        confirmation.status === 'needs_call' && confirmation.needs_call_reason
          ? t(`orders.confirmation.toCall.${confirmation.needs_call_reason}`)
          : t('orders.confirmation.step.toCall'),
      at: confirmation.needs_call_at,
    });
  }
  if (confirmation.resolved_at) {
    steps.push({
      key: 'resolved',
      label: t(`orders.confirmation.step.${confirmation.status}`),
      at: confirmation.resolved_at,
    });
  }
  // A late tap can resolve a request after it went on To call: keep the steps in time order.
  steps.sort((a, b) => a.at.localeCompare(b.at));
  return (
    <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-ink">{t('orders.confirmation.title')}</h2>
      <ol className="mt-3 space-y-1 text-sm">
        {steps.map((step) => (
          <li key={step.key} className="flex flex-wrap justify-between gap-x-4">
            <span className="text-ink">{step.label}</span>
            <span className="tabular-nums text-xs text-ink-muted">{formatDateTime(step.at)}</span>
          </li>
        ))}
      </ol>
      {confirmation.status === 'needs_call' && (
        <p className="mt-3 text-sm text-ink-muted">{t('orders.confirmation.callHint')}</p>
      )}
    </div>
  );
}
