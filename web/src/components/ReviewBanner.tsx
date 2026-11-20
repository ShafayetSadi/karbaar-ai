import { useTranslation } from 'react-i18next';
import { useApproval } from '../auth/useApproval';

// Where a merchant can reach us (a mailto: or WhatsApp link). Unset: the contact link is left out.
const SUPPORT_URL = (import.meta.env.VITE_SUPPORT_URL as string | undefined) || null;

/** "01712345678" from "+8801712345678", shown as `01712-345678` the way people write it. */
function localPhone(e164: string): string {
  const national = e164.startsWith('+880') ? `0${e164.slice(4)}` : e164;
  return national.length === 11 ? `${national.slice(0, 5)}-${national.slice(5)}` : national;
}

/** Where the shop is in staff review. Nothing once approved. */
export function ReviewBanner() {
  const { t } = useTranslation();
  const { status, note, phone } = useApproval();
  if (status === 'approved') return null;
  const link = 'font-medium underline';

  return (
    <div
      role="status"
      className="shrink-0 border-b border-warn-ink/20 bg-warn text-sm text-warn-ink"
      data-review={status}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
        {status === 'pending' && (
          <span>
            {t('review.banner.pending')}
            {phone && ` ${t('review.banner.callYou', { phone: localPhone(phone) })}`}
          </span>
        )}
        {status === 'rejected' && (
          <>
            <span>
              {t('review.banner.rejected')}
              {note && ` ${t('review.banner.reason', { reason: note })}`}
            </span>
            {SUPPORT_URL && (
              <a href={SUPPORT_URL} className={link}>
                {t('review.banner.contact')}
              </a>
            )}
          </>
        )}
        {status === 'unsubmitted' && (
          <span>{t('review.banner.unsubmitted')}</span>
        )}
      </div>
    </div>
  );
}
