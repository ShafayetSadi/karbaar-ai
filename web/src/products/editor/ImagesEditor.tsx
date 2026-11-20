import { MediaImage } from '../../components/MediaImage';
import { useUrlPanel } from '../../navigation/useUrlPanel';
import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { call } from '../../api/call';
import type { ApiError } from '../../api/errors';
import { useImageUploads } from '../../media/useImageUploads';
import { UploadProgress } from '../../media/UploadProgress';
import { ActionButton, FormError, actionButtonClass, cx } from '../../components/ui';
import { useStableSrc } from '../../components/useStableSrc';
import { GalleryModal } from '../GalleryModal';
import type { Product } from '../ProductsPage';
import { ProductImageRefreshContext } from './ExistingProduct';
import { GalleryGrid } from './GalleryGrid';
import { Panel, type OnChange, useMutation } from './shared';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

/** Uploads and removals of a saved product's images; each lands at once, not with the Save bar. */
function useImages(product: Product, onChange: OnChange) {
  const { t } = useTranslation();
  const { run, error, busy } = useMutation(onChange);
  const uploads = useImageUploads();
  const uploading = uploads.busy;
  const [uploadError, setUploadError] = useState<ApiError | null>(null);

  /** Uploads three files at a time and attaches successful files in selection order. */
  async function upload(files: File[], role: 'gallery' | 'size_chart') {
    const accepted = files.filter((file) => ACCEPTED.includes(file.type));
    const queue = role === 'size_chart' ? accepted.slice(0, 1) : accepted;
    setUploadError(null);
    let failure = await uploads.upload(
      queue,
      {
        code: 'UPLOAD_FAILED',
        message: t('editor.uploadFailed'),
        fields: {},
      },
      async (mediaId) => {
        const attached = await run(() =>
          call(() =>
            api.POST('/v1/products/{product_id}/images', {
              params: { path: { product_id: product.id } },
              body: { media_id: mediaId, role },
            }),
          ),
        );
        return Boolean(attached);
      },
    );
    if (!failure && accepted.length < files.length) {
      failure = { code: 'UNSUPPORTED_TYPE', message: t('editor.imageTypeRejected'), fields: {} };
    }
    setUploadError(failure);
  }

  const remove = (imageId: string) =>
    void run(() =>
      call(() =>
        api.DELETE('/v1/products/{product_id}/images/{image_id}', {
          params: { path: { product_id: product.id, image_id: imageId } },
        }),
      ),
    );

  return { upload, remove, busy, uploading, uploads, error: uploadError ?? error };
}

/** The product's photos as on the new product page: tiles, the cover marked, a picker to add. */
export function GalleryPanel({ product, onChange }: { product: Product; onChange: OnChange }) {
  const { t } = useTranslation();
  const { upload, remove, busy, uploading, uploads, error } = useImages(product, onChange);
  const [picking, setPicking] = useUrlPanel('gallery');
  const images = product.images.filter((image) => image.role === 'gallery');

  return (
    <Panel title={t('editor.productGallery')} hint={t('editor.imageHint')}>
      <FormError error={error} />
      <UploadProgress items={uploads.pending} onCancel={uploads.cancel} />
      <GalleryGrid
        items={images.map((image) => ({
          key: image.id,
          image,
          src: image.thumbnail_url ?? image.url ?? null,
          alt: t('editor.images'),
        }))}
        busy={busy}
        uploading={uploading}
        onPick={() => setPicking(true)}
        onFiles={(files) => void upload(files, 'gallery')}
        onRemove={remove}
      />
      {picking && (
        <GalleryModal
          open
          onClose={() => setPicking(false)}
          files={[]}
          onFilesChange={(files) => void upload(files, 'gallery')}
        />
      )}
    </Panel>
  );
}

function SizeChartPreview({ src, alt }: { src: string | null; alt: string }) {
  const onRefresh = useContext(ProductImageRefreshContext);
  const { src: stableSrc, onError } = useStableSrc(src);

  if (!stableSrc) return null;

  return (
    <MediaImage
      src={stableSrc}
      alt={alt}
      width={112}
      height={112}
      loading="lazy"
      decoding="async"
      className="size-28 rounded-lg border border-line object-cover"
      onError={() => {
        onError();
        onRefresh?.();
      }}
    />
  );
}

/** The size chart's picture (one): shown and replaced inside the size chart row. */
export function SizeChartImage({ product, onChange }: { product: Product; onChange: OnChange }) {
  const { t } = useTranslation();
  const { upload, remove, busy, uploading, uploads, error } = useImages(product, onChange);
  const image = product.images.find((i) => i.role === 'size_chart');

  return (
    <div className="space-y-3">
      <FormError error={error} />
      <UploadProgress items={uploads.pending} onCancel={uploads.cancel} />
      {image && (
        <div className="flex items-center gap-3">
          {image.url && (
            <SizeChartPreview src={image.thumbnail_url ?? image.url} alt={t('editor.sizeChart')} />
          )}
          <ActionButton tone="danger" disabled={busy} onClick={() => remove(image.id)}>
            {t('editor.removeImage')}
          </ActionButton>
        </div>
      )}
      {!image && (
        <label
          className={cx(
            actionButtonClass(),
            'cursor-pointer self-start focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-active',
          )}
        >
          {uploading ? t('editor.uploading') : t('editor.addSizeChart')}
          <input
            type="file"
            accept={ACCEPTED.join(',')}
            disabled={uploading}
            className="sr-only"
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []), 'size_chart');
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
}
