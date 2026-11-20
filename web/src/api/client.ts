import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema';
import { demoFetch } from '../demo';

// Must match the API's CsrfMiddleware: unsafe requests need this header (and a matching Origin,
// which browsers add themselves). Set it here, before openapi-fetch builds the Request.
// Firefox drops a File or Blob body (Content-Length stays, zero bytes are written) if a header
// is changed on that Request afterwards, which is what a later `headers.set` did to CSV import.
const CSRF_HEADER = 'X-CSRF-Protection';

const csrf: Middleware = {
  onResponse({ request, response }) {
    if (response.status === 401 && !new URL(request.url).pathname.startsWith('/v1/auth/')) {
      window.dispatchEvent(new Event('commerce-os:session-expired'));
    }
    return response;
  },
};

// Demo build: there is no API server; `demoFetch` answers every call in the browser.
export const api = createClient<paths>({
  baseUrl: window.location.origin,
  credentials: 'same-origin',
  headers: { [CSRF_HEADER]: '1' },
  fetch: (request) => demoFetch(request),
});
api.use(csrf);
