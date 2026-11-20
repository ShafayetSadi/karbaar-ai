import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { call } from '../api/call';
import { unwrap } from '../api/query';
import type { ApiError } from '../api/errors';
import type { components } from '../api/schema';

type Settings = components['schemas']['AiSettingsRead'];
type Update = components['schemas']['AiSettingsUpdate'];
const KEY = ['takeover-settings'];

/** The owner suggestion, setting and inbox control share the current shop's saved preference. */
export function useTakeoverSettings() {
  const cache = useQueryClient();
  const query = useQuery<Settings, ApiError>({
    queryKey: KEY,
    queryFn: async () => unwrap(await call(() => api.GET('/v1/merchant/ai-settings'))),
  });
  const [writeError, setWriteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function update(body: Update) {
    setBusy(true);
    setWriteError(null);
    const result = await call(() => api.PUT('/v1/merchant/ai-settings', { body }));
    if (result.ok) cache.setQueryData(KEY, result.data);
    else setWriteError(result.error.message);
    setBusy(false);
    return result.ok;
  }
  return {
    settings: query.data ?? null,
    error: writeError ?? query.error?.message ?? null,
    busy,
    update,
  };
}
