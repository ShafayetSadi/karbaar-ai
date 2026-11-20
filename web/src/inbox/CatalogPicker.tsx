import { ArrowLeft, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MediaImage } from '../components/MediaImage';
import { Skeleton, ActionButton, cx, fieldClass } from '../components/ui';
import type { CatalogImage } from './useAttachments';
import { useProductSearch } from './useProductSearch';

/**
 * Pick product photos (and size charts) from the catalog to send. They already have media ids, so
 * nothing is uploaded again. Several can be chosen; `onPick` gets them in the order selected, and
 * each chosen photo shows its place in that order.
 */
export function CatalogPicker({
  room,
  onPick,
  onBack,
}: {
  /** How many more images the reply can take. */
  room: number;
  onPick: (images: CatalogImage[]) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { products, failed } = useProductSearch(query, 'all');
  const [chosen, setChosen] = useState<CatalogImage[]>([]);
  const full = chosen.length >= room;

  function toggle(image: CatalogImage) {
    setChosen((now) =>
      now.some((c) => c.mediaId === image.mediaId)
        ? now.filter((c) => c.mediaId !== image.mediaId)
        : now.length < room
          ? [...now, image]
          : now,
    );
  }

  const withImages = (products ?? []).filter((p) => p.images.some((i) => i.thumbnail_url || i.url));

  return (
    <div className="-m-1 space-y-3 p-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('inbox.composer.catalog.back')}
          title={t('inbox.composer.catalog.back')}
          className="-ml-1 flex size-7 flex-none items-center justify-center rounded-md text-ink-muted hover:bg-panel-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-active"
        >
          <ArrowLeft aria-hidden className="size-4" />
        </button>
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {t('inbox.composer.catalog.title')}
        </h3>
        {chosen.length > 0 && (
          <button
            type="button"
            onClick={() => setChosen([])}
            className="flex-none text-xs text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-active"
          >
            {t('inbox.composer.catalog.clear')}
          </button>
        )}
      </div>

      <div className="relative">
        <Search aria-hidden className="absolute top-2.5 left-2.5 size-4 text-ink-faint" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('inbox.composer.catalog.search')}
          placeholder={t('inbox.composer.catalog.search')}
          className={cx(fieldClass, 'pl-8')}
        />
      </div>

      <div className="-mx-1 max-h-[min(22rem,50vh)] overflow-y-auto px-1">
        {failed && (
          <p role="alert" className="py-6 text-center text-sm text-danger-ink">
            {t('inbox.composer.catalog.failed')}
          </p>
        )}
        {!products && !failed && (
          <div aria-busy="true">
            <span className="sr-only">{t('inbox.composer.catalog.loading')}</span>
            <Skeleton className="mb-1.5 h-3 w-28" />
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-lg" />
              ))}
            </div>
          </div>
        )}
        {products && !failed && withImages.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-faint">
            {t('inbox.composer.catalog.empty')}
          </p>
        )}
        <div className="space-y-4">
          {withImages.map((product) => {
            const images = product.images.filter((image) => image.thumbnail_url || image.url);
            return (
              <section key={product.id}>
                <h4 className="sticky top-0 z-10 mb-1.5 flex items-baseline gap-2 bg-panel pb-1">
                  <span className="min-w-0 truncate text-xs font-medium text-ink">
                    {product.name}
                  </span>
                  <span className="flex-none text-xs text-ink-faint tabular-nums">
                    {t('inbox.composer.catalog.photos', { count: images.length })}
                  </span>
                </h4>
                <ul className="grid grid-cols-4 gap-1.5">
                  {images.map((image, index) => {
                    const order = chosen.findIndex((c) => c.mediaId === image.media_id);
                    const picked = order >= 0;
                    return (
                      <li key={image.id}>
                        <button
                          type="button"
                          aria-pressed={picked}
                          aria-label={t('inbox.composer.catalog.image', {
                            name: product.name,
                            n: index + 1,
                          })}
                          disabled={full && !picked}
                          onClick={() =>
                            toggle({
                              mediaId: image.media_id,
                              url: image.thumbnail_url ?? image.url,
                              name: product.name,
                            })
                          }
                          className="group relative block aspect-square w-full overflow-hidden rounded-lg bg-panel-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-active disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <MediaImage
                            image={image}
                            alt=""
                            width={96}
                            height={96}
                            loading="lazy"
                            decoding="async"
                            className={cx(
                              'size-full object-cover motion-safe:transition-transform',
                              picked
                                ? 'scale-95 rounded-md'
                                : 'group-enabled:group-hover:scale-105',
                            )}
                          />
                          <span
                            aria-hidden
                            className={cx(
                              'pointer-events-none absolute inset-0 rounded-lg border-2',
                              picked ? 'border-active' : 'border-transparent',
                            )}
                          />
                          {image.role === 'size_chart' && (
                            <span
                              aria-hidden
                              className="absolute bottom-1 left-1 rounded bg-paper/90 px-1 py-px text-[11px] font-medium text-ink"
                            >
                              {t('inbox.composer.catalog.sizeChart')}
                            </span>
                          )}
                          <span
                            aria-hidden
                            className={cx(
                              'absolute top-1 right-1 flex size-5 items-center justify-center rounded-full text-xs font-medium tabular-nums',
                              picked
                                ? 'bg-active text-paper'
                                : 'border border-ink-faint bg-paper/70 opacity-0 group-enabled:group-hover:opacity-100 group-focus-visible:opacity-100',
                            )}
                          >
                            {picked ? order + 1 : ''}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5 border-t border-line pt-3">
        <p
          className={cx('text-xs tabular-nums', full ? 'text-warn-ink' : 'text-ink-muted')}
          aria-live="polite"
        >
          {full
            ? t('inbox.composer.catalog.full', { max: room })
            : t('inbox.composer.catalog.selected', { count: chosen.length, max: room })}
        </p>
        <ActionButton
          tone="primary"
          disabled={chosen.length === 0}
          onClick={() => onPick(chosen)}
          className="w-full justify-center"
        >
          {t('inbox.composer.catalog.add', { count: chosen.length })}
        </ActionButton>
      </div>
    </div>
  );
}
