// Stands in for the API's live inbox stream (server-sent events): the demo handlers emit the same
// id-only signals, and `InboxStreamProvider` passes them to its listeners.
export interface DemoSignal {
  kind: string;
  conversation_id: string | null;
}

export const DEMO_STREAM_EVENT = 'demo:inbox';

export function emitInboxSignal(signal: DemoSignal) {
  window.dispatchEvent(new CustomEvent<DemoSignal>(DEMO_STREAM_EVENT, { detail: signal }));
}
