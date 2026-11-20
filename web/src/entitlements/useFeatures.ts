import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { call } from '../api/call';

export type FeatureKey =
  | 'ai_drafting'
  | 'auto_mode_allowed'
  | 'catalog_import'
  | 'history_import'
  | 'website'
  | 'web_chat'
  | 'courier_booking'
  // Despite the key, the API resolves this to "Page connection is open": the platform switch
  // META_PAGE_CONNECT_OPEN, or staff's exemption for this shop.
  | 'page_connect_before_meta_live'
  | 'ai_daily_token_budget'
  | 'team_members_max'
  | 'products_max'
  | (string & {});

export type FeatureKind = 'flag' | 'limit';

export interface MerchantFeature {
  key: FeatureKey;
  kind: FeatureKind;
  value: boolean | number | null;
  current?: number | null;
}

export interface FeaturesResult {
  features: Record<string, MerchantFeature>;
  raw: MerchantFeature[];
  loading: boolean;
  failed: boolean;
  isEnabled: (key: FeatureKey, defaultVal?: boolean) => boolean;
  limitOf: (key: FeatureKey) => number | null;
  currentOf: (key: FeatureKey) => number | null;
  isLimitReached: (key: FeatureKey) => boolean;
  reload: () => void;
}

/**
 * Resolved feature flags and limits for the signed-in merchant.
 */
export function useFeatures(): FeaturesResult {
  const query = useQuery({
    queryKey: ['merchant-features'],
    queryFn: async () => {
      const result = await call(() => api.GET('/v1/merchants/me/features'));
      if (!result.ok) throw new Error('Could not load merchant features');
      return result.data.items;
    },
    staleTime: 30_000,
  });
  const raw = useMemo(() => query.data ?? [], [query.data]);
  const features = useMemo(() => {
    const map: Record<string, MerchantFeature> = {};
    for (const item of raw) map[item.key] = item;
    return map;
  }, [raw]);
  const reload = useCallback(() => {
    void query.refetch();
  }, [query.refetch]);

  const isEnabled = useCallback(
    (key: FeatureKey, defaultVal = true): boolean => {
      const f = features[key];
      if (!f) return defaultVal;
      return f.value !== false;
    },
    [features],
  );

  const limitOf = useCallback(
    (key: FeatureKey): number | null => {
      const f = features[key];
      if (!f || f.value === null || typeof f.value !== 'number') return null;
      return f.value;
    },
    [features],
  );

  const currentOf = useCallback(
    (key: FeatureKey): number | null => {
      const f = features[key];
      return typeof f?.current === 'number' ? f.current : null;
    },
    [features],
  );

  const isLimitReached = useCallback(
    (key: FeatureKey): boolean => {
      const limit = limitOf(key);
      if (limit === null) return false;
      const current = currentOf(key) ?? 0;
      return current >= limit;
    },
    [limitOf, currentOf],
  );

  return {
    features,
    raw,
    loading: query.isPending,
    failed: query.isError,
    isEnabled,
    limitOf,
    currentOf,
    isLimitReached,
    reload,
  };
}
