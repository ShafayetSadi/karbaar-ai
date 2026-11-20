import type { ImgHTMLAttributes } from 'react';
import { useStableSrc } from './useStableSrc';

export interface ImageSources {
  url?: string | null;
  thumbnail_url?: string | null;
  medium_url?: string | null;
  large_url?: string | null;
  width?: number | null;
  height?: number | null;
  placeholder_color?: string | null;
}

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null;
  image?: ImageSources;
  size?: 'thumb' | 'medium' | 'large';
};

/** Stable signed URLs, intrinsic dimensions and a placeholder for stored media. */
export function MediaImage({ image, src, size = 'thumb', sizes, style, onError, ...props }: Props) {
  const small = useStableSrc(image?.thumbnail_url);
  const medium = useStableSrc(image?.medium_url);
  const large = useStableSrc(image?.large_url);
  const original = useStableSrc(src ?? image?.url);
  const selected = size === 'large' ? large : size === 'medium' ? medium : small;
  const requested =
    size === 'large'
      ? image?.large_url
      : size === 'medium'
        ? image?.medium_url
        : image?.thumbnail_url;
  const shown = requested ? selected : original;
  const candidates =
    size === 'thumb'
      ? [
          [small.src, 320],
          [medium.src, 800],
        ]
      : [
          [medium.src, 800],
          [large.src, 1600],
        ];
  const srcSet = sizes
    ? candidates
        .filter(([url]) => url)
        .map(([url, width]) => `${url} ${width}w`)
        .join(', ')
    : undefined;
  return (
    <img
      loading="lazy"
      decoding="async"
      width={image?.width ?? undefined}
      height={image?.height ?? undefined}
      {...props}
      src={shown.src ?? undefined}
      srcSet={srcSet || undefined}
      sizes={sizes}
      style={{ backgroundColor: image?.placeholder_color ?? undefined, ...style }}
      onError={(event) => {
        selected.onError();
        if (!requested) original.onError();
        if (sizes) {
          small.onError();
          medium.onError();
          large.onError();
        }
        onError?.(event);
      }}
    />
  );
}
