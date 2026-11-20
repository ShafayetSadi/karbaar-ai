import { MediaImage } from '../components/MediaImage';
import { ExternalLink, Plus, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useInRouterContext } from 'react-router-dom';
import type { components } from '../api/schema';
import { useStableSrc } from '../components/useStableSrc';
import { Popover } from '../components/ui';
import { formatBDT } from '../i18n/format';

type Template = components['schemas']['TemplateRead'];
type TemplateButton = components['schemas']['TemplateButtonRead'];
type Card = components['schemas']['TemplateCardRead'];
type QuickReply = components['schemas']['QuickReplyRead'];

/**
 * Cards, a button message or a receipt we sent on Messenger, drawn as the customer
 * saw them. Read-only: the buttons are what the customer could tap, not actions for the merchant,
 * so they are not buttons here. The one exception is `onOrder`, which puts a "+ Order" button on
 * each opened product card for the merchant. Sent cards show as a short strip (`CardStrip`); the
 * full card, as the customer saw it, opens on click.
 */
export function TemplateMessage({
  template,
  onOrder,
}: {
  template: Template;
  onOrder?: (productId: string) => void;
}) {
  if (template.type === 'generic') return <CardStrip cards={template.cards} onOrder={onOrder} />;
  if (template.type === 'button') {
    return (
      <div className="w-[min(16rem,70vw)] overflow-hidden rounded-2xl rounded-br-md border border-line bg-panel text-sm text-ink">
        <p className="px-3.5 py-2 break-words whitespace-pre-wrap">{template.text}</p>
        <TemplateButtons buttons={template.buttons} />
      </div>
    );
  }
  return <Receipt template={template} />;
}

/**
 * Sent product cards as a short, scrollable strip: thumbnail, one-line title and price. A click
 * opens the full card (what the customer saw) with + Order and a link to the catalog, so a sent
 * carousel stays a line in the conversation and does not push the customer's words off screen.
 */
export function CardStrip({
  cards,
  onOrder,
}: {
  cards: Card[];
  onOrder?: (productId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <ul
      aria-label={t('inbox.template.cards', { count: cards.length })}
      className="flex max-w-[min(100%,calc(100vw-5rem))] snap-x gap-1.5 overflow-x-auto pb-1"
    >
      {cards.map((card, i) => (
        <StripItem key={card.product_id ?? i} card={card} onOrder={onOrder} />
      ))}
    </ul>
  );
}

function StripItem({ card, onOrder }: { card: Card; onOrder?: (productId: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { price, stock } = readCardSubtitle(card.subtitle ?? '');
  const productId = card.product_id;
  return (
    <li className="w-[min(14rem,70vw)] shrink-0 snap-start">
      <Popover
        open={open}
        onOpenChange={setOpen}
        align="start"
        className="w-[min(14rem,calc(100vw-2rem))] overflow-hidden p-0"
        trigger={
          <button
            type="button"
            aria-label={t('inbox.template.openCard', { name: card.title })}
            className="flex w-full items-center gap-2 rounded-xl border border-line bg-panel p-1.5 text-left text-ink hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-active"
          >
            <StripThumb url={card.image_url} />
            <span className="min-w-0 flex-1">
              <span title={card.title} className="block truncate text-xs font-medium">
                {card.title}
              </span>
              <span className="block truncate text-xs text-ink-muted">
                {price}
                {stock && <span className="text-warn-ink"> · {stock}</span>}
              </span>
            </span>
          </button>
        }
      >
        <CardImage url={card.image_url} />
        <div className="px-3 py-2">
          <p className="text-sm font-medium break-words">{card.title}</p>
          {card.subtitle && <CardSubtitle subtitle={card.subtitle} />}
        </div>
        {productId && (
          <div className="flex flex-col border-t border-line">
            {onOrder && (
              <button
                type="button"
                onClick={() => {
                  onOrder(productId);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-center gap-1 px-2 py-2 text-xs font-medium text-ink hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-active"
              >
                <Plus aria-hidden className="size-3" />
                {t('inbox.template.order')}
              </button>
            )}
            <ProductLink productId={productId} />
          </div>
        )}
        {card.buttons.length > 0 && (
          <div className="border-t border-line bg-panel-muted/50">
            <TemplateButtons buttons={card.buttons} bare />
          </div>
        )}
      </Popover>
    </li>
  );
}

function ProductLink({ productId }: { productId: string }) {
  const { t } = useTranslation();
  const inRouter = useInRouterContext();
  if (!inRouter) return null;
  return (
    <Link
      to={`/products/${productId}`}
      className="flex items-center justify-center gap-1 border-t border-line px-2 py-2 text-xs text-ink-muted first:border-t-0 hover:bg-panel-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-active"
    >
      <ExternalLink aria-hidden className="size-3" />
      {t('inbox.template.openProduct')}
    </Link>
  );
}

function StripThumb({ url }: { url: string | null }) {
  const image = useStableSrc(url);
  const box = 'size-10 shrink-0 rounded-lg bg-panel-muted object-cover';
  if (!image.src) return <span aria-hidden className={box} />;
  return (
    <MediaImage src={image.src} onError={image.onError} alt="" loading="lazy" className={box} />
  );
}

/**
 * A row of product cards as Messenger shows them; also the settings preview of one card and the
 * cards under an AI draft, where `onRemove` adds a button to take a card out before sending.
 */
export function Carousel({
  cards,
  onRemove,
  onOrder,
  label,
}: {
  cards: Card[];
  onRemove?: (card: Card) => void;
  /** Adds a "+ Order" button to cards that are catalog products. */
  onOrder?: (productId: string) => void;
  label?: string;
}) {
  const { t } = useTranslation();
  return (
    <ul
      aria-label={label ?? t('inbox.template.cards', { count: cards.length })}
      className="flex max-w-[min(100%,calc(100vw-5rem))] snap-x snap-mandatory gap-2 overflow-x-auto pb-1"
    >
      {cards.map((card, i) => (
        <li
          key={card.product_id ?? i}
          className="relative flex w-[min(13rem,60vw)] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-line bg-panel text-ink"
        >
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(card)}
              aria-label={t('inbox.draft.removeCard', { name: card.title })}
              className="absolute top-1.5 right-1.5 rounded-full border border-line bg-panel/90 p-1 text-ink-muted hover:bg-panel-muted hover:text-ink"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          )}
          <ProductCardHeader card={card}>
            <CardImage url={card.image_url} />
            <div className="min-w-0 px-3 py-2">
              <p className="line-clamp-2 text-sm font-medium break-words group-hover:text-active group-hover:underline">
                {card.title}
              </p>
              {card.subtitle && <CardSubtitle subtitle={card.subtitle} />}
            </div>
          </ProductCardHeader>
          <div className="mt-auto">
            {onOrder && card.product_id && (
              <button
                type="button"
                onClick={() => onOrder(card.product_id!)}
                className="flex w-full items-center justify-center gap-1 border-t border-line px-2 py-1.5 text-xs font-medium text-ink hover:bg-panel-muted focus-visible:outline-2 focus-visible:outline-active"
              >
                <Plus aria-hidden className="size-3" />
                {t('inbox.template.order')}
              </button>
            )}
            <TemplateButtons buttons={card.buttons} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const PIECE_COUNT = /^[\d\u09E6-\u09EF,]+\s*(?:pcs?|pieces|পিস)$/i;
const IN_STOCK = /^(?:স্টকে আছে|in stock)$/i;
const STOCK_NOTE =
  /^(?:স্টক শেষ|স্টক কম|প্রি-অর্ডার|অর্ডারে তৈরি|out of stock|low stock|pre-order|made to order)/i;

/**
 * Price, then sizes. A stock note stays only when it is low, out, or not ready to ship.
 * "In stock" and a piece count (`10,107 pcs`) are left off: they bury the price.
 */
export function readCardSubtitle(subtitle: string): {
  price: string;
  detail: string | null;
  stock: string | null;
} {
  const parts = subtitle
    .split(' · ')
    .map((part) => part.trim())
    .filter(Boolean);
  const last = parts.at(-1);
  let stock: string | null = null;
  if (
    last &&
    parts.length > 1 &&
    (PIECE_COUNT.test(last) || IN_STOCK.test(last) || STOCK_NOTE.test(last))
  ) {
    parts.pop();
    if (STOCK_NOTE.test(last)) stock = last;
  }
  return {
    price: parts.shift() ?? subtitle,
    detail: parts.length > 0 ? parts.join(' · ') : null,
    stock,
  };
}

function CardSubtitle({ subtitle }: { subtitle: string }) {
  const { price, detail, stock } = readCardSubtitle(subtitle);
  return (
    <div className="mt-0.5">
      <p className="text-xs font-medium text-ink">{price}</p>
      {detail && <p className="line-clamp-2 text-xs break-words text-ink-muted">{detail}</p>}
      {stock && <p className="text-xs text-warn-ink">{stock}</p>}
    </div>
  );
}

function ProductCardHeader({ card, children }: { card: Card; children: ReactNode }) {
  const { t } = useTranslation();
  const inRouter = useInRouterContext();
  if (card.product_id && inRouter) {
    return (
      <Link
        to={`/products/${card.product_id}`}
        className="group block overflow-hidden focus-visible:outline-2 focus-visible:outline-active"
        title={t('inbox.template.openProduct')}
      >
        {children}
      </Link>
    );
  }
  return <div>{children}</div>;
}

function CardImage({ url }: { url: string | null }) {
  const { t } = useTranslation();
  const image = useStableSrc(url);
  if (!image.src) {
    return <div aria-hidden className="aspect-square w-full bg-panel-muted" />;
  }
  return (
    <MediaImage
      src={image.src}
      onError={image.onError}
      alt={t('inbox.template.cardImageAlt')}
      className="aspect-square w-full object-cover"
    />
  );
}

function TemplateButtons({ buttons, bare }: { buttons: TemplateButton[]; bare?: boolean }) {
  const { t } = useTranslation();
  if (buttons.length === 0) return null;
  return (
    <ul className={bare ? 'divide-y divide-line' : 'divide-y divide-line border-t border-line'}>
      {buttons.map((button, i) => (
        <li
          key={i}
          title={t('inbox.template.customerButtonTooltip')}
          className="flex items-center justify-center gap-1 px-2 py-1.5 text-center text-xs font-medium break-words text-ink-muted select-none cursor-default"
        >
          {button.url && <ExternalLink aria-hidden className="size-3 shrink-0" />}
          {button.title}
        </li>
      ))}
    </ul>
  );
}

/** A decimal string from the API (`"2900.50"`) as poisha, without floating point. */
function toMinor(amount: string): number | null {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return null;
  const minor = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -minor : minor;
}

function money(amount: string | null | undefined, currency: string | null | undefined): string {
  if (!amount) return '';
  const minor = toMinor(amount);
  return currency === 'BDT' && minor !== null
    ? formatBDT(minor)
    : `${currency ?? ''} ${amount}`.trim();
}

function Receipt({ template }: { template: Template }) {
  const { t } = useTranslation();
  const currency = template.currency;
  return (
    <div className="w-[min(16rem,70vw)] rounded-2xl rounded-br-md border border-line bg-panel px-3.5 py-2 text-sm text-ink">
      <p className="font-medium text-xs text-ink-faint">
        {t('inbox.template.receipt', { number: template.order_number ?? '' })}
      </p>
      <ul className="mt-1 space-y-0.5">
        {template.items.map((item, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span className="min-w-0 break-words">
              {item.title} × {item.quantity}
            </span>
            <span className="shrink-0 font-mono">{money(item.price, currency)}</span>
          </li>
        ))}
      </ul>
      {template.shipping && (
        <p className="mt-1 flex justify-between gap-2 text-xs text-ink-muted">
          <span>{t('inbox.template.delivery')}</span>
          <span className="font-mono">{money(template.shipping, currency)}</span>
        </p>
      )}
      <p className="mt-1 flex justify-between gap-2 border-t border-line pt-1 font-medium">
        <span>{t('inbox.template.total')}</span>
        <span className="font-mono">{money(template.total, currency)}</span>
      </p>
      {template.payment_method && (
        <p className="mt-0.5 text-xs break-words text-ink-muted">{template.payment_method}</p>
      )}
    </div>
  );
}

/** The quick replies sent under a text, as chips: what the customer could tap. Read-only. */
export function QuickReplies({ items }: { items: QuickReply[] }) {
  const { t } = useTranslation();
  return (
    <ul aria-label={t('inbox.template.quickReplies')} className="flex flex-wrap justify-end gap-1">
      {items.map((item, i) => (
        <li
          key={i}
          className="max-w-full rounded-full border border-active/40 px-2.5 py-0.5 text-xs break-words text-ink-muted"
        >
          {item.title}
        </li>
      ))}
    </ul>
  );
}
