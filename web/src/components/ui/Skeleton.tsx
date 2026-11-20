import { cx } from './cx';

/** A grey placeholder block shown while content loads; size it with `className`. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('block rounded bg-panel-muted motion-safe:animate-pulse', className)}
    />
  );
}
