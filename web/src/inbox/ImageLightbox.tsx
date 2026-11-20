import { MediaImage } from '../components/MediaImage';
import { api } from '../api/client';
import { X } from 'lucide-react';
import { useModalFocus } from '../navigation/useModalFocus';
import { useTranslation } from 'react-i18next';

/** The image at full size over the page. Esc, the close button or a click outside closes it. */
export function ImageLightbox({
  src,
  mediaId,
  originalUrl,
  alt,
  onClose,
}: {
  src: string;
  mediaId?: string | null;
  originalUrl?: string | null;
  alt: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useModalFocus(true, onClose);

  return (
    <dialog
      ref={ref}
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-50 m-0 h-dvh max-h-none w-screen max-w-none items-center justify-center border-0 bg-ink/80 p-4 open:flex"
    >
      <button
        type="button"
        aria-label={t('inbox.closeImage')}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 rounded-full bg-panel p-2 text-ink hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-active"
      >
        <X aria-hidden className="size-5" />
      </button>
      {(mediaId || originalUrl) && (
        <button
          type="button"
          className="absolute bottom-4 rounded bg-panel px-3 py-2 text-ink"
          onClick={async (event) => {
            event.stopPropagation();
            const tab = window.open('', '_blank');
            if (tab) tab.opener = null;
            const fresh = mediaId
              ? await api
                  .GET('/v1/media/{media_id}', { params: { path: { media_id: mediaId } } })
                  .catch(() => null)
              : null;
            const url = fresh?.data?.url ?? originalUrl;
            if (tab && url) {
              tab.location.href = url;
            } else tab?.close();
          }}
        >
          {t('inbox.openOriginal')}
        </button>
      )}
      <MediaImage
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain"
      />
    </dialog>
  );
}
