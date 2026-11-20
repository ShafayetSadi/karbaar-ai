import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Chip } from '../components/ui';

/** A card of the Shop info tab: a title, how much of it is set, and its fields. */
export function SectionCard({
  id,
  title,
  hint,
  set,
  total,
  highlighted,
  children,
  aside,
}: {
  id: string;
  title: string;
  hint?: string;
  set: number;
  total: number;
  highlighted?: boolean;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section
      id={`shop-info-${id}`}
      aria-labelledby={`shop-info-${id}-title`}
      className={
        highlighted
          ? 'scroll-mt-4 space-y-4 rounded-lg border border-active bg-panel p-4 sm:p-6'
          : 'scroll-mt-4 space-y-4 rounded-lg border border-line bg-panel p-4 sm:p-6'
      }
    >
      <div className={aside ? 'grid gap-6 lg:grid-cols-2' : undefined}>
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id={`shop-info-${id}-title`} className="text-lg font-semibold text-ink">
                {title}
              </h2>
              {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
            </div>
            <Chip tone={set === total ? 'ok' : 'neutral'} className="tabular-nums">
              {t('knowledge.setCount', { set, total })}
            </Chip>
          </div>
          {children}
        </div>
        {aside && (
          <div className="min-w-0 border-t border-line pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            {aside}
          </div>
        )}
      </div>
    </section>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs text-ink-faint">{children}</p>;
}

export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-1 text-sm text-danger-ink">
      {children}
    </p>
  );
}
