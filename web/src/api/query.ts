import type { Outcome } from './call';

/** The data of an API call, for a query function: a failed call throws its parsed `ApiError`. */
export function unwrap<T>(outcome: Outcome<T>): T {
  if (outcome.ok) return outcome.data;
  throw outcome.error;
}
