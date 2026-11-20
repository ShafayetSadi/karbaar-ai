import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** Memory only: no tenant data or scroll history survives the mounted shell/session. */
export function useScrollRestoration() {
  const ref = useRef<HTMLElement>(null);
  const positions = useRef(new Map<string, number>());
  const location = useLocation();
  const previous = useRef<{ route: string; top: number } | null>(null);
  const params = new URLSearchParams(location.search);
  params.delete('menu');
  params.delete('panel');
  const route = location.pathname + '?' + params.toString();
  useLayoutEffect(() => {
    const savedPositions = positions.current;
    const element = ref.current;
    if (!element) return;
    const top =
      savedPositions.get(location.key) ??
      (previous.current?.route === route ? previous.current.top : 0);
    // Lists load asynchronously. Retry restoration as their content acquires its height.
    const restore = () => {
      // Section links take priority over the remembered page position, including while
      // asynchronously loaded settings expand above the target.
      const target = location.hash ? document.getElementById(location.hash.slice(1)) : null;
      if (target && element.contains(target)) target.scrollIntoView?.({ block: 'start' });
      else element.scrollTop = top;
    };
    restore();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(restore);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    const stop = () => observer?.disconnect();
    element.addEventListener('wheel', stop, { passive: true, once: true });
    element.addEventListener('touchstart', stop, { passive: true, once: true });
    element.addEventListener('keydown', stop, { once: true });
    element.addEventListener('pointerdown', stop, { once: true });
    return () => {
      previous.current = { route, top: element.scrollTop };
      savedPositions.set(location.key, element.scrollTop);
      if (savedPositions.size > 100) savedPositions.delete(savedPositions.keys().next().value!);
      observer?.disconnect();
      element.removeEventListener('wheel', stop);
      element.removeEventListener('touchstart', stop);
      element.removeEventListener('keydown', stop);
      element.removeEventListener('pointerdown', stop);
    };
  }, [location.key, location.hash, route]);
  return ref;
}
