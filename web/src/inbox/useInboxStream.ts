import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DEMO_STREAM_EVENT, type DemoSignal } from '../demo/stream';

export interface InboxSignal {
  kind: string;
  conversationId: string | null;
}

/** `connecting` covers the first connect and every automatic reconnect. */
export type LiveStatus = 'connecting' | 'live' | 'offline';

type Listener = (signal: InboxSignal) => void;

const StreamContext = createContext<{
  status: LiveStatus;
  subscribe: (listener: Listener) => () => void;
  reconnect: () => void;
} | null>(null);

/**
 * Owns the API's live inbox stream for the signed-in shell: one connection per tab, shared by
 * the status indicators and every `useInboxStream` caller. Events carry only ids: callers
 * refetch over REST. `resync` means "refetch everything" (the browser reconnected, or the server
 * fell behind). `EventSource` reconnects by itself; without it (or if it never connects) REST data
 * stays correct, just not live.
 */
export function InboxStreamProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const [status, setStatus] = useState<LiveStatus>('connecting');
  // Bumped by `reconnect` to open a fresh connection once the browser has given up.
  const [attempt, setAttempt] = useState(0);
  const [reconnect] = useState(() => () => {
    setStatus('connecting');
    setAttempt((n) => n + 1);
  });
  const [subscribe] = useState(() => (listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  });

  // Demo build: no server stream. The demo handlers emit the same signals as window events.
  useEffect(() => {
    setStatus('live');
    const onSignal = (event: Event) => {
      const data = (event as CustomEvent<DemoSignal>).detail;
      const signal = { kind: data.kind, conversationId: data.conversation_id };
      for (const listener of listeners.current) listener(signal);
    };
    window.addEventListener(DEMO_STREAM_EVENT, onSignal);
    return () => window.removeEventListener(DEMO_STREAM_EVENT, onSignal);
  }, [attempt]);

  return createElement(StreamContext, { value: { status, subscribe, reconnect } }, children);
}

/** Whether live updates are arriving; `offline` outside the signed-in shell. */
export function useLiveStatus(): LiveStatus {
  return useContext(StreamContext)?.status ?? 'offline';
}

/** Opens a fresh live connection after it went `offline`; a no-op outside the shell. */
export function useReconnectLive(): () => void {
  return useContext(StreamContext)?.reconnect ?? noop;
}

function noop() {}

/** Call `onSignal` for each live inbox event while mounted. */
export function useInboxStream(onSignal: (signal: InboxSignal) => void) {
  // Stable across status changes, so a reconnect does not re-subscribe.
  const subscribe = useContext(StreamContext)?.subscribe;
  // Latest callback without re-subscribing on every render.
  const handler = useRef(onSignal);
  useEffect(() => {
    handler.current = onSignal;
  });

  useEffect(() => subscribe?.((signal) => handler.current(signal)), [subscribe]);
}
