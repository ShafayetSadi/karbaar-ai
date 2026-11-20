import { type ImageSources, MediaImage } from '../../components/MediaImage';
import { useContext, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Plus, X } from 'lucide-react';
import { ActionButton, cx } from '../../components/ui';
import { useStableSrc } from '../../components/useStableSrc';
import { ProductImageRefreshContext } from './ExistingProduct';

export interface GalleryItem {
  image?: ImageSources;
  key: string;
  src: string | null;
  alt: string;
}

function GalleryTile({ item }: { item: GalleryItem }) {
  const onRefresh = useContext(ProductImageRefreshContext);
  const { src, onError } = useStableSrc(item.src);
  const { t } = useTranslation();

  if (!src) {
    return (
      <span className="flex size-full items-center justify-center bg-panel-muted text-xs text-ink-faint">
        {t('products.noImage')}
      </span>
    );
  }

  return (
    <MediaImage
      image={item.image}
      src={src}
      alt={item.alt}
      loading="lazy"
      decoding="async"
      className="size-full object-cover"
      onError={() => {
        onError();
        onRefresh?.();
      }}
    />
  );
}

/**
 * The product gallery on both product pages: an empty drop target, or tiles with the cover
 * marked, a remove button on hover and a dashed tile to add more. Adding opens the gallery
 * picker (`onPick`); files dropped on the grid go to `onDrop`.
 */
export function GalleryGrid({
  items,
  busy,
  uploading,
  onPick,
  onFiles,
  onRemove,
}: {
  items: GalleryItem[];
  busy?: boolean;
  uploading?: boolean;
  onPick: () => void;
  /** Files dropped on the grid or chosen with the (hidden) file input. */
  onFiles: (files: File[]) => void;
  onRemove: (key: string) => void;
}) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!uploading) onFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={cx('rounded-xl', dragging && 'bg-active/5 outline-2 outline-active')}
    >
      {items.length === 0 ? (
        <button
          type="button"
          onClick={onPick}
          disabled={uploading}
          className="group flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-panel-muted/10 p-8 text-center transition-colors hover:border-active/60 hover:bg-panel-muted/30"
        >
          <span className="mb-2 flex size-12 items-center justify-center rounded-xl border border-line bg-panel text-active transition-transform group-hover:scale-105">
            <LayoutGrid aria-hidden className="size-6" />
          </span>
          <span className="text-sm font-medium text-ink">
            {uploading ? t('editor.uploading') : t('editor.pickFromGallery')}
          </span>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {items.map((item, index) => (
              <div
                key={item.key}
                className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-panel shadow-xs"
              >
                <GalleryTile item={item} />
                {index === 0 && (
                  <span className="absolute bottom-1 left-1 rounded bg-accent/90 px-1.5 py-0.5 text-[10px] font-semibold text-accent-ink shadow-xs">
                    {t('editor.cover')}
                  </span>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(item.key)}
                  aria-label={t('editor.removeImage')}
                  className="absolute top-1 right-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-ink/75 text-paper opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger-ink focus-visible:opacity-100"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={onPick}
              disabled={uploading}
              className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-line bg-panel-muted/10 text-ink-muted transition-colors hover:border-active/60 hover:bg-panel-muted/30"
            >
              <Plus aria-hidden className="size-5" />
              <span className="mt-1 text-xs font-medium">
                {uploading ? t('editor.uploading') : t('editor.addMore')}
              </span>
            </button>
          </div>
          <div className="flex justify-end">
            <ActionButton size="sm" disabled={uploading} onClick={onPick}>
              {t('editor.pickFromGallery')}
            </ActionButton>
          </div>
        </div>
      )}
      <label className="sr-only">
        {t('editor.addImage')}
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
          disabled={busy || uploading}
          aria-label={t('editor.addImage')}
          className="sr-only"
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}
