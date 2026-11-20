import { useEffect, useRef, useState } from 'react';
import type { ApiError } from '../api/errors';
import { uploadImages } from './uploadImage';

export interface PendingImage {
  key: string;
  file: File;
  progress: number;
}

/** Upload concurrently, then attach in selection order so the cover never depends on bandwidth. */
export function useImageUploads() {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingImage[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const active = useRef(false);
  useEffect(() => {
    const current = controllers.current;
    return () => {
      current.forEach((controller) => controller.abort());
      current.clear();
    };
  }, []);
  function cancel(key: string) {
    controllers.current.get(key)?.abort();
    setPending((items) => items.filter((item) => item.key !== key));
  }
  async function upload(
    files: File[],
    fallback: ApiError,
    attach: (mediaId: string) => Promise<boolean>,
    onFailure?: () => void,
  ) {
    if (active.current) return null;
    active.current = true;
    setBusy(true);
    const entries = files.map((file) => ({
      key: crypto.randomUUID(),
      file,
      progress: 0,
      controller: new AbortController(),
    }));
    entries.forEach((entry) => controllers.current.set(entry.key, entry.controller));
    setPending(entries);
    let error: ApiError | null = null;
    try {
      const results = await uploadImages(files, fallback, (index) => {
        const entry = entries[index]!;
        return {
          signal: entry.controller.signal,
          onProgress: (progress) =>
            setPending((items) =>
              items.map((item) => (item.key === entry.key ? { ...item, progress } : item)),
            ),
        };
      });
      for (const [index, result] of results.entries()) {
        const entry = entries[index]!;
        if (!entry.controller.signal.aborted) {
          if (!result.ok) {
            error ??= result.error;
            onFailure?.();
          } else if (!(await attach(result.data))) {
            error ??= fallback;
            onFailure?.();
          }
        }
        setPending((items) => items.filter((item) => item.key !== entry.key));
      }
      return error;
    } finally {
      entries.forEach((entry) => controllers.current.delete(entry.key));
      setPending([]);
      active.current = false;
      setBusy(false);
    }
  }
  return { pending, busy, upload, cancel };
}
