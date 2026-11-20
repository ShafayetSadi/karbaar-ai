import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

/** Each source can fail or refresh without hiding the other waiting work. */
export function useAttentionSource<T>(key: string, load: () => Promise<T>) {
  const query = useQuery({
    queryKey: ['home', key],
    queryFn: load,
    refetchOnWindowFocus: 'always',
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void query.refetch();
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [query.refetch]);
  return query;
}
