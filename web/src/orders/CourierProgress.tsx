import { useTranslation } from 'react-i18next';
import type { components } from '../api/schema';

type Report = components['schemas']['StatusCourier'];

/** Courier reports stay separate from the order outcome and its authoritative money. */
export function CourierProgress({ report, language }: { report: Report; language?: string }) {
  const { t, i18n } = useTranslation(undefined, language ? { lng: language } : undefined);
  const locale = (language ?? i18n.language).startsWith('bn') ? 'bn-BD' : 'en-BD';
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Dhaka',
    }).format(new Date(value));
  if (!report.reported_status && report.milestones.length === 0) return null;
  return (
    <section className="space-y-2" aria-label={t('courierProgress.title')}>
      <h2 className="font-semibold">{t('courierProgress.title')}</h2>
      <p>
        {t(`couriers.providers.${report.provider}`)} ·{' '}
        {report.reported_status && t(`shipments.status.${report.reported_status}`)}
      </p>
      {report.tracking_code && (
        <p className="break-all font-mono text-sm">{report.tracking_code}</p>
      )}
      {report.courier_url && (
        <a
          className="text-sm underline"
          href={report.courier_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {t('courierProgress.courierLink')}
        </a>
      )}
      <ul className="space-y-2 text-sm">
        {report.milestones.map((milestone, index) => (
          <li key={index}>
            <span>
              {milestone.status === 'out_for_delivery'
                ? t('courierProgress.outForDelivery')
                : milestone.status === 'picked_up'
                  ? t('courierProgress.pickedUp')
                  : t(`shipments.status.${milestone.status}`)}
            </span>
            {' · '}
            <span>
              {milestone.occurred_at && milestone.timestamp_provenance === 'courier'
                ? t('courierProgress.occurredAt', { date: date(milestone.occurred_at) })
                : t('courierProgress.timeUnknown')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
