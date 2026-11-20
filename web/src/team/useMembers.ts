import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { call } from '../api/call';
import type { components } from '../api/schema';

export type Member = components['schemas']['MemberRead'];

/**
 * The shop's team, for the assign menu and the Team settings. Empty until loaded or when the
 * fetch fails: callers then hide team controls rather than show a broken picker.
 */
export function useMembers(): { members: Member[]; failed: boolean; reload: () => void } {
  const [members, setMembers] = useState<Member[]>([]);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void call(() => api.GET('/v1/merchant/members')).then((result) => {
      if (cancelled) return;
      setFailed(!result.ok);
      if (result.ok) setMembers(result.data.items);
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback(() => setVersion((n) => n + 1), []);
  return { members, failed, reload };
}
