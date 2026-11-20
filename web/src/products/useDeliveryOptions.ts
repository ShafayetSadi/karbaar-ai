import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { call } from '../api/call';
import type { PanelOption } from './DeliveryPanel';

/** The merchant's delivery options (active and archived), or null while loading. */
export function useDeliveryOptions(): PanelOption[] | null {
  const [options, setOptions] = useState<PanelOption[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/delivery/options')).then((result) => {
      // A failed load leaves the panel empty; the API still enforces every limit on its own.
      if (!cancelled) setOptions(result.ok ? result.data.items : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return options;
}
