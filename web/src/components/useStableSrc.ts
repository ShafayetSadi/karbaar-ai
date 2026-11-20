import { useState } from 'react';

// Storage links are signed: every API response carries a new signature for the same file, so
// using each one as <img src> would download every image again on every refresh. Keep the first
// link seen for a file (the URL without its query string) until it stops loading, e.g. because
// it expired, then move to the newest one.
const kept = new Map<string, string>();

function fileOf(url: string): string {
  const query = url.indexOf('?');
  return query < 0 ? url : url.slice(0, query);
}

/**
 * A stable `src` for a signed image URL, and the `onError` handler that keeps it fresh.
 * `src` is null when there is no URL, or when even the newest link failed to load.
 */
export function useStableSrc(url: string | null | undefined): {
  src: string | null;
  onError: () => void;
} {
  const [, rerender] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  if (!url) return { src: null, onError: () => {} };

  const key = fileOf(url);
  let src = kept.get(key);
  if (src === undefined || src === failed) {
    src = url;
    kept.set(key, url);
  }
  const shown = src;
  return {
    src: shown === failed ? null : shown,
    onError: () => {
      if (shown !== url) {
        // The kept link went stale; the newest one is still fresh.
        kept.set(key, url);
        rerender((n) => n + 1);
      } else {
        // Even the newest link failed: show nothing until a response brings another one.
        setFailed(shown);
      }
    },
  };
}
