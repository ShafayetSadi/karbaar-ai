import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadImage } from '../media/uploadImage';

export const MAX_ATTACHMENTS = 10;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export { IMAGE_TYPES } from '../media/prepareImage';
import { IMAGE_TYPES } from '../media/prepareImage';

export type AttachmentProblem = 'type' | 'size' | 'upload';

/** One image waiting in the composer's tray: uploading, ready to send, or refused. */
export interface TrayItem {
  key: string;
  name: string;
  /** What to show: a local preview for a file from the device, the catalog URL otherwise. */
  preview: string | null;
  mediaId: string | null;
  problem: AttachmentProblem | null;
  progress?: number;
  errorMessage?: string;
}

export interface CatalogImage {
  mediaId: string;
  url: string | null;
  name: string;
}

export interface Attachments {
  items: TrayItem[];
  /** Some image is still uploading, so sending must wait. */
  uploading: boolean;
  /** Some image was refused; the merchant removes it before sending. */
  hasProblem: boolean;
  /** Media ids to send, in the order the images were added. */
  mediaIds: string[];
  full: boolean;
  addFiles: (files: File[]) => void;
  addCatalog: (images: CatalogImage[]) => void;
  remove: (key: string) => void;
  clear: () => void;
}

let counter = 0;
const nextKey = () => `attachment-${(counter += 1)}`;

function preview(file: File): string | null {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
}

/**
 * The images chosen for the next reply. A file from the device is uploaded at once (presigned
 * PUT, then verified by the API); a catalog image already has a media id and is just listed.
 * Images are kept in the order they were added, which is the order the customer receives them.
 */
export function useAttachments(): Attachments {
  const [items, setItems] = useState<TrayItem[]>([]);
  // Latest list, for the count limit and for revoking previews without a stale closure.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  // Previews created here, revoked on removal and on unmount.
  const controllers = useRef(new Map<string, AbortController>());
  const objectUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = objectUrls.current;
    const pending = controllers.current;
    return () => {
      pending.forEach((controller) => controller.abort());
      pending.clear();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const forget = useCallback((item: TrayItem) => {
    if (item.preview && objectUrls.current.delete(item.preview)) {
      URL.revokeObjectURL(item.preview);
    }
  }, []);

  const patch = useCallback((key: string, change: Partial<TrayItem>) => {
    setItems((current) => current.map((i) => (i.key === key ? { ...i, ...change } : i)));
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const room = MAX_ATTACHMENTS - itemsRef.current.length;
      const added: TrayItem[] = [];
      const uploads: { key: string; file: File }[] = [];
      for (const file of files.slice(0, Math.max(room, 0))) {
        const key = nextKey();
        const url = preview(file);
        if (url) objectUrls.current.add(url);
        const problem: AttachmentProblem | null = !IMAGE_TYPES.includes(file.type)
          ? 'type'
          : file.size === 0
            ? 'size'
            : null;
        added.push({ key, name: file.name, preview: url, mediaId: null, problem });
        if (!problem) uploads.push({ key, file });
      }
      if (added.length === 0) return;
      // Reserve the slots now so two quick drops cannot exceed the limit.
      itemsRef.current = [...itemsRef.current, ...added];
      setItems(itemsRef.current);
      for (const { key, file } of uploads) {
        const controller = new AbortController();
        controllers.current.set(key, controller);
        void uploadImage(
          file,
          { code: 'UPLOAD_FAILED', message: '', fields: {} },
          { signal: controller.signal, onProgress: (progress) => patch(key, { progress }) },
        ).then((result) => {
          controllers.current.delete(key);
          // Removed while uploading: the file is orphaned, which the API cleans up later.
          if (!itemsRef.current.some((i) => i.key === key)) return;
          if (result.ok) patch(key, { mediaId: result.data });
          else
            patch(key, {
              problem:
                result.error.code === 'FILE_TOO_LARGE'
                  ? 'size'
                  : result.error.code === 'UNSUPPORTED_TYPE'
                    ? 'type'
                    : 'upload',
              errorMessage: result.error.message,
            });
        });
      }
    },
    [patch],
  );

  const addCatalog = useCallback((images: CatalogImage[]) => {
    const have = new Set(itemsRef.current.map((i) => i.mediaId));
    const room = MAX_ATTACHMENTS - itemsRef.current.length;
    const added = images
      .filter((image) => !have.has(image.mediaId))
      .slice(0, Math.max(room, 0))
      .map<TrayItem>((image) => ({
        key: nextKey(),
        name: image.name,
        preview: image.url,
        mediaId: image.mediaId,
        problem: null,
      }));
    if (added.length === 0) return;
    itemsRef.current = [...itemsRef.current, ...added];
    setItems(itemsRef.current);
  }, []);

  const remove = useCallback(
    (key: string) => {
      controllers.current.get(key)?.abort();
      controllers.current.delete(key);
      const gone = itemsRef.current.find((i) => i.key === key);
      if (gone) forget(gone);
      itemsRef.current = itemsRef.current.filter((i) => i.key !== key);
      setItems(itemsRef.current);
    },
    [forget],
  );

  const clear = useCallback(() => {
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
    itemsRef.current.forEach(forget);
    itemsRef.current = [];
    setItems([]);
  }, [forget]);

  return {
    items,
    uploading: items.some((i) => !i.mediaId && !i.problem),
    hasProblem: items.some((i) => i.problem !== null),
    mediaIds: items.flatMap((i) => (i.mediaId && !i.problem ? [i.mediaId] : [])),
    full: items.length >= MAX_ATTACHMENTS,
    addFiles,
    addCatalog,
    remove,
    clear,
  };
}
