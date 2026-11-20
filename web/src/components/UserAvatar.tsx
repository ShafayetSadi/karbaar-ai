import { cx } from './ui';
import { useStableSrc } from './useStableSrc';
import { initials } from '../inbox/initials';

const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
};

/** A teammate's photo, or their initials when they have none or it cannot load. */
export function UserAvatar({
  name,
  photoUrl,
  size = 'md',
}: {
  name: string | null;
  photoUrl: string | null | undefined;
  size?: keyof typeof SIZES;
}) {
  const { src, onError } = useStableSrc(photoUrl);
  const box = cx(SIZES[size], 'shrink-0 rounded-full border border-line');
  if (src) {
    return (
      <img src={src} alt="" onError={onError} className={cx(box, 'bg-panel-muted object-cover')} />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cx(box, 'flex items-center justify-center bg-ink/10 font-semibold text-ink')}
    >
      {initials(name)}
    </span>
  );
}
