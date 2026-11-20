import { prepareInCanvas, UnsupportedPhoto } from './prepareImageCanvas';
export { IMAGE_TYPES, UnsupportedPhoto } from './prepareImageCanvas';

export async function prepareImage(file: File): Promise<Blob> {
  if (
    file.type !== 'image/gif' &&
    typeof Worker === 'function' &&
    typeof OffscreenCanvas === 'function'
  ) {
    try {
      return await new Promise<Blob>((resolve, reject) => {
        const worker = new Worker(new URL('./prepareImage.worker.ts', import.meta.url), {
          type: 'module',
        });
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error('preparation timed out'));
        }, 30_000);
        const finish = () => {
          clearTimeout(timeout);
          worker.terminate();
        };
        worker.onmessage = (event: MessageEvent<{ blob?: Blob; unsupported?: boolean }>) => {
          finish();
          if (event.data.unsupported) reject(new UnsupportedPhoto());
          else if (event.data.blob) resolve(event.data.blob);
          else reject(new Error('preparation failed'));
        };
        worker.onerror = () => {
          finish();
          reject(new Error('worker unavailable'));
        };
        worker.postMessage(file);
      });
    } catch {
      // Try the main-thread decoder before rejecting a photo or falling back to its original.
    }
  }
  return prepareInCanvas(file);
}
