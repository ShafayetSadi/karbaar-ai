import { MediaImage } from '../components/MediaImage';
import { Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../components/ui';
import type { Attachments } from './useAttachments';

/** The images chosen for the next reply, above the text box: preview, progress, remove, errors. */
export function AttachmentTray({ attachments }: { attachments: Attachments }) {
  const { t } = useTranslation();
  if (attachments.items.length === 0) return null;
  return (
    <ul aria-label={t('inbox.composer.tray')} className="mb-2 flex flex-wrap gap-2">
      {attachments.items.map((item) => {
        const waiting = !item.mediaId && !item.problem;
        return (
          <li key={item.key} className="w-20">
            <div
              className={cx(
                'relative size-20 overflow-hidden rounded-lg border bg-panel-muted',
                item.problem ? 'border-danger-ink' : 'border-line',
              )}
            >
              {item.preview && (
                <MediaImage
                  src={item.preview}
                  alt={item.name}
                  className={cx(
                    'size-full object-cover',
                    (waiting || item.problem) && 'opacity-50',
                  )}
                />
              )}
              {waiting && (
                <span
                  role="status"
                  aria-label={t('inbox.composer.uploading', { name: item.name })}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <Loader2 aria-hidden className="size-5 animate-spin text-ink-muted" />
                  {item.progress !== undefined && (
                    <progress
                      max={100}
                      value={item.progress}
                      aria-label={item.name}
                      className="absolute bottom-1 w-16"
                    />
                  )}
                </span>
              )}
              <button
                type="button"
                aria-label={t('inbox.composer.remove', { name: item.name })}
                onClick={() => attachments.remove(item.key)}
                className="absolute top-0.5 right-0.5 rounded-full bg-ink/70 p-0.5 text-paper hover:bg-ink focus-visible:outline-2 focus-visible:outline-active"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </div>
            {item.problem && (
              <p role="alert" className="mt-1 text-xs text-danger-ink">
                {item.errorMessage || t(`inbox.composer.problem.${item.problem}`)}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
