// Registers every demo handler. Imported once by `api/client.ts`.
import './handlers/session';
import './handlers/catalog';
import './handlers/inbox';
import './handlers/orders';
import './handlers/settings';

export { demoFetch } from './router';
