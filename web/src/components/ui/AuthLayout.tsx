import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type Language } from '../../i18n';
import { BrandMark } from './BrandMark';
import { cx } from './cx';

export function Wordmark({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <p className={cx('flex items-center gap-2 text-lg font-semibold text-ink', className)}>
      <BrandMark />
      {t('app.name')}
    </p>
  );
}

/**
 * The signed-out pages (signup, login, password reset): a panel about Karbaar beside the form from
 * `lg`, and on phones only the wordmark and the language switch above it.
 */
export function AuthLayout({
  headline,
  sentence,
  aside,
  asideFooter,
  footer,
  children,
}: {
  headline: string;
  sentence: string;
  /** Extra panel content under the sentence, such as the signup steps. */
  aside?: ReactNode;
  /** A quiet line at the foot of the panel. */
  asideFooter?: ReactNode;
  /** The line under the form, such as the link between login and signup. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="hidden border-r border-line bg-chrome lg:block">
        <div className="sticky top-0 flex h-dvh flex-col px-10 py-10 xl:px-16">
          <Wordmark />
          <div className="my-auto max-w-md py-10">
            <p className="text-3xl font-semibold leading-tight text-ink [overflow-wrap:break-word] xl:text-4xl">
              {headline}
            </p>
            <p className="mt-4 text-base text-ink-muted">{sentence}</p>
            {aside}
          </div>
          {asideFooter && <p className="max-w-md text-sm text-ink-faint">{asideFooter}</p>}
        </div>
      </aside>
      <main className="flex min-h-dvh flex-col px-4 py-5 sm:px-8 lg:py-8">
        <div className="flex items-center justify-between gap-3">
          <Wordmark className="lg:invisible" />
          <div
            role="group"
            aria-label={t('signup.language')}
            className="flex rounded-md border border-line bg-panel p-0.5"
          >
            {LANGUAGES.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={i18n.language.startsWith(code)}
                onClick={() => void setLanguage(code as Language)}
                className={cx(
                  'rounded px-2.5 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-active active:opacity-70',
                  i18n.language.startsWith(code)
                    ? 'bg-ink/8 font-medium text-ink'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                {t(`language.${code}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col py-8 lg:justify-center lg:py-10">
          {children}
        </div>
        {footer && <p className="text-center text-sm text-ink-muted">{footer}</p>}
      </main>
    </div>
  );
}
