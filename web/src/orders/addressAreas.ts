import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { call } from '../api/call';
import type { components } from '../api/schema';

export type DistrictAreas = components['schemas']['DistrictAreasRead'];

/**
 * The 64 districts with their thanas and upazilas, for the address pickers. `districts` is null
 * while loading or when loading failed; the server then reads the district from the address text.
 * The list is static and the browser caches the response for a day.
 */
export function useAddressAreas(): { districts: DistrictAreas[] | null; failed: boolean } {
  const [districts, setDistricts] = useState<DistrictAreas[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/address-areas')).then((result) => {
      if (cancelled) return;
      if (result.ok) setDistricts(result.data);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { districts, failed };
}
