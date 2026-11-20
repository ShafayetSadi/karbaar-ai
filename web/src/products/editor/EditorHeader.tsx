import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';

export interface JumpSection {
  id: string;
  /** An i18n key. */
  label: string;
}

/**
 * Scrolls only the page's own scroll container. `scrollIntoView` also scrolls the overflow-hidden
 * app shell when the target is too near the end to reach the top, which slides the sidebar and top
 * bar out of view.
 */
function jumpTo(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const container = target.closest('main');
  if (!container) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  // The sticky header covers the top of the container; `scroll-mt-*` on the target keeps it clear.
  const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const top =
    target.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop -
    margin;
  container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

/**
 * The editor's sticky header, shared by the new and the existing product page: back, a
 * `Products / {title}` breadcrumb, the page's actions, and jump links so the sections below are
 * never out of sight. Back returns to the list with its filters when the product was opened
 * from it, and goes to the list otherwise.
 */
export function EditorHeader({
  title,
  status,
  actions,
  sections,
}: {
  /** The page's `h1`: the product name, or "Create". */
  title: string;
  status?: ReactNode;
  actions: ReactNode;
  sections: readonly JumpSection[];
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fromList = (useLocation().state as { fromList?: boolean } | null)?.fromList === true;
  return (
    <div className="sticky top-0 z-20 -mx-4 space-y-3 border-b border-line bg-paper/95 px-4 pt-3 pb-3 backdrop-blur md:-mx-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/products"
            aria-label={t('editor.back')}
            onClick={(e) => {
              if (!fromList) return;
              e.preventDefault();
              void navigate(-1);
            }}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-panel text-ink-muted transition-colors hover:bg-panel-muted hover:text-ink"
          >
            <ArrowLeft aria-hidden className="size-4" />
          </Link>
          <div className="flex min-w-0 items-baseline gap-2 text-xl">
            <Link to="/products" className="text-ink-muted hover:text-ink hover:underline">
              {t('products.title', { defaultValue: 'Products' })}
            </Link>
            <span className="text-ink-faint">/</span>
            <h1 className="truncate font-bold text-ink">{title}</h1>
          </div>
          {status}
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
      <nav aria-label={t('editor.sectionsNav')} className="-mb-1 flex gap-1 overflow-x-auto pb-1">
        {sections.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => jumpTo(id)}
            className="inline-flex shrink-0 items-center rounded-full border border-line bg-panel px-3 py-1 text-sm text-ink-muted transition-colors hover:bg-panel-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-active"
          >
            {t(label)}
          </button>
        ))}
      </nav>
    </div>
  );
}
