import { MediaImage } from '../components/MediaImage';
import { Globe, MessageCircle } from 'lucide-react';
import { cx } from '../components/ui';
import { useStableSrc } from '../components/useStableSrc';
import { initials } from './initials';

const SIZES = {
  xs: 'size-6 text-[0.6rem]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
};

/**
 * The customer's Messenger photo, or their initials when there is none or it cannot load. With
 * `channel`, a small badge for where they write sits at the bottom-left: Messenger (`true` or
 * `'messenger'`) or the website chat (`'web'`).
 */
export function CustomerAvatar({
  name,
  photoUrl,
  size = 'md',
  channel = false,
}: {
  name: string | null;
  photoUrl: string | null;
  size?: keyof typeof SIZES;
  channel?: boolean | 'messenger' | 'web';
}) {
  const { src, onError } = useStableSrc(photoUrl);
  const box = cx(SIZES[size], 'shrink-0 rounded-full border border-line');

  const face = src ? (
    <MediaImage
      src={src}
      alt=""
      onError={onError}
      className={cx(box, 'bg-panel-muted object-cover')}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cx(
        box,
        'flex items-center justify-center bg-panel-muted font-medium text-ink-muted',
      )}
    >
      {initials(name)}
    </span>
  );

  if (!channel) return face;
  return (
    <span className="relative shrink-0">
      {face}
      <span
        aria-hidden="true"
        className={cx(
          'absolute -bottom-0.5 -left-0.5 flex size-4 items-center justify-center rounded-full ring-2 ring-panel',
          channel === 'web' ? 'bg-ink text-panel' : 'bg-messenger text-messenger-ink',
        )}
      >
        {channel === 'web' ? (
          <Globe className="size-2.5" />
        ) : (
          <MessageCircle className="size-2.5" />
        )}
      </span>
    </span>
  );
}
