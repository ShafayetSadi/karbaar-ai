import { NETWORK_ERROR, parseApiError, type ApiError } from './errors';

/** Result of an API call with the error already parsed from the API's envelope. */
export type Outcome<T> = { ok: true; data: T } | { ok: false; error: ApiError };

// openapi-fetch throws on network failure; turn that into the same shape as an API error.
export async function call<T>(
  request: () => Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<Outcome<T>> {
  try {
    const { data, error, response } = await request();
    if (response.ok) return { ok: true, data: data as T };
    return { ok: false, error: parseApiError(error, response.status) };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}
