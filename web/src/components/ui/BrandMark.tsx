import { cx } from './cx';

/**
 * The Karbaar mark: a shop door hanging from a matra (the headline stroke of Bangla letters),
 * with a price tag. Concept from docs/product/brand.md, "Logo"; a designer redraw is pending.
 * In the sidebar and above the sign-in forms.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className={cx('size-8 shrink-0 text-mark', className)}>
      <path
        fillRule="evenodd"
        className="fill-current"
        d="M4.5 7h39A1.5 1.5 0 0 1 45 8.5V12a1.5 1.5 0 0 1-1.5 1.5H23a13 13 0 0 1 0 26H9v-26H4.5A1.5 1.5 0 0 1 3 12V8.5A1.5 1.5 0 0 1 4.5 7ZM16 39.5V29a4.5 4.5 0 0 1 9 0v10.5Z"
      />
      <path d="M41.5 13.5v8" className="stroke-thread" strokeWidth={2.6} strokeLinecap="round" />
      <path
        fillRule="evenodd"
        className="fill-thread"
        d="M37.5 25.5a4 4 0 1 0 8 0a4 4 0 1 0-8 0ZM40.2 25.5a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0Z"
      />
    </svg>
  );
}
