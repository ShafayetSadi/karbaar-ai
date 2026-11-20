# Demo API

The public demo has no backend. `api/client.ts` sends every request to `demoFetch` (`router.ts`),
which answers from in-memory data in the browser. A reload starts the demo over.

- `cast.ts`: the shop, owner, customers, catalog and fixed ids every handler shares.
- `handlers/*.ts`: one file per area. Each registers routes with `on(method, path, handler)`.
  The path is the schema's path (`/v1/orders/{order_id}`), and the handler's return value is
  type-checked against the response in `api/schema.d.ts`.
- `throw new DemoError(status, code, message)` (or `notFound()`) answers with the API's error envelope.
- `emitInboxSignal({ kind, conversation_id })` (`stream.ts`) tells open pages to refetch, as the
  live stream would.
- A request with no handler answers 501 `DEMO_UNAVAILABLE` and logs a warning in the console.
