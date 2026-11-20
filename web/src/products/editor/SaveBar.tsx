import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionButton, Kbd } from '../../components/ui';
import { useEditorDrafts } from './drafts';

const MAX_NAMES = 3;

const onMac = () => /Mac|iPhone|iPad/.test(navigator.userAgent);

/**
 * The product editor's one Save: a sticky pill shown while any section has unsaved changes. It
 * names them, saves them all (also Ctrl/Cmd+S) or discards them, and names any that failed.
 */
export function SaveBar() {
  const { t } = useTranslation();
  const drafts = useEditorDrafts();
  const dirty = drafts?.dirty ?? [];
  const saving = drafts?.saving ?? false;
  const saveAll = drafts?.saveAll;

  useEffect(() => {
    if (dirty.length === 0 || !saveAll) return;
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
      // Never the browser's own "Save page" dialog while there is something to save.
      event.preventDefault();
      if (!saving) void saveAll?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty.length, saving, saveAll]);

  if (!drafts || dirty.length === 0) return null;
  const { failed, discardAll, reveal } = drafts;
  const names = dirty.map((shown) => shown.label);
  const sections =
    names.length > MAX_NAMES
      ? t('editor.andMore', { first: names[0], count: names.length - 1 })
      : names.join(', ');

  return (
    <div
      role="region"
      aria-label={t('editor.unsaved')}
      className="sticky bottom-4 z-20 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-xl border border-line bg-panel px-3 py-2 shadow-lg motion-safe:transition motion-safe:duration-150 motion-safe:starting:translate-y-4 motion-safe:starting:opacity-0"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        {failed.length > 0 && !saving ? (
          <p className="text-sm text-danger-ink">
            {t('editor.saveFailed', { count: failed.length })}{' '}
            {failed.map((shown, i) => (
              <span key={shown.id}>
                {i > 0 && ', '}
                <button
                  type="button"
                  onClick={() => reveal(shown.id)}
                  className="font-medium underline hover:no-underline focus-visible:outline-2 focus-visible:outline-active"
                >
                  {shown.label}
                </button>
              </span>
            ))}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">
            <span
              aria-hidden
              className="mr-2 inline-block size-2 rounded-full bg-warn-ink align-middle"
            />
            {t('editor.unsavedIn', { sections })}
          </p>
        )}
        <div className="flex items-center gap-2">
          <ActionButton
            tone="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              if (window.confirm(t('editor.discardConfirm'))) discardAll();
            }}
          >
            {t('editor.discard')}
          </ActionButton>
          <ActionButton
            tone="primary"
            size="sm"
            disabled={saving}
            aria-busy={saving || undefined}
            onClick={() => void drafts.saveAll()}
          >
            {saving ? t('editor.saving') : t('editor.saveAll')}
          </ActionButton>
          <span aria-hidden className="max-sm:hidden">
            <Kbd>{onMac() ? '⌘ S' : 'Ctrl S'}</Kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
