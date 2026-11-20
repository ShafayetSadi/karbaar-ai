// The demo has no server: every `/v1/*` call from `api` is answered here, in the browser, from
// in-memory data. Handlers are typed from the OpenAPI schema, so a fixture that drifts from what
// the pages expect fails `tsc`.
import type { paths } from '../api/schema';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Op<P extends keyof paths, M extends Method> = NonNullable<paths[P][M]>;
type JsonOf<R> = R extends { content: { 'application/json': infer J } } ? J : null;
type Ok<O> = O extends { responses: infer R }
  ? 200 extends keyof R
    ? JsonOf<R[200]>
    : 201 extends keyof R
      ? JsonOf<R[201]>
      : 202 extends keyof R
        ? JsonOf<R[202]>
        : null
  : never;
type Body<O> = O extends { requestBody?: { content: { 'application/json': infer B } } }
  ? B
  : undefined;

export interface Ctx<B> {
  params: Record<string, string>;
  query: URLSearchParams;
  body: B;
}

/** Thrown from a handler to answer with the API's error envelope. */
export class DemoError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Record') => new DemoError(404, 'NOT_FOUND', `${what} not found.`);

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: (ctx: Ctx<unknown>) => unknown;
}

const routes: Route[] = [];

/** Answer `method path` (path exactly as in the schema, e.g. `/v1/orders/{order_id}`). */
export function on<P extends keyof paths, M extends Method>(
  method: M,
  path: P,
  handler: (ctx: Ctx<Body<Op<P, M>>>) => Ok<Op<P, M>> | Promise<Ok<Op<P, M>>>,
) {
  const keys: string[] = [];
  const source = String(path).replace(/\{(\w+)\}/g, (_, key: string) => {
    keys.push(key);
    return '([^/]+)';
  });
  routes.push({
    method: method.toUpperCase(),
    pattern: new RegExp(`^${source}$`),
    keys,
    handler: handler as Route['handler'],
  });
}

function json(status: number, body: unknown) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, code: string, message: string) {
  return json(status, { error: { code, message, request_id: 'demo' } });
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 80 + Math.random() * 170));

export async function demoFetch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  await pause();
  for (const route of routes) {
    if (route.method !== request.method) continue;
    const match = route.pattern.exec(url.pathname);
    if (!match) continue;
    const params = Object.fromEntries(
      route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1] ?? '')]),
    );
    const text = request.method === 'GET' ? '' : await request.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    try {
      const data = await route.handler({ params, query: url.searchParams, body });
      return data === null || data === undefined ? json(204, null) : json(200, data);
    } catch (error) {
      if (error instanceof DemoError) return errorResponse(error.status, error.code, error.message);
      console.error('[demo]', request.method, url.pathname, error);
      return errorResponse(500, 'INTERNAL_ERROR', 'The demo could not answer this request.');
    }
  }
  console.warn('[demo] no handler for', request.method, url.pathname);
  return errorResponse(501, 'DEMO_UNAVAILABLE', 'This action is not available in the demo.');
}
