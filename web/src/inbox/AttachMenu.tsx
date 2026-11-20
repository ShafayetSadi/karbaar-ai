import { LayoutGrid, Paperclip, ShoppingBag, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Popover } from '../components/ui';
import { CatalogPicker } from './CatalogPicker';
import { ProductPicker } from './ProductPicker';
import { IMAGE_TYPES, MAX_ATTACHMENTS, type Attachments } from './useAttachments';
import { MAX_CARDS, type ProductCards } from './useProductCards';

const ITEM =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-active disabled:opacity-50 disabled:hover:bg-transparent';

/**
 * The composer's attach button: images from the device or the catalog, or product cards. One
 * button rather than one each, so the composer still fits a phone. `cards` is left out for a
 * channel that cannot show cards, and the option is not offered.
 */
export function AttachMenu({
  attachments,
  cards,
  disabled,
}: {
  attachments: Attachments;
  cards?: ProductCards;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'catalog' | 'products'>('menu');
  const fileInput = useRef<HTMLInputElement>(null);
  const imageLimit = attachments.full
    ? t('inbox.composer.limit', { max: MAX_ATTACHMENTS })
    : undefined;
  const cardLimit = cards?.full ? t('inbox.composer.cardLimit', { max: MAX_CARDS }) : undefined;

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={IMAGE_TYPES.join(',')}
        aria-label={t('inbox.composer.fromDevice')}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          attachments.addFiles(Array.from(e.target.files ?? []));
          e.target.value = ''; // the same file can be chosen again
        }}
      />
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setView('menu');
        }}
        align="start"
        className={
          view === 'catalog' ? 'w-[min(25rem,calc(100vw-2rem))]' : 'w-[min(22rem,calc(100vw-2rem))]'
        }
        trigger={
          <IconButton
            icon={Paperclip}
            label={t('inbox.composer.attach')}
            disabled={disabled || (attachments.full && (!cards || cards.full))}
          />
        }
      >
        {view === 'menu' ? (
          <div className="-m-1 space-y-0.5">
            <button
              type="button"
              className={ITEM}
              disabled={attachments.full}
              title={imageLimit}
              onClick={() => {
                setOpen(false);
                fileInput.current?.click();
              }}
            >
              <Upload aria-hidden className="size-4" />
              {t('inbox.composer.fromDevice')}
            </button>
            <button
              type="button"
              className={ITEM}
              disabled={attachments.full}
              title={imageLimit}
              onClick={() => setView('catalog')}
            >
              <LayoutGrid aria-hidden className="size-4" />
              {t('inbox.composer.fromCatalog')}
            </button>
            {cards && (
              <button
                type="button"
                className={ITEM}
                disabled={cards.full}
                title={cardLimit}
                onClick={() => setView('products')}
              >
                <ShoppingBag aria-hidden className="size-4" />
                {t('inbox.composer.products.title')}
              </button>
            )}
          </div>
        ) : view === 'catalog' ? (
          <CatalogPicker
            room={MAX_ATTACHMENTS - attachments.items.length}
            onBack={() => setView('menu')}
            onPick={(images) => {
              attachments.addCatalog(images);
              setOpen(false);
            }}
          />
        ) : (
          cards && (
            <ProductPicker
              room={MAX_CARDS - cards.items.length}
              added={cards.productIds}
              onBack={() => setView('menu')}
              onPick={(products) => {
                cards.add(products);
                setOpen(false);
              }}
            />
          )
        )}
      </Popover>
    </>
  );
}
