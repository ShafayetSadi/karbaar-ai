import { TriangleAlert } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../components/ui';
import { LeaveGuard } from '../../navigation/LeaveGuard';
import type { Product } from '../ProductsPage';

/** Drafts are plain data built from the product, so comparing their JSON is enough. */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type DraftState<T> = { draft: T; seen: T; stale: boolean };

/**
 * One editor section's unsaved draft, kept across saves elsewhere on the page. `of` builds the
 * draft from a product. When the product changes, a clean draft takes the new values; a dirty
 * one is kept, and marked `stale` if the saved values under it changed.
 */
export function useDraft<T>(product: Product, of: (product: Product) => T) {
  const saved = of(product);
  const [state, setState] = useState<DraftState<T>>(() => ({
    draft: saved,
    seen: saved,
    stale: false,
  }));

  // Adjusted during render rather than in an effect (the same pattern as `SearchBox`).
  if (!same(saved, state.seen)) {
    const keep = !same(state.draft, state.seen) && !same(state.draft, saved);
    setState({ draft: keep ? state.draft : saved, seen: saved, stale: keep });
  }

  return {
    draft: state.draft,
    dirty: !same(state.draft, state.seen),
    stale: state.stale,
    setDraft: (draft: T) => setState((s) => ({ ...s, draft })),
    /** Back to the saved values. */
    reset: () => setState((s) => ({ draft: s.seen, seen: s.seen, stale: false })),
    /**
     * After this section's own calls: the server's answer is what was saved. `adopt` makes it
     * the draft too; without it (a call failed part-way) the draft is kept to try again.
     */
    settle: (next: Product, adopt = true) =>
      setState((s) => {
        const value = of(next);
        return { draft: adopt ? value : s.draft, seen: value, stale: false };
      }),
  };
}

/** Under a section whose saved values changed while its draft was being edited. */
export function StaleNote({ stale }: { stale: boolean }) {
  const { t } = useTranslation();
  if (!stale) return null;
  return (
    <p className="flex items-center gap-1.5 text-sm text-warn-ink">
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      {t('editor.changedElsewhere')}
    </p>
  );
}

/** Where each section saves in the one Save: the order the page reads, main column first. */
export const DRAFT_ORDER = {
  details: 100,
  aliases: 150,
  variant: 200,
  facts: 300,
  sizeChart: 400,
  organise: 500,
  availability: 600,
  delivery: 700,
  wholesale: 800,
} as const;

export type DraftSection = {
  /** 'details', 'facts', 'organise', …, or `variant:${id}`; the section's element has `data-draft`. */
  id: string;
  /** Shown in the save bar: "Details", "Variant Size: M". */
  label: string;
  order: number;
  dirty: boolean;
  /** Client-side checks only: shows the section's field errors. No request. */
  validate: () => boolean;
  /** The section's own calls, in their own order. True when all of them landed. */
  save: () => Promise<boolean>;
  /** Back to the saved product. */
  reset: () => void;
};

type Shown = { id: string; label: string; order: number };

type Drafts = {
  register: (id: string, section: { current: DraftSection }) => void;
  unregister: (id: string) => void;
  report: (id: string, shown: Shown | null) => void;
  /** Sections with unsaved changes, in save order. */
  dirty: Shown[];
  /** Sections whose last save failed, in save order. */
  failed: Shown[];
  saving: boolean;
  saveAll: () => Promise<void>;
  discardAll: () => void;
  /** Scroll to a section and focus its first invalid (or first) field. */
  reveal: (id: string) => void;
  allowLeave: () => void;
};

const DraftsContext = createContext<Drafts | null>(null);

const byOrder = (a: Shown, b: Shown) => a.order - b.order;

/** The product editor's unsaved sections and its one Save. Wraps the existing product page. */
export function EditorDraftsProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const toast = useToast();
  const sections = useRef(new Map<string, { current: DraftSection }>());
  const [dirtyById, setDirtyById] = useState<Record<string, Shown>>({});
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [revealing, setRevealing] = useState<string | null>(null);

  const report = useCallback((id: string, shown: Shown | null) => {
    setDirtyById((current) => {
      if (shown) return same(current[id], shown) ? current : { ...current, [id]: shown };
      if (!(id in current)) return current;
      const rest = { ...current };
      delete rest[id];
      return rest;
    });
    // A section that is clean again has nothing left to fail.
    if (!shown) setFailedIds((current) => current.filter((f) => f !== id));
  }, []);
  const register = useCallback((id: string, section: { current: DraftSection }) => {
    sections.current.set(id, section);
  }, []);
  const unregister = useCallback(
    (id: string) => {
      sections.current.delete(id);
      report(id, null);
    },
    [report],
  );

  const dirty = useMemo(() => Object.values(dirtyById).sort(byOrder), [dirtyById]);
  const bypass = useRef(false);

  // Runs after the render that shows the section's errors, so there is an invalid field to focus.
  useEffect(() => {
    if (!revealing) return;
    const element = document.querySelector<HTMLElement>(`[data-draft="${revealing}"]`);
    // The size chart folds into a native <details>, which keeps its fields mounted while closed.
    const folded = element?.closest('details');
    if (folded) folded.open = true;
    element?.scrollIntoView?.({ block: 'center' });
    const field =
      element?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      element?.querySelector<HTMLElement>('input:not([disabled]), select, textarea');
    field?.focus({ preventScroll: true });
    const timer = setTimeout(() => setRevealing(null));
    return () => clearTimeout(timer);
  }, [revealing]);

  const saveAll = useCallback(async () => {
    const handlers = dirty
      .map((shown) => sections.current.get(shown.id)?.current)
      .filter((section): section is DraftSection => section !== undefined);
    if (handlers.length === 0 || saving) return;
    // Check every section first (each shows its own errors), and save nothing if any is wrong.
    const invalid = handlers.map((section) => section.validate() || section.id);
    const firstInvalid = invalid.find((result) => result !== true);
    if (typeof firstInvalid === 'string') {
      setRevealing(firstInvalid);
      return;
    }
    // One after another: the calls each return the product, so running them together would race.
    setSaving(true);
    const failed: string[] = [];
    for (const section of handlers) {
      if (!(await section.save())) failed.push(section.id);
    }
    setSaving(false);
    setFailedIds(failed);
    if (failed.length === 0) toast({ message: t('editor.saved'), tone: 'ok' });
  }, [dirty, saving, t, toast]);

  const discardAll = useCallback(() => {
    for (const shown of dirty) sections.current.get(shown.id)?.current.reset();
    setFailedIds([]);
  }, [dirty]);

  const value = useMemo<Drafts>(
    () => ({
      register,
      unregister,
      report,
      dirty,
      failed: failedIds
        .map((id) => dirtyById[id])
        .filter((shown): shown is Shown => shown !== undefined)
        .sort(byOrder),
      saving,
      saveAll,
      discardAll,
      reveal: setRevealing,
      allowLeave: () => {
        bypass.current = true;
      },
    }),
    [register, unregister, report, dirty, failedIds, dirtyById, saving, saveAll, discardAll],
  );
  return (
    <DraftsContext.Provider value={value}>
      <LeaveGuard
        ignoreParams={['menu', 'gallery']}
        dirty={dirty.length > 0}
        bypass={bypass}
        message={t('editor.leaveUnsaved')}
      />
      {children}
    </DraftsContext.Provider>
  );
}

export function useEditorDrafts() {
  return useContext(DraftsContext);
}

/** Puts a section in the editor's one Save. Outside `EditorDraftsProvider` it does nothing. */
export function useDraftSection(section: DraftSection) {
  const drafts = useContext(DraftsContext);
  const latest = useRef(section);
  useLayoutEffect(() => {
    latest.current = section;
  });
  const { id, label, order, dirty } = section;
  const register = drafts?.register;
  const unregister = drafts?.unregister;
  const report = drafts?.report;
  useEffect(() => {
    register?.(id, latest);
    return () => unregister?.(id);
  }, [register, unregister, id]);
  useEffect(() => {
    report?.(id, dirty ? { id, label, order } : null);
  }, [report, id, label, order, dirty]);
}

/** Whether a section (or, for 'variant', any variant row) has unsaved changes or failed to save. */
export function useDraftStatus(id: string) {
  const drafts = useContext(DraftsContext);
  const matches = (shown: Shown) => shown.id === id || shown.id.startsWith(`${id}:`);
  return {
    dirty: drafts?.dirty.some(matches) ?? false,
    failed: drafts?.failed.some(matches) ?? false,
  };
}

/** Like `useDraftStatus`, for a row that holds several sections. */
export function useAnyDraftStatus(ids: readonly string[]) {
  const drafts = useContext(DraftsContext);
  const matches = (shown: Shown) =>
    ids.some((id) => shown.id === id || shown.id.startsWith(`${id}:`));
  return {
    dirty: drafts?.dirty.some(matches) ?? false,
    failed: drafts?.failed.some(matches) ?? false,
  };
}

/** A small warn dot beside a section title while it has unsaved changes. */
export function UnsavedDot({ show }: { show: boolean }) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <span className="ml-2 inline-flex items-center align-middle">
      <span aria-hidden className="size-2 rounded-full bg-warn-ink" />
      <span className="sr-only">{t('editor.unsaved')}</span>
    </span>
  );
}
