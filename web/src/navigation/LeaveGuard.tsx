import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { UNSAFE_DataRouterContext, useBlocker, type BlockerFunction } from 'react-router-dom';

export interface LeaveGuardProps {
  dirty: boolean;
  bypass: RefObject<boolean>;
  message: string;
  /**
   * Replaces the browser confirm with the screen's own prompt (e.g. Save and continue / Discard /
   * Stay). Call `proceed` to leave or `stay` to remain.
   */
  onLeave?: (decision: { proceed: () => void; stay: () => void }) => void;
  ignoreParams?: readonly string[];
  /** Destinations that stay inside the guarded screen and never need a prompt. */
  allowPath?: (pathname: string) => boolean;
}

type Registry = Map<object, RefObject<LeaveGuardProps>>;
const GuardRegistry = createContext<Registry | null>(null);

function blocks(props: LeaveGuardProps, transition: Parameters<BlockerFunction>[0]) {
  if (!props.dirty || props.bypass.current) return false;
  const { currentLocation, nextLocation } = transition;
  if (props.allowPath?.(nextLocation.pathname)) return false;
  const relevant = (search: string) => {
    const params = new URLSearchParams(search);
    for (const key of props.ignoreParams ?? ['menu']) params.delete(key);
    return params.toString();
  };
  return (
    currentLocation.pathname !== nextLocation.pathname ||
    relevant(currentLocation.search) !== relevant(nextLocation.search)
  );
}

function RouterLeaveGuard({ registry }: { registry: Registry }) {
  const owner = useRef<LeaveGuardProps | null>(null);
  const blocker = useBlocker((transition) => {
    // The most recently mounted (innermost) dirty editor owns the single prompt.
    for (const props of [...registry.values()].reverse()) {
      if (blocks(props.current, transition)) {
        owner.current = props.current;
        return true;
      }
    }
    return false;
  });
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const props = owner.current;
    if (props?.onLeave) {
      props.onLeave({ proceed: () => blocker.proceed(), stay: () => blocker.reset() });
    } else if (window.confirm(props?.message ?? '')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  return null;
}

/** One supported router blocker coordinates all mounted editors, including nested dialogs. */
export function NavigationGuards({ children }: { children: ReactNode }) {
  const router = useContext(UNSAFE_DataRouterContext);
  const [registry] = useState<Registry>(() => new Map());
  if (!router) return children;
  return (
    <GuardRegistry.Provider value={registry}>
      <RouterLeaveGuard registry={registry} />
      {children}
    </GuardRegistry.Provider>
  );
}

function StandaloneGuard(props: LeaveGuardProps) {
  const current = useRef(props);
  useLayoutEffect(() => {
    current.current = props;
  });
  const [registry] = useState<Registry>(() => new Map());
  useLayoutEffect(() => {
    registry.set(current, current);
    return () => {
      registry.delete(current);
    };
  }, [registry]);
  return <RouterLeaveGuard registry={registry} />;
}

/** The data router handles links and POP navigation before the current screen unmounts. */
export function LeaveGuard(props: LeaveGuardProps) {
  const router = useContext(UNSAFE_DataRouterContext);
  const registry = useContext(GuardRegistry);
  const current = useRef(props);
  useLayoutEffect(() => {
    current.current = props;
  });
  useLayoutEffect(() => {
    registry?.set(current, current);
    return () => {
      registry?.delete(current);
    };
  }, [registry]);
  useEffect(() => {
    if (!props.dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (props.bypass.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [props.dirty, props.bypass]);
  useEffect(() => {
    if (router || !props.dirty) return;
    // Compatibility for isolated components rendered without a data router.
    const click = (event: MouseEvent) => {
      if (
        props.bypass.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute('download'))
        return;
      const to = new URL(link.href);
      if (props.allowPath?.(to.pathname)) return;
      if (
        to.origin !== location.origin ||
        (to.pathname === location.pathname && to.search === location.search)
      )
        return;
      if (props.onLeave) {
        event.preventDefault();
        event.stopPropagation();
        props.onLeave({
          proceed: () => {
            const was = props.bypass.current;
            props.bypass.current = true;
            link.click();
            props.bypass.current = was;
          },
          stay: () => {},
        });
      } else if (!window.confirm(props.message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', click, true);
    return () => document.removeEventListener('click', click, true);
  }, [router, props.dirty, props.message, props.bypass, props.onLeave, props.allowPath]);
  return router && !registry ? <StandaloneGuard {...props} /> : null;
}
