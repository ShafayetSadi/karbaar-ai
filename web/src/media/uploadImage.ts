import i18n from '../i18n';
import { prepareImage, UnsupportedPhoto } from './prepareImage';
import { api } from '../api/client';
import { call, type Outcome } from '../api/call';
import type { ApiError } from '../api/errors';

/**
 * Uploads an image the way the API expects: ask for a presigned URL, PUT the file straight to
 * storage, then complete the upload so the server verifies it. Resolves to the media id.
 * `fallback` is the error shown when the PUT itself fails (it never reaches our API).
 */
export interface UploadOptions {
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

export async function uploadImage(
  file: File,
  fallback: ApiError,
  options: UploadOptions = {},
): Promise<Outcome<string>> {
  try {
    const prepared = await prepareImage(file);
    if (options.signal?.aborted) return { ok: false, error: fallback };
    if (prepared.size > 5 * 1024 * 1024 || prepared.size === 0) {
      return { ok: false, error: { ...fallback, code: 'FILE_TOO_LARGE' } };
    }
    return uploadMedia(prepared, 'image', fallback, undefined, options);
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof UnsupportedPhoto
          ? {
              code: 'UNSUPPORTED_TYPE',
              message: i18n.t('editor.photoFormatUnsupported'),
              fields: {},
            }
          : fallback,
    };
  }
}

/**
 * Like `uploadImage`, for any kind the API takes (`audio` is a recorded voice note). A recorder's
 * type parameters (`audio/webm;codecs=opus`) are dropped: the API allows the bare type.
 */
export async function uploadMedia(
  file: Blob,
  kind: 'image' | 'audio',
  fallback: ApiError,
  purpose?: 'knowledge_source',
  options: UploadOptions = {},
): Promise<Outcome<string>> {
  const contentType = file.type.split(';')[0]?.trim() ?? '';
  const ticket = await call(() =>
    api.POST('/v1/media/uploads', {
      body: { content_type: contentType, size_bytes: file.size, kind, purpose },
    }),
  );
  if (!ticket.ok) return ticket;
  try {
    if (options.signal?.aborted) return { ok: false, error: fallback };
    const ok =
      options.onProgress || options.signal
        ? await putWithProgress(file, ticket.data.upload, options)
        : (
            await globalThis.fetch(ticket.data.upload.url, {
              method: ticket.data.upload.method,
              headers: ticket.data.upload.headers,
              body: file,
            })
          ).ok;
    if (!ok || options.signal?.aborted) return { ok: false, error: fallback };
  } catch {
    return { ok: false, error: fallback };
  }
  const mediaId = ticket.data.media.id;
  const done = await call(() =>
    api.POST('/v1/media/{media_id}/complete', { params: { path: { media_id: mediaId } } }),
  );
  return done.ok ? { ok: true, data: mediaId } : done;
}

/**
 * A PDF, Word file, text file or screenshot for the knowledge base to read. It is stored apart from
 * the photos the owner sends to customers and can never be sent to one.
 */
export async function uploadKnowledgeFile(
  file: File,
  fallback: ApiError,
): Promise<Outcome<string>> {
  return uploadMedia(file, 'image', fallback, 'knowledge_source');
}

async function putWithProgress(
  file: Blob,
  upload: { url: string; method: string; headers: Record<string, string> },
  options: UploadOptions,
): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = (ok: boolean) => {
      options.signal?.removeEventListener('abort', abort);
      resolve(ok);
    };
    xhr.open(upload.method, upload.url);
    Object.entries(upload.headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        options.onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = xhr.onabort = xhr.ontimeout = () => finish(false);
    xhr.timeout = 120_000;
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) {
      finish(false);
      return;
    }
    xhr.send(file);
  });
}

/** Results retain selection order; no more than three preparations/uploads run at once. */
export async function uploadImages(
  files: File[],
  fallback: ApiError,
  options: (index: number) => UploadOptions = () => ({}),
): Promise<Outcome<string>[]> {
  const results: Outcome<string>[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, files.length) }, async () => {
      while (next < files.length) {
        const index = next++;
        const opts = options(index);
        results[index] = opts.signal?.aborted
          ? { ok: false, error: fallback }
          : await uploadImage(files[index]!, fallback, opts);
      }
    }),
  );
  return results;
}
