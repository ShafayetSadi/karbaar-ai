import { MediaImage } from '../components/MediaImage';
import { LeaveGuard } from '../navigation/LeaveGuard';
import { useModalFocus } from '../navigation/useModalFocus';
import { useFilePreviews } from './useFilePreviews';
import {
  HardDrive,
  HelpCircle,
  Image as ImageIcon,
  Maximize2,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionButton, Tooltip, cx } from '../components/ui';

interface GalleryModalProps {
  open: boolean;
  onClose: () => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
}

export function GalleryModal({ open, onClose, files, onFilesChange }: GalleryModalProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [staged, setStaged] = useState<File[]>(files);
  const previewOf = useFilePreviews(staged);

  const bypass = useRef(false);
  const ref = useModalFocus(open, onClose);
  const dirty =
    staged.length !== files.length || staged.some((file, index) => file !== files[index]);

  if (!open) return null;

  function addFiles(newFiles: FileList | File[]) {
    const acceptedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      'image/heif',
    ];
    const valid = Array.from(newFiles).filter((f) => acceptedTypes.includes(f.type));
    setStaged((prev) => [...prev, ...valid]);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  }

  function handleSave() {
    bypass.current = true;
    onFilesChange(staged);
    onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="gallery-modal-title"
      className="fixed inset-0 z-50 m-0 h-dvh max-h-none w-screen max-w-none items-center justify-center border-0 bg-ink/50 p-4 text-ink backdrop-blur-xs open:flex"
    >
      <LeaveGuard dirty={dirty} bypass={bypass} message={t('navigation.leaveUnsaved')} />
      <div className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-xl border border-line bg-panel shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 id="gallery-modal-title" className="text-lg font-semibold text-ink">
            {t('editor.pickFromGallery', { defaultValue: 'Pick from Gallery' })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-ink-muted hover:bg-panel-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-active"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cx(
              'group cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors',
              dragOver
                ? 'border-active bg-active/5'
                : 'border-line hover:border-active/60 hover:bg-panel-muted/20',
            )}
          >
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-accent/10 text-active transition-transform group-hover:scale-105">
              <UploadCloud aria-hidden className="size-6" />
            </div>
            <p className="font-medium text-ink">
              {t('editor.dropImagesPrompt', {
                defaultValue: 'Drop images here or click to select',
              })}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-xs text-ink-muted shadow-xs">
                <ImageIcon aria-hidden className="size-3.5 text-ink-faint" />
                {t('editor.imageFormatBadge', { defaultValue: 'JPG, JPEG, PNG, WEBP only' })}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-xs text-ink-muted shadow-xs">
                <HardDrive aria-hidden className="size-3.5 text-ink-faint" />
                {t('editor.imageSizeBadge', { defaultValue: 'Max 5 MB per file' })}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-xs text-ink-muted shadow-xs">
                <Maximize2 aria-hidden className="size-3.5 text-ink-faint" />
                {t('editor.imageResolutionBadge', { defaultValue: '1200 × 1200 px for products' })}
              </span>
            </div>

            <div className="mt-3">
              <Tooltip
                side="top"
                content={t('editor.imageGuidelinesHint', {
                  defaultValue:
                    'High-resolution square images (at least 800×800 px, recommended 1200×1200 px) look best on Facebook and Messenger.',
                })}
              >
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-active hover:underline"
                >
                  <HelpCircle aria-hidden className="size-3.5" />
                  {t('editor.imageGuidelines', { defaultValue: 'Image guidelines' })}
                </button>
              </Tooltip>
            </div>

            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {/* Staged Previews */}
          {staged.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-ink-muted">
                Selected Images ({staged.length})
              </p>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-line p-2">
                {staged.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between gap-3 rounded-md bg-panel-muted/30 p-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <MediaImage
                        src={previewOf(file)}
                        alt={file.name}
                        className="size-10 rounded object-cover border border-line"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{file.name}</p>
                        <p className="text-xs text-ink-muted">
                          {(file.size / 1024).toFixed(0)} KB
                          {idx === 0 && (
                            <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.2 text-[10px] font-semibold text-accent-strong">
                              Cover
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStaged(staged.filter((_, i) => i !== idx))}
                      className="rounded p-1 text-danger-ink hover:bg-danger/20"
                      title="Remove"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-line bg-panel-muted/20 px-6 py-4">
          <ActionButton onClick={onClose}>
            {t('editor.cancel', { defaultValue: 'Cancel' })}
          </ActionButton>
          <ActionButton tone="primary" onClick={handleSave}>
            {t('editor.linkImages', { defaultValue: 'Link' })}
          </ActionButton>
        </div>
      </div>
    </dialog>
  );
}
