// The API's error envelope is `{"error": {"code", "message", "request_id", "details"?}}`. FastAPI's
// generated spec does not describe it, so it is parsed here rather than trusted from the types.
//
// The web app translates by `code` (`errors.<CODE>` in the locale files); the server's English
// `message` is a developer fallback. The Bangla UI never shows it: an untranslated code gets a
// generic Bangla line with the request ID. Screens may still override a code with their own words.

import i18n from '../i18n';

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
  /** HTTP response status, when the server returned one. */
  status?: number;
  /** Seconds until a rate-limited request may be tried again (HTTP 429). */
  retryAfter?: number;
  /** The error's `details` when it is an object (not the per-field list), e.g. a 409's fresh quote. */
  details?: Record<string, unknown>;
  fields: Record<string, string>;
}

const FALLBACK: ApiError = {
  code: 'UNKNOWN',
  message: 'Something went wrong. Please try again.',
  fields: {},
};

const CODE = /^[A-Z][A-Z0-9_]*$/;

/**
 * Codes whose English message names the specific thing (which record, which field, which product):
 * the English UI keeps those words, the Bangla UI shows `errors.<CODE>`.
 */
const SPECIFIC_IN_ENGLISH = new Set([
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'QUANTITY_BELOW_MINIMUM',
  'QUANTITY_ABOVE_MAXIMUM',
]);

function inBangla(): boolean {
  return i18n.language === 'bn';
}

/** "Try again in 42 seconds", from the API's `retry_after`; a generic line when it is not known. */
function rateLimitMessage(retryAfter?: number): string {
  if (!retryAfter) return i18n.t('errors.rateLimited');
  if (retryAfter >= 90)
    return i18n.t('errors.rateLimitedMinutes', { count: Math.ceil(retryAfter / 60) });
  return i18n.t('errors.rateLimitedSeconds', { count: retryAfter });
}

/** The words to show for this error in the current UI language. */
function localMessage(
  code: string,
  serverMessage: string,
  requestId?: string,
  retryAfter?: number,
  { ownWords = false } = {},
): string {
  if (code === 'RATE_LIMITED') return rateLimitMessage(retryAfter);
  if (!ownWords && !inBangla() && SPECIFIC_IN_ENGLISH.has(code)) return serverMessage;
  const key = `errors.${code}`;
  if (CODE.test(code) && i18n.exists(key)) return i18n.t(key);
  if (!inBangla()) return serverMessage;
  return requestId ? i18n.t('errors.genericWithRequest', { requestId }) : i18n.t('errors.generic');
}

/**
 * The words for a bare error code with no server message, such as the one the Facebook connect
 * callback puts in the redirect: `errors.<CODE>`, or the generic line for an unknown code.
 */
export function messageForCode(code: string): string {
  if (code === 'RATE_LIMITED') return rateLimitMessage();
  return localMessage(code, i18n.t('errors.generic'), undefined, undefined, { ownWords: true });
}

export function parseApiError(body: unknown, status?: number): ApiError {
  const error = (body as { error?: unknown } | null | undefined)?.error;
  if (typeof error !== 'object' || error === null) {
    return { ...FALLBACK, message: localMessage(FALLBACK.code, FALLBACK.message), status };
  }
  const e = error as Record<string, unknown>;
  const fields: Record<string, string> = {};
  if (Array.isArray(e.details)) {
    for (const d of e.details as { field?: unknown; message?: unknown }[]) {
      if (typeof d.field !== 'string' || typeof d.message !== 'string') continue;
      // "body.email" -> "email"; keep the first message per field.
      const name = d.field.replace(/^body\./, '');
      // Field messages are the server's English: the Bangla UI shows a generic line instead.
      fields[name] ??= inBangla() ? i18n.t('errors.fieldInvalid') : d.message;
    }
  }
  const details = e.details as { retry_after?: unknown } | null | undefined;
  const retryAfter =
    !Array.isArray(e.details) && typeof details?.retry_after === 'number'
      ? details.retry_after
      : undefined;
  const code = typeof e.code === 'string' ? e.code : FALLBACK.code;
  const requestId = typeof e.request_id === 'string' ? e.request_id : undefined;
  return {
    status,
    retryAfter,
    code,
    message: localMessage(
      code,
      typeof e.message === 'string' ? e.message : FALLBACK.message,
      requestId,
      retryAfter,
    ),
    details:
      typeof e.details === 'object' && e.details !== null && !Array.isArray(e.details)
        ? (e.details as Record<string, unknown>)
        : undefined,
    requestId,
    fields,
  };
}

/** The server may have committed an operation even though the client could not confirm it. */
export function isAmbiguousRequestFailure(error: ApiError): boolean {
  return (
    error.code === 'NETWORK_ERROR' ||
    error.status === 408 ||
    (error.status !== undefined && error.status >= 500)
  );
}

export const NETWORK_ERROR: ApiError = {
  code: 'NETWORK_ERROR',
  // A getter, so the words follow the UI language at the moment the error is shown or copied.
  get message() {
    return i18n.t('errors.NETWORK_ERROR');
  },
  fields: {},
};
