import { useTranslation } from 'react-i18next';
import type { PendingImage } from './useImageUploads';

export function UploadProgress({
  items,
  onCancel,
}: {
  items: PendingImage[];
  onCancel: (key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2" aria-live="polite">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-2 text-sm text-ink">
          <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
          <progress max={100} value={item.progress} aria-label={item.file.name} className="w-24" />
          <button type="button" className="text-active" onClick={() => onCancel(item.key)}>
            {t('editor.cancel')}
          </button>
        </div>
      ))}
    </div>
  );
}
