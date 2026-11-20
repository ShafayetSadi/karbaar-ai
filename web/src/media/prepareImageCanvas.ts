/** Browser-only preparation. The API still verifies the resulting bytes and enforces its limit. */
export const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
];
const MAX_EDGE = 2560;
const THRESHOLD = 1.5 * 1024 * 1024;

export class UnsupportedPhoto extends Error {}

export async function prepareInCanvas(file: File): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  const heic = /image\/hei[cf]/.test(file.type);
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (!heic && file.size <= THRESHOLD && Math.max(bitmap.width, bitmap.height) <= MAX_EDGE)
      return file;
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas =
      typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement('canvas'), { width, height });
    const context = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!context) throw new Error('canvas unavailable');
    context.drawImage(bitmap, 0, 0, width, height);
    // JPEG/HEIC are opaque. Check the output alpha for formats that can carry transparency.
    let alpha = false;
    if (!heic && file.type !== 'image/jpeg') {
      const pixels = context.getImageData(0, 0, width, height).data;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] !== 255) {
          alpha = true;
          break;
        }
      }
    }
    const type = alpha ? 'image/webp' : 'image/jpeg';
    const result =
      typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement
        ? await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
              type,
              0.85,
            ),
          )
        : await (canvas as OffscreenCanvas).convertToBlob({ type, quality: 0.85 });
    if (!['image/jpeg', 'image/webp'].includes(result.type))
      throw new Error('unsupported encoding');
    return heic || result.size < file.size ? result : file;
  } catch {
    if (heic) throw new UnsupportedPhoto();
    return file;
  } finally {
    bitmap?.close();
  }
}
