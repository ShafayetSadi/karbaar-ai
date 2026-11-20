import { LeaveGuard } from '../navigation/LeaveGuard';
import { PackagePlus, Trash2 } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import { isAmbiguousRequestFailure } from '../api/errors';
import type { components } from '../api/schema';
import { ActionButton, Button, Field, FormError, cx, fieldClass } from '../components/ui';
import { formatBDT, formatInteger } from '../i18n/format';
import { AddressFields } from './AddressFields';
import { QuoteSummary } from './QuoteSummary';
import { VariantPicker } from './VariantPicker';
import {
  parseQuantity,
  quoteFromChange,
  quoteItems,
  variantLabel,
  type FormLine,
  type FormValues,
  type Order,
  type OrderQuote,
} from './orderForm';

type DeliveryOption = components['schemas']['DeliveryOptionRead'];
type Customer = components['schemas']['CustomerRead'];

/**
 * Items, customer and delivery for one order, with a live price from the server. Used for the
 * AI's proposal in the inbox and for orders typed by hand. Nothing here calculates money: totals
 * are whatever `POST /v1/orders/quote` returns, and creating the order prices it again.
 *
 * `draftId` (with `conversationId`) links the new order to the AI draft it came from.
 * `customerId` is the conversation's own customer, to tell when a phone number belongs to
 * someone else.
 */
export function OrderForm({
  initial,
  controlledValues,
  renderSuggestion,
  suggestionFields = [],
  conversationId,
  draftId,
  preparationId,
  customerId,
  addProductId,
  onAddProductDone,
  onValuesChange,
  onBeforeCreate,
  onCreateFailed,
  active = true,
  checkAvailability = false,
  layout = 'compact',
  onCreated,
}: {
  initial: FormValues;
  controlledValues?: FormValues;
  renderSuggestion?: (field: string, labels?: Record<string, string>) => ReactNode;
  suggestionFields?: string[];
  conversationId?: string;
  draftId?: string;
  preparationId?: string;
  customerId?: string;
  /**
   * A product to add on open: its only active variant goes straight onto the order, otherwise the
   * picker opens on that product. `onAddProductDone` is called once it has been handled.
   */
  addProductId?: string | null;
  onAddProductDone?: () => void;
  onValuesChange?: (values: FormValues, field: string, source?: 'default') => void;
  onBeforeCreate?: (key: string, request: components['schemas']['OrderCreate']) => Promise<boolean>;
  onCreateFailed?: (unresolved: boolean) => Promise<void>;
  active?: boolean;
  checkAvailability?: boolean;
  /** `page`: titled cards with a sticky summary (a whole page). `compact`: one column (a side panel). */
  layout?: 'compact' | 'page';
  onCreated: (order: Order) => void;
}) {
  const { t } = useTranslation();
  const saved = useRef(false);
  const [localValues, setValues] = useState<FormValues>(initial);
  const values = controlledValues ?? localValues;
  const [options, setOptions] = useState<DeliveryOption[] | null>(null);
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickQuery, setPickQuery] = useState('');
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteError, setQuoteError] = useState<ApiError | null>(null);
  // Create was refused because the price moved: the quote on screen is now the fresh one.
  const [priceChanged, setPriceChanged] = useState(false);
  const [allowedIds, setAllowedIds] = useState<string[] | null>(null);
  const [noCommon, setNoCommon] = useState<ApiError | null>(null);
  const [match, setMatch] = useState<Customer | null>(null);
  const [stockByVariant, setStockByVariant] = useState<Record<string, number>>({});
  const [availabilityFailed, setAvailabilityFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const keyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void call(() => api.GET('/v1/delivery/options')).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setOptionsFailed(true);
        return;
      }
      const active = result.data.items.filter((o) => o.is_active);
      setOptions(active);
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !options || options.some((option) => option.id === values.deliveryOptionId))
      return;
    // A saved option may have been disabled. A sole active option is still a useful initial choice.
    const next = {
      ...values,
      deliveryOptionId: options.length === 1 ? (options[0]?.id ?? '') : '',
    };
    if (next.deliveryOptionId === values.deliveryOptionId) return;
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- reconcile a saved choice against live delivery options
    setValues(next);
    onValuesChange?.(next, 'delivery_option_id', 'default');
  }, [active, options, values, onValuesChange]);

  // Re-quote when the items or the delivery option change; a slower answer never overwrites a
  // newer one.
  const items = quoteItems(values.lines);
  const itemsKey = JSON.stringify(items);
  const stockKey = JSON.stringify(
    values.lines.map(({ productId, variantId }) => ({ productId, variantId })),
  );
  useEffect(() => {
    const groups = new Map<string, string[]>();
    for (const line of values.lines) {
      if (!line.productId) continue;
      groups.set(line.productId, [...(groups.get(line.productId) ?? []), line.variantId]);
    }
    if (!active || !checkAvailability || groups.size === 0) {
      // oxlint-disable-next-line react-hooks/set-state-in-effect -- no active products to check
      setStockByVariant({});
      setAvailabilityFailed(false);
      return;
    }
    let cancelled = false;
    setStockByVariant({});
    setAvailabilityFailed(false);
    void Promise.all(
      [...groups].map(async ([productId, variantIds]) => {
        const product = await call(() =>
          api.GET('/v1/products/{product_id}', { params: { path: { product_id: productId } } }),
        );
        if (!product.ok) return { failed: true as const, levels: {} };
        if (!product.data.track_inventory) return { failed: false as const, levels: {} };
        const levels = await call(() =>
          api.GET('/v1/inventory/levels', { params: { query: { variant_id: variantIds } } }),
        );
        if (!levels.ok) return { failed: true as const, levels: {} };
        return {
          failed: false as const,
          levels: Object.fromEntries(
            levels.data.items.map((level) => [level.variant_id, level.on_hand]),
          ),
        };
      }),
    ).then((results) => {
      if (cancelled) return;
      setAvailabilityFailed(results.some((result) => result.failed));
      setStockByVariant(Object.assign({}, ...results.map((result) => result.levels)));
    });
    return () => {
      cancelled = true;
    };
  }, [active, checkAvailability, stockKey, itemsKey, values.lines]);
  const optionId = values.deliveryOptionId;
  const couponCode = values.couponCode.trim() || null;
  // The order attaches to whoever owns the phone; until one is typed, the conversation's customer.
  // Their advance, if the shop asks one of them, is part of the price.
  const quoteCustomerId = match?.id ?? customerId ?? null;
  useEffect(() => {
    if (!active || !items || !optionId) {
      // oxlint-disable-next-line react-hooks/set-state-in-effect -- nothing to price yet
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void call(() =>
        api.POST('/v1/orders/quote', {
          body: {
            items,
            delivery_option_id: optionId,
            customer_id: quoteCustomerId,
            coupon_code: couponCode,
          },
        }),
      ).then((result) => {
        if (cancelled) return;
        setPriceChanged(false);
        if (result.ok) {
          setQuote(result.data);
          setQuoteError(null);
        } else {
          setQuote(null);
          setQuoteError(result.error);
        }
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `items` is derived from `values.lines`; `itemsKey` stands in for it.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, itemsKey, optionId, quoteCustomerId, couponCode]);

  // Which delivery options the products allow together; independent of the chosen option, so a
  // refused choice can still be explained and the allowed ones stay selectable.
  useEffect(() => {
    if (!active || !items) {
      // oxlint-disable-next-line react-hooks/set-state-in-effect -- nothing to ask about yet
      setAllowedIds(null);
      setNoCommon(null);
      return;
    }
    let cancelled = false;
    void call(() =>
      api.GET('/v1/delivery/options/allowed', {
        params: { query: { variant_id: items.map((item) => item.variant_id) } },
      }),
    ).then((result) => {
      if (cancelled) return;
      setAllowedIds(result.ok ? result.data.allowed_delivery_option_ids : null);
      setNoCommon(
        !result.ok && result.error.code === 'NO_COMMON_DELIVERY_OPTION' ? result.error : null,
      );
    });
    return () => {
      cancelled = true;
    };
    // `items` is derived from `values.lines`; `itemsKey` stands in for it.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, itemsKey]);

  // "Is this someone we know?": a phone that belongs to a customer other than the conversation's.
  const phone = values.phone.trim();
  useEffect(() => {
    if (!active || phone.length < 11) {
      // oxlint-disable-next-line react-hooks/set-state-in-effect -- too short to look up
      setMatch(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void call(() => api.GET('/v1/customers/by-phone', { params: { query: { phone } } })).then(
        (result) => {
          if (!cancelled) setMatch(result.ok ? result.data : null);
        },
      );
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, phone]);

  function set<K extends keyof FormValues>(name: K, value: FormValues[K]) {
    const next = { ...values, [name]: value };
    setValues(next);
    onValuesChange?.(
      next,
      String(name).replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
    );
  }

  function setLine(index: number, patch: Partial<FormLine>) {
    const next = {
      ...values,
      lines: values.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    };
    setValues(next);
    onValuesChange?.(next, `lines.${values.lines[index]?.variantId}.quantity`);
  }

  const addLoadedVariant = useEffectEvent(addVariant);

  useEffect(() => {
    if (!active || !addProductId) return;
    let cancelled = false;
    void call(() =>
      api.GET('/v1/products/{product_id}', { params: { path: { product_id: addProductId } } }),
    ).then((result) => {
      if (cancelled) return;
      onAddProductDone?.();
      if (!result.ok) {
        setPickQuery('');
        setPicking(true);
        return;
      }
      const product = result.data;
      const active = product.variants.filter((v) => v.status === 'active');
      const only = active.length === 1 ? active[0] : undefined;
      if (only) {
        addLoadedVariant({
          id: only.id,
          productId: product.id,
          label: variantLabel(product.name, only.option_values),
        });
      } else {
        setPickQuery(product.name);
        setPicking(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- run once per clicked product
  }, [active, addProductId]);

  function addVariant(variant: { id: string; productId: string; label: string }) {
    setPicking(false);
    const existing = values.lines.findIndex((line) => line.variantId === variant.id);
    const next =
      existing === -1
        ? {
            ...values,
            lines: [
              ...values.lines,
              {
                variantId: variant.id,
                productId: variant.productId,
                label: variant.label,
                quantity: '1',
              },
            ],
          }
        : {
            ...values,
            lines: values.lines.map((line, i) =>
              i === existing
                ? { ...line, quantity: String((parseQuantity(line.quantity) ?? 0) + 1) }
                : line,
            ),
          };
    setValues(next);
    onValuesChange?.(next, `lines.${variant.id}`);
  }

  // The API error is already in the UI language; an order screen only says which thing is missing.
  function errorText(failure: ApiError): string {
    return failure.code === 'NOT_FOUND' ? t('orders.errors.NOT_FOUND') : failure.message;
  }

  // Options some product in the order cannot use are disabled, with the reason.
  const isBlocked = (id: string) => allowedIds !== null && !allowedIds.includes(id);
  const quoted = new Map(quote?.lines.map((l) => [l.variant_id, l]));
  const currentQuote =
    (quote?.coupon_code ?? null) === (couponCode?.toUpperCase() ?? null) ? quote : null;
  const canCreate =
    currentQuote !== null && values.phone.trim() !== '' && values.address.trim() !== '' && !busy;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!items || !currentQuote || !canCreate) return;
    const body = {
      items,
      // What the merchant is looking at: the server refuses with the fresh quote if it has moved.
      expected_total_minor: currentQuote.total_minor,
      expected_advance_minor: currentQuote.advance_required_minor,
      delivery_option_id: optionId,
      coupon_code: couponCode,
      phone: values.phone.trim(),
      address_raw: values.address.trim(),
      district: values.district || undefined,
      area: values.area.trim() || undefined,
      address_line: values.line.trim() || undefined,
      customer_name: values.name.trim() || undefined,
      notes: values.notes.trim() || undefined,
      conversation_id: conversationId,
      draft_id: draftId,
      preparation_id: preparationId,
    };
    // One key per distinct order: a retry after a dropped connection must not create it twice,
    // while a corrected form is a different request.
    const fingerprint = JSON.stringify(body);
    if (keyRef.current?.fingerprint !== fingerprint) {
      keyRef.current = { fingerprint, key: crypto.randomUUID() };
    }
    const key = keyRef.current.key;
    if (onBeforeCreate && !(await onBeforeCreate(key, body))) return;
    setBusy(true);
    setError(null);
    setPriceChanged(false);
    const result = await call(() =>
      api.POST('/v1/orders', { params: { header: { 'Idempotency-Key': key } }, body }),
    );
    setBusy(false);
    if (result.ok) {
      keyRef.current = null;
      saved.current = true;
      onCreated(result.data);
      return;
    }
    const unresolved = isAmbiguousRequestFailure(result.error);
    await onCreateFailed?.(unresolved);
    if (!unresolved) keyRef.current = null;
    const fresh = quoteFromChange(result.error);
    if (fresh) {
      // Nothing was created. Show the price as it is now and let the merchant create again.
      setQuote(fresh);
      setQuoteError(null);
      setPriceChanged(true);
      return;
    }
    setError(result.error);
  }

  const page = layout === 'page';

  const itemsBlock = (
    <>
      {values.lines.length === 0 &&
        (page ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-line px-4 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-panel-muted text-ink-muted">
              <PackagePlus aria-hidden className="size-5" />
            </span>
            <p className="mt-3 text-ink-faint">{t('orders.form.noItems')}</p>
          </div>
        ) : (
          <p className="text-ink-faint">{t('orders.form.noItems')}</p>
        ))}
      <ul className="space-y-2">
        {values.lines.map((line, index) => {
          const priced = quoted.get(line.variantId);
          const quantity = parseQuantity(line.quantity);
          const invalid = quantity === null;
          const onHand = stockByVariant[line.variantId];
          return (
            <li
              key={line.variantId}
              className={cx(
                'rounded-lg border border-line p-3',
                page ? 'bg-paper' : 'bg-panel p-2',
              )}
            >
              <p className="font-medium break-words text-ink">{line.label}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-ink-muted">
                  {t('orders.form.quantity')}
                  <input
                    inputMode="numeric"
                    value={line.quantity}
                    onChange={(e) => setLine(index, { quantity: e.target.value })}
                    aria-label={t('orders.form.quantityOf', { label: line.label })}
                    aria-invalid={invalid ? true : undefined}
                    className={cx('w-16 px-2! py-1! font-mono', fieldClass)}
                  />
                </label>
                {priced !== undefined && (
                  <span className="font-mono text-xs text-ink-muted">
                    {priced.tier_min_quantity !== null && (
                      <s className="mr-1 text-ink-faint">{formatBDT(priced.list_price_minor)}</s>
                    )}
                    {t('orders.form.each', { price: formatBDT(priced.unit_price_minor) })}
                    {priced.tier_min_quantity !== null && (
                      <span className="ml-1 text-ok-ink">
                        {t('orders.tierPrice', { quantity: priced.tier_min_quantity })}
                      </span>
                    )}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...values, lines: values.lines.filter((_, i) => i !== index) };
                    setValues(next);
                    onValuesChange?.(next, `lines.${line.variantId}.removed`);
                  }}
                  aria-label={t('orders.form.removeItem', { label: line.label })}
                  className="ml-auto inline-flex items-center gap-1 text-ink-muted hover:text-danger-ink focus-visible:outline-2 focus-visible:outline-active"
                >
                  {page && <Trash2 aria-hidden className="size-3.5" />}
                  <span className={page ? undefined : 'underline'}>{t('orders.form.remove')}</span>
                </button>
              </div>
              {renderSuggestion?.(`lines.${line.variantId}.quantity`)}
              {renderSuggestion?.(`lines.${line.variantId}`)}
              {quantity !== null && onHand !== undefined && onHand < quantity && (
                <p role="alert" className="mt-2 text-sm text-warn-ink">
                  {t('orders.form.insufficientStock', { available: formatInteger(onHand) })}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {suggestionFields
        .filter(
          (field) =>
            field.startsWith('lines.') &&
            !values.lines.some((line) => field.split('.')[1] === line.variantId),
        )
        .map((field) => (
          <div key={field}>{renderSuggestion?.(field)}</div>
        ))}
      {availabilityFailed && (
        <p role="status" className="text-sm text-warn-ink">
          {t('orders.form.availabilityFailed')}
        </p>
      )}
      {picking ? (
        <VariantPicker
          onPick={addVariant}
          onClose={() => setPicking(false)}
          initialQuery={pickQuery}
        />
      ) : (
        <ActionButton icon={page ? PackagePlus : undefined} onClick={() => setPicking(true)}>
          {t('orders.form.addItem')}
        </ActionButton>
      )}
    </>
  );

  const customerBlock = (
    <>
      <Field
        label={t('orders.form.customerName')}
        value={values.name}
        onChange={(e) => set('name', e.target.value)}
        maxLength={200}
        error={error?.fields.customer_name}
      />
      {renderSuggestion?.('name')}
      <Field
        label={t('orders.form.phone')}
        type="tel"
        inputMode="tel"
        value={values.phone}
        onChange={(e) => set('phone', e.target.value)}
        error={error?.fields.phone}
      />
      {renderSuggestion?.('phone')}
      {match && match.id !== customerId && (
        <p role="status" className="rounded-md bg-ai px-3 py-2 text-ai-ink">
          {match.name
            ? t('orders.form.existingCustomer', { name: match.name })
            : t('orders.form.existingCustomerNoName')}
        </p>
      )}
      <AddressFields
        renderSuggestion={renderSuggestion}
        values={values}
        onChange={(patch) => {
          const next = { ...values, ...patch };
          setValues(next);
          for (const field of Object.keys(patch)) {
            onValuesChange?.(
              next,
              field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
            );
          }
        }}
        error={error}
      />
    </>
  );

  const deliveryBlock = (
    <>
      <Field
        label={t('orders.form.couponCode')}
        value={values.couponCode}
        onChange={(e) => set('couponCode', e.target.value)}
        maxLength={32}
        error={error?.fields.coupon_code}
      />
      {renderSuggestion?.('couponCode')}
      <label className="block text-sm font-medium text-ink-muted">
        {t('orders.form.delivery')}
        <select
          value={optionId}
          onChange={(e) => set('deliveryOptionId', e.target.value)}
          className={cx('mt-1 block w-full', fieldClass)}
        >
          <option value="">{t('orders.form.chooseDelivery')}</option>
          {options?.map((option) => (
            <option key={option.id} value={option.id} disabled={isBlocked(option.id)}>
              {option.name} · {formatBDT(option.fee_minor)}
              {isBlocked(option.id) && ` · ${t('orders.form.notAllowed')}`}
            </option>
          ))}
        </select>
      </label>
      {renderSuggestion?.(
        'deliveryOptionId',
        Object.fromEntries((options ?? []).map((option) => [option.id, option.name])),
      )}
      {optionsFailed && (
        <p role="alert" className="text-danger-ink">
          {t('orders.form.deliveryFailed')}
        </p>
      )}
      {noCommon && (
        <p role="alert" className="text-danger-ink">
          {t('errors.NO_COMMON_DELIVERY_OPTION')}
        </p>
      )}
      {options?.length === 0 && (
        <p role="status" className="text-warn-ink">
          {t('orders.form.noDeliveryOptions')}
        </p>
      )}
      <label className="block text-sm font-medium text-ink-muted">
        {t('orders.form.notes')}
        <textarea
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
          maxLength={1000}
          className={cx('mt-1 block w-full', fieldClass)}
        />
      </label>
      {renderSuggestion?.('notes')}
    </>
  );

  const summaryBlock = (
    <div aria-live="polite" className={cx('rounded-md p-3', !page && 'bg-panel-muted')}>
      {priceChanged && (
        <p role="alert" className="mb-2 rounded-md bg-warn px-3 py-2 text-warn-ink">
          {t('orders.form.priceChanged')}
        </p>
      )}
      {currentQuote && <QuoteSummary quote={currentQuote} />}
      {!currentQuote && !quoteError && (
        <p className="text-ink-faint">{t('orders.form.quoteWaiting')}</p>
      )}
      {quoteError && (
        <p role="alert" className="text-danger-ink">
          {errorText(quoteError)}
        </p>
      )}
    </div>
  );

  const errorBlock =
    error &&
    error.code !== 'DISTRICT_REQUIRED' &&
    (error.code === 'NOT_FOUND' ? (
      <p role="alert" className="rounded-md bg-danger px-3 py-2 text-danger-ink">
        {errorText(error)}
      </p>
    ) : (
      <FormError error={error} />
    ));

  const submitButton = (
    <Button type="submit" busy={busy} disabled={!canCreate}>
      {t('orders.form.create')}
    </Button>
  );

  if (page) {
    return (
      <form
        onSubmit={(e) => void submit(e)}
        className="grid grid-cols-1 items-start gap-6 text-sm lg:grid-cols-12"
        noValidate
      >
        <LeaveGuard
          ignoreParams={['menu', 'customer', 'image']}
          dirty={JSON.stringify(values) !== JSON.stringify(initial)}
          bypass={saved}
          message={t('editor.leaveUnsaved')}
        />
        <div className="space-y-6 lg:col-span-7 xl:col-span-8">
          <Card title={t('orders.form.items')}>{itemsBlock}</Card>
          <Card title={t('orders.customer')}>{customerBlock}</Card>
          <Card title={t('orders.form.deliveryTitle')}>{deliveryBlock}</Card>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-4 lg:col-span-5 xl:col-span-4">
          <Card title={t('orders.form.summary')}>
            {summaryBlock}
            {errorBlock}
            {submitButton}
          </Card>
        </aside>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4 text-sm" noValidate>
      <LeaveGuard
        ignoreParams={['menu', 'customer', 'image']}
        dirty={JSON.stringify(values) !== JSON.stringify(initial)}
        bypass={saved}
        message={t('navigation.leaveUnsaved')}
      />
      <fieldset className="space-y-2">
        <legend className="font-medium text-ink">{t('orders.form.items')}</legend>
        {itemsBlock}
      </fieldset>
      <div className="space-y-3">{customerBlock}</div>
      <div className="space-y-3">{deliveryBlock}</div>
      {summaryBlock}
      {errorBlock}
      {submitButton}
    </form>
  );
}

/** A titled panel of the page layout, the same look as the product editor's panels. */
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
