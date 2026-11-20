import { useEffect, useRef } from 'react';

/**
 * Creates and caches a blob preview URL for each File in `files`.
 * Revokes the URL when the file is removed and revokes all preview URLs on unmount.
 */
export function useFilePreviews(files: File[]) {
  const previewsRef = useRef(new Map<File, string>());

  useEffect(() => {
    const map = previewsRef.current;
    const currentFiles = new Set(files);

    // Revoke and delete URLs for files that were removed
    for (const [file, url] of Array.from(map.entries())) {
      if (!currentFiles.has(file)) {
        URL.revokeObjectURL(url);
        map.delete(file);
      }
    }
  }, [files]);

  useEffect(() => {
    const map = previewsRef.current;
    return () => {
      for (const url of map.values()) {
        URL.revokeObjectURL(url);
      }
      map.clear();
    };
  }, []);

  return (file: File): string => {
    const map = previewsRef.current;
    const known = map.get(file);
    if (known) return known;
    const url = URL.createObjectURL(file);
    map.set(file, url);
    return url;
  };
}
