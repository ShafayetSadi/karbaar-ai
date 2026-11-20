import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { components } from '../api/schema';

type Option = components['schemas']['ProductPageDeliveryRead'];

/** The delivery list a customer sees on a product page, as the product page renders it. The
 * product page passes its Bangla-pinned `t`; elsewhere (the settings preview) the merchant's
 * language is used, so it may be left out. */
export function DeliveryList({ delivery, t }: { delivery: Option[]; t?: TFunction }) {
  const fallback = useTranslation().t;
  const translate = t ?? fallback;
  return (
    <ul className="divide-y divide-line rounded-md border border-line bg-panel text-sm">
      {delivery.map((option) => (
        <li key={option.name} className="flex justify-between gap-3 px-3 py-2">
          <span>
            {option.name}
            {option.zone_text && <span className="text-ink-muted"> · {option.zone_text}</span>}
            {option.eta_days_min != null && option.eta_days_max != null && (
              <span className="block text-xs text-ink-muted">
                {translate('delivery.daysRange', {
                  min: option.eta_days_min,
                  max: option.eta_days_max,
                })}
              </span>
            )}
          </span>
          <span className="font-mono">{option.fee_text}</span>
        </li>
      ))}
    </ul>
  );
}
