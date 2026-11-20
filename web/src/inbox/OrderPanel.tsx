import type { ReactNode } from 'react';
import { applyField, reconcile, suggestionText, type Suggestions } from './orderSuggestions';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { call } from '../api/call';
import { isAmbiguousRequestFailure } from '../api/errors';
import { ActionButton, cx } from '../components/ui';
import { LeaveGuard } from '../navigation/LeaveGuard';
import {
  EMPTY_VALUES,
  quoteItems,
  valuesFromProfile,
  valuesFromProposal,
  type FormValues,
  type Order,
  type OrderQuote,
  type Profile,
} from '../orders/orderForm';
import { OrderForm } from '../orders/OrderForm';
import { QuoteSummary } from '../orders/QuoteSummary';
import { formatBDT, formatPhone } from '../i18n/format';
import type { components } from '../api/schema';
import type { ConversationContext } from './useConversationContext';

/** One preparation for this conversation, whether it began with a proposal or manual work. */
export function OrderPanel({
  conversationId,
  context,
  onCreated,
  createdOrder,
  productId,
  onProductUsed,
}: {
  conversationId: string;
  context: ConversationContext;
  onCreated: (order: Order) => void;
  createdOrder?: Order | null;
  productId?: string | null;
  onProductUsed?: () => void;
}) {
  const { t } = useTranslation();
  const customer = context.customer;
  const noted = context.customer_details ?? null;
  const proposal = context.order_proposal ?? null;
  const profile: Profile = useMemo(() => {
    const defaultAddress =
      customer.addresses.find((address) => address.is_default) ?? customer.addresses[0];
    return {
      name: noted?.name ?? customer.name,
      phone: noted?.phone_e164 ?? noted?.phone_input ?? customer.phone_e164,
      ...(noted?.address_raw
        ? {
            address: noted.address_raw,
            district: noted.district,
            area: noted.area ?? null,
            line: noted.address_line ?? null,
          }
        : {
            address: defaultAddress?.raw_text ?? null,
            district: defaultAddress?.district ?? null,
            area: defaultAddress?.area ?? null,
            line: defaultAddress?.line ?? null,
          }),
    };
  }, [customer, noted]);
  const effectiveProposal = proposal && noted ? { ...proposal, customer: noted } : proposal;
  const initial = effectiveProposal
    ? valuesFromProposal(effectiveProposal, profile)
    : { ...EMPTY_VALUES, ...valuesFromProfile(profile) };
  const stored = context.order_preparation;
  const [values, setValues] = useState<FormValues>(() =>
    stored ? fromStored(stored.values) : context.order_discarded ? { ...EMPTY_VALUES } : initial,
  );
  const [expanded, setExpanded] = useState(false);
  const [merchantFields, setMerchantFields] = useState<string[]>(stored?.merchant_fields ?? []);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [edited, setEdited] = useState(false);
  const [saved, setSaved] = useState(Boolean(stored));
  const savedRef = useRef(false);
  const [preparationId, setPreparationId] = useState(
    () => stored?.preparation_id ?? crypto.randomUUID(),
  );
  const version = useRef(stored?.version ?? 0);
  const [sourceDraftId, setSourceDraftId] = useState<string | null>(
    stored ? stored.source_draft_id : (proposal?.draft_id ?? null),
  );
  const [origin, setOrigin] = useState<'manual' | 'ai'>(
    stored?.origin ?? (proposal ? 'ai' : 'manual'),
  );
  const [suggestions, setSuggestions] = useState<Suggestions>(() =>
    Object.fromEntries(
      Object.entries(stored?.reconciliation?.suggestions ?? {}).map(([field, value]) => [
        field,
        fromStored(value),
      ]),
    ),
  );
  const observed = useRef(
    stored?.reconciliation?.observed
      ? fromStored(stored.reconciliation.observed)
      : context.order_discarded
        ? { ...EMPTY_VALUES }
        : initial,
  );
  const sourceAt = useRef(stored?.reconciliation?.source_at ?? context.order_source_at ?? null);
  const proposalAt = useRef(
    stored?.reconciliation?.proposal_at ?? context.order_proposal_source_at ?? null,
  );
  const [discarded, setDiscarded] = useState(context.order_discarded ?? false);
  const [recoveryAttempt, setRecoveryAttempt] = useState(stored?.creation_attempt ?? null);
  const [recovering, setRecovering] = useState(false);
  const [showingCreatedOrder, setShowingCreatedOrder] = useState(
    Boolean(context.order_created && !stored && !context.order_proposal),
  );
  const [discardBusy, setDiscardBusy] = useState(false);
  const queue = useRef<{
    values: FormValues;
    fields: string[];
    revision: number;
    sourceDraftId: string | null;
    origin: 'manual' | 'ai';
    reconciliation: {
      observed: ReturnType<typeof toStored>;
      suggestions: Record<string, ReturnType<typeof toStored>>;
      source_at: string | null;
      proposal_at: string | null;
    };
  } | null>(null);
  const revision = useRef(0);
  const saving = useRef(false);
  const saveTimer = useRef<number | null>(null);
  // Only while the closed summary is what shows: not over a created order, a discard or a recovery.
  const quote = useCollapsedQuote(
    values,
    customer.id,
    !expanded && !discarded && !showingCreatedOrder && !recoveryAttempt,
  );

  const reconcileContext = useEffectEvent(() => {
    if (showingCreatedOrder) {
      // Wait for creation to be reflected in context before accepting another
      // source. A later request gets its own identity and field ownership.
      if (stored || (!proposal && !noted) || proposal?.draft_id === sourceDraftId) return;
      savedRef.current = false;
      setPreparationId(crypto.randomUUID());
      version.current = 0;
      setValues(initial);
      setMerchantFields([]);
      setSuggestions({});
      observed.current = initial;
      sourceAt.current = context.order_source_at ?? null;
      proposalAt.current = context.order_proposal_source_at ?? null;
      setSourceDraftId(proposal?.draft_id ?? null);
      setOrigin(proposal ? 'ai' : 'manual');
      setShowingCreatedOrder(false);
      setExpanded(false);
      setEdited(true);
      setSaved(false);
      return;
    }
    if (context.order_source_at && sourceAt.current && context.order_source_at < sourceAt.current)
      return;
    if (discarded && context.order_discarded) return;
    const olderProposal =
      context.order_proposal_source_at &&
      proposalAt.current &&
      context.order_proposal_source_at < proposalAt.current;
    const incoming = olderProposal
      ? {
          ...(noted ? initial : observed.current),
          lines: observed.current.lines,
          deliveryOptionId: observed.current.deliveryOptionId,
        }
      : initial;
    const result = reconcile(
      values,
      observed.current,
      proposal
        ? incoming
        : {
            ...incoming,
            lines: observed.current.lines,
            deliveryOptionId: observed.current.deliveryOptionId,
          },
      merchantFields.map(formField),
      suggestions,
    );
    const changedSource = !olderProposal && proposal && sourceDraftId !== proposal.draft_id;
    const changed =
      JSON.stringify(result.values) !== JSON.stringify(values) ||
      JSON.stringify(result.suggestions) !== JSON.stringify(suggestions) ||
      changedSource ||
      (context.order_source_at ?? null) !== sourceAt.current;
    observed.current = proposal
      ? incoming
      : {
          ...incoming,
          lines: observed.current.lines,
          deliveryOptionId: observed.current.deliveryOptionId,
        };
    if (!olderProposal) proposalAt.current = context.order_proposal_source_at ?? proposalAt.current;
    sourceAt.current = context.order_source_at ?? sourceAt.current;
    if (!changed) return;
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- reconcile new server context with merchant-owned fields
    setValues(result.values);
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- a new request supersedes the completed-order view
    setShowingCreatedOrder(false);
    setSuggestions(result.suggestions);
    setDiscarded(false);
    if (proposal && !olderProposal) {
      setSourceDraftId(proposal.draft_id);
      setOrigin('ai');
    }
    setEdited(true);
    setSaved(false);
  });
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- synchronize fresh server sources with the persistent preparation lifecycle
    reconcileContext();
  }, [context]);

  useEffect(() => {
    // A consumed preparation no longer carries an attempt; the order itself is now durable in context.
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- restore server-owned recovery state
    setRecoveryAttempt(stored?.creation_attempt ?? null);
  }, [stored?.creation_attempt]);

  useEffect(() => {
    if (!productId) return;
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- expand after a product is selected in the thread
    setExpanded(true);
  }, [productId]);

  useEffect(() => {
    if (!edited || discarded || discardBusy) return;
    const currentRevision = ++revision.current;
    const timer = window.setTimeout(() => {
      saveTimer.current = null;
      queue.current = {
        values,
        fields: merchantFields,
        revision: currentRevision,
        sourceDraftId,
        origin,
        reconciliation: {
          observed: toStored(observed.current),
          suggestions: Object.fromEntries(
            Object.entries(suggestions).map(([field, value]) => [field, toStored(value)]),
          ),
          source_at: sourceAt.current,
          proposal_at: proposalAt.current,
        },
      };
      if (saving.current) return;
      saving.current = true;
      setSaveState('saving');
      void (async () => {
        while (queue.current) {
          const write = queue.current;
          queue.current = null;
          const result = await call(() =>
            api.PUT('/v1/conversations/{conversation_id}/order-preparation', {
              params: { path: { conversation_id: conversationId } },
              body: {
                preparation_id: preparationId,
                expected_version: version.current,
                source_draft_id: write.sourceDraftId,
                origin: write.origin,
                merchant_fields: write.fields,
                values: toStored(write.values),
                reconciliation: write.reconciliation,
              },
            }),
          );
          if (!result.ok) {
            queue.current = null;
            setSaveState('failed');
            break;
          }
          version.current = result.data.version;
          if (write.revision === revision.current) {
            setSaveState('saved');
            setSaved(true);
          }
        }
        saving.current = false;
      })();
    }, 350);
    saveTimer.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (saveTimer.current === timer) saveTimer.current = null;
    };
  }, [
    conversationId,
    edited,
    merchantFields,
    origin,
    preparationId,
    sourceDraftId,
    values,
    suggestions,
    discarded,
    discardBusy,
  ]);

  const change = useCallback((next: FormValues, field: string, source?: 'default') => {
    setValues(next);
    // An automatic delivery default is not a merchant edit: it neither starts a draft nor owns the field.
    if (source === 'default') return;
    setEdited(true);
    setSaved(false);
    setMerchantFields((current) => (current.includes(field) ? current : [...current, field]));
  }, []);

  function decide(field: string, accept: boolean) {
    const suggestion = suggestions[field];
    if (!suggestion) return;
    if (accept) {
      setValues((current) => applyField(current, suggestion, field));
      setMerchantFields((current) => [...new Set([...current, field])]);
    }
    setSuggestions((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setEdited(true);
    setSaved(false);
  }

  function renderSuggestion(field: string, labels?: Record<string, string>): ReactNode {
    const suggestion = suggestions[field];
    if (!suggestion) return null;
    const line =
      suggestion.lines.find((line) => line.variantId === field.split('.')[1]) ??
      values.lines.find((line) => line.variantId === field.split('.')[1]);
    const label = field.startsWith('lines.')
      ? field.endsWith('.quantity')
        ? t('orders.form.quantityOf', { label: line?.label ?? '' })
        : (line?.label ?? t('inbox.order.field.items'))
      : t(
          `orders.form.${({ name: 'customerName', line: 'addressLine', deliveryOptionId: 'delivery' } as Record<string, string>)[field] ?? field}`,
        );
    return (
      <div
        role="group"
        aria-label={t('inbox.order.suggestionFor', { field: label })}
        className="mt-1 space-y-1 rounded-md bg-ai p-2 text-sm text-ai-ink"
      >
        <p className="break-words">
          {t('inbox.order.suggestion', {
            value: labels?.[suggestionText(suggestion, field)] ?? suggestionText(suggestion, field),
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <ActionButton size="sm" onClick={() => decide(field, true)}>
            {t('inbox.order.useSuggestion')}
          </ActionButton>
          <ActionButton size="sm" onClick={() => decide(field, false)}>
            {t('inbox.order.keepMine')}
          </ActionButton>
        </div>
      </div>
    );
  }

  async function discard() {
    if (!window.confirm(t('inbox.order.discardConfirm'))) return;
    setDiscardBusy(true);
    // Wait for an already issued save; the version it returns belongs to this same preparation.
    while (saving.current) await new Promise((resolve) => setTimeout(resolve, 20));
    queue.current = null;
    const result = await call(() =>
      api.POST('/v1/conversations/{conversation_id}/order-preparation/discard', {
        params: { path: { conversation_id: conversationId } },
        body: { preparation_id: preparationId, expected_version: version.current },
      }),
    );
    setDiscardBusy(false);
    if (!result.ok) {
      setSaveState('failed');
      return;
    }
    setDiscarded(true);
    setEdited(false);
    setSaved(true);
    setExpanded(false);
    setValues({ ...EMPTY_VALUES });
    observed.current = { ...EMPTY_VALUES };
    setSuggestions({});
    setMerchantFields([]);
    setSourceDraftId(null);
    setOrigin('manual');
    version.current = 0;
    setPreparationId(crypto.randomUUID());
  }

  async function persistAttempt(
    key: string,
    request: components['schemas']['OrderCreate'],
  ): Promise<boolean> {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    while (saving.current) await new Promise((resolve) => setTimeout(resolve, 20));
    const result = await call(() =>
      api.POST('/v1/conversations/{conversation_id}/order-preparation/attempt', {
        params: { path: { conversation_id: conversationId } },
        body: {
          idempotency_key: key,
          request,
          preparation: {
            preparation_id: preparationId,
            expected_version: version.current,
            source_draft_id: sourceDraftId,
            origin,
            merchant_fields: merchantFields,
            values: toStored(values),
            reconciliation: {
              observed: toStored(observed.current),
              suggestions: Object.fromEntries(
                Object.entries(suggestions).map(([field, value]) => [field, toStored(value)]),
              ),
              source_at: sourceAt.current,
              proposal_at: proposalAt.current,
            },
          },
        },
      }),
    );
    if (!result.ok) {
      setSaveState('failed');
      return false;
    }
    version.current = result.data.version;
    setRecoveryAttempt(result.data.creation_attempt ?? null);
    setSaveState('saved');
    setSaved(true);
    return true;
  }

  async function failedAttempt(unresolved: boolean): Promise<void> {
    if (unresolved) return;
    const result = await call(() =>
      api.POST('/v1/conversations/{conversation_id}/order-preparation/attempt/clear', {
        params: { path: { conversation_id: conversationId } },
        body: { preparation_id: preparationId, expected_version: version.current },
      }),
    );
    if (result.ok) {
      version.current = result.data.version;
      setRecoveryAttempt(null);
    } else {
      setSaveState('failed');
    }
  }

  async function recoverAttempt(): Promise<void> {
    if (!recoveryAttempt || recovering) return;
    setRecovering(true);
    const request = recoveryAttempt.request as components['schemas']['OrderCreate'];
    const result = await call(() =>
      api.POST('/v1/orders', {
        params: { header: { 'Idempotency-Key': recoveryAttempt.idempotency_key } },
        body: request,
      }),
    );
    setRecovering(false);
    if (result.ok) {
      savedRef.current = true;
      setRecoveryAttempt(null);
      setShowingCreatedOrder(true);
      onCreated(result.data);
      return;
    }
    if (isAmbiguousRequestFailure(result.error)) return;
    await failedAttempt(false);
    setSaveState('failed');
  }

  // The POST response fills the gap until context catches up. Afterwards the
  // server owns the card, including status changes made by another teammate.
  const displayedOrder =
    context.order_created && (!createdOrder || context.order_created.id === createdOrder.id)
      ? context.order_created
      : createdOrder;

  function startAnother(): void {
    savedRef.current = false;
    setValues({ ...EMPTY_VALUES, ...valuesFromProfile(profile) });
    setMerchantFields([]);
    setSuggestions({});
    observed.current = { ...EMPTY_VALUES, ...valuesFromProfile(profile) };
    setSourceDraftId(null);
    setOrigin('manual');
    setPreparationId(crypto.randomUUID());
    version.current = 0;
    setDiscarded(false);
    setEdited(true);
    setSaved(false);
    setExpanded(true);
    setRecoveryAttempt(null);
    setShowingCreatedOrder(false);
  }

  if (recoveryAttempt) {
    return (
      <div className="space-y-2">
        {displayedOrder && <CreatedOrderCard order={displayedOrder} />}
        <p role="status" className="text-ink-muted">
          {t('inbox.order.creationUnresolved')}
        </p>
        <ActionButton disabled={recovering} onClick={() => void recoverAttempt()}>
          {recovering ? t('inbox.order.recovering') : t('inbox.order.recover')}
        </ActionButton>
      </div>
    );
  }

  if (discarded)
    return (
      <div className="space-y-2">
        {displayedOrder && (
          <CreatedOrderCard order={displayedOrder} onStartAnother={startAnother} />
        )}
        <p>{t('inbox.order.discarded')}</p>
        <ActionButton
          onClick={() => {
            setDiscarded(false);
            setEdited(true);
            setSaved(false);
          }}
        >
          {t('inbox.order.startPreparation')}
        </ActionButton>
      </div>
    );

  if (showingCreatedOrder && displayedOrder)
    return <CreatedOrderCard order={displayedOrder} onStartAnother={startAnother} />;

  const phoneInvalid = values.phone.trim() !== '' && !validBangladeshPhone(values.phone);
  const national = nationalPhone(values.phone);
  // Name and phone that match the Customer section are said once there. The address is always
  // shown: it is where the parcel goes, and the Customer section may be collapsed.
  const sameName = values.name.trim() !== '' && sameText(values.name, customer.name ?? '');
  const samePhone =
    national !== null &&
    customer.phone_e164 != null &&
    national === nationalPhone(customer.phone_e164);
  const contactRows =
    sameName && samePhone
      ? [{ key: 'contact', value: t('inbox.order.sameAsCustomer'), muted: true }]
      : [
          { key: 'name', value: values.name.trim() },
          {
            key: 'phone',
            value: national ? formatPhone(`+880${national.slice(1)}`) : values.phone.trim(),
            mono: true,
          },
        ];
  const rows: { key: string; value: string; muted?: boolean; mono?: boolean }[] = [
    ...contactRows,
    { key: 'address', value: values.address.trim() },
    {
      key: 'items',
      value: values.lines.map((line) => `${line.label} × ${line.quantity}`).join(', '),
    },
  ];
  const missing = [
    ...(values.phone.trim() && !phoneInvalid ? [] : ['phone']),
    ...(values.address.trim() ? [] : ['address']),
    ...(values.lines.length ? [] : ['items']),
    ...(values.deliveryOptionId ? [] : ['delivery']),
  ];
  const draftId = sourceDraftId ?? undefined;

  return (
    <div className="space-y-3">
      {displayedOrder && <CreatedOrderCard order={displayedOrder} />}
      <LeaveGuard
        dirty={edited && !saved}
        bypass={savedRef}
        message={t('navigation.leaveUnsaved')}
      />
      <div className="flex flex-wrap items-center gap-2">
        {(origin === 'ai' || proposal) && (
          <span className="rounded-full bg-ai px-2 py-0.5 text-xs text-ai-ink">
            {t('inbox.order.suggested')}
          </span>
        )}
        <p className="text-xs text-ink-muted">{t('inbox.order.summaryHint')}</p>
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5">
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <dt className="text-ink-muted">{t(`inbox.panel.collected.${row.key}`)}</dt>
            <dd
              className={cx(
                'min-w-0 break-words',
                row.mono && row.value && 'font-mono',
                !row.value ? 'text-warn-ink' : row.muted ? 'text-ink-muted' : 'text-ink',
              )}
            >
              {row.value || t('inbox.panel.collected.missing')}
              {row.key === 'phone' && phoneInvalid && (
                <span className="ml-1 text-danger-ink">{t('inbox.order.phoneInvalid')}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {!expanded && quote === 'failed' && (
        <p className="text-xs text-ink-muted">{t('inbox.order.quoteFailed')}</p>
      )}
      {!expanded && quote && quote !== 'failed' && (
        <div
          aria-label={t('inbox.order.price')}
          role="group"
          className="rounded-md bg-panel-muted p-3"
        >
          <QuoteSummary quote={quote} />
        </div>
      )}
      {missing.length > 0 && (
        <p role="status" className="rounded-md bg-warn px-3 py-2 text-warn-ink">
          {t('inbox.order.missingCurrent', {
            fields: missing.map((field) => t(`inbox.order.field.${field}`)).join(', '),
          })}
        </p>
      )}
      {saveState === 'saving' && (
        <p role="status" className="text-xs text-ink-muted">
          {t('inbox.order.saving')}
        </p>
      )}
      {saveState === 'saved' && (
        <p role="status" className="text-xs text-ink-muted">
          {t('inbox.order.saved')}
        </p>
      )}
      {saveState === 'failed' && (
        <p role="alert" className="rounded-md bg-danger px-3 py-2 text-danger-ink">
          {t('inbox.order.saveFailed')}
        </p>
      )}
      <ActionButton size="sm" onClick={() => setExpanded((open) => !open)}>
        {expanded ? t('inbox.order.collapse') : t('inbox.order.review')}
      </ActionButton>
      <ActionButton size="sm" disabled={discardBusy} onClick={() => void discard()}>
        {t('inbox.order.discard')}
      </ActionButton>
      {expanded && (
        <fieldset disabled={discardBusy}>
          <OrderForm
            initial={values}
            controlledValues={values}
            renderSuggestion={renderSuggestion}
            suggestionFields={Object.keys(suggestions)}
            conversationId={conversationId}
            draftId={draftId}
            preparationId={preparationId}
            customerId={customer.id}
            addProductId={productId}
            onAddProductDone={onProductUsed}
            onValuesChange={change}
            onBeforeCreate={persistAttempt}
            onCreateFailed={failedAttempt}
            active={expanded}
            checkAvailability
            onCreated={(order) => {
              savedRef.current = true;
              setRecoveryAttempt(null);
              setShowingCreatedOrder(true);
              onCreated(order);
            }}
          />
        </fieldset>
      )}
    </div>
  );
}

function CreatedOrderCard({
  order,
  onStartAnother,
}: {
  order: Pick<Order, 'id' | 'number' | 'status' | 'total_minor' | 'currency'>;
  onStartAnother?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded-lg border border-line bg-panel-muted p-3">
      <p role="status" className="font-medium text-ink">
        {t('inbox.order.createdCard', {
          number: order.number,
          status: t(`orders.status.${order.status}`),
          total: formatBDT(order.total_minor),
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          to={`/orders/${order.id}`}
          className="inline-flex items-center rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:bg-panel"
        >
          {t('inbox.order.view')}
        </Link>
        {onStartAnother && (
          <ActionButton size="sm" onClick={onStartAnother}>
            {t('inbox.order.startAnother')}
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function fromStored(
  values: NonNullable<ConversationContext['order_preparation']>['values'],
): FormValues {
  return {
    lines: values.lines.map((line) => ({
      variantId: line.variant_id,
      productId: line.product_id ?? undefined,
      label: line.label,
      quantity: line.quantity,
    })),
    name: values.name,
    phone: values.phone,
    address: values.address,
    district: values.district,
    area: values.area,
    areaCustom: values.area_custom,
    line: values.line,
    deliveryOptionId: values.delivery_option_id,
    notes: values.notes,
    couponCode: values.coupon_code ?? '',
  };
}

function toStored(values: FormValues) {
  return {
    lines: values.lines.map((line) => ({
      variant_id: line.variantId,
      product_id: line.productId ?? null,
      label: line.label,
      quantity: line.quantity,
    })),
    name: values.name,
    phone: values.phone,
    address: values.address,
    district: values.district,
    area: values.area,
    area_custom: values.areaCustom,
    line: values.line,
    delivery_option_id: values.deliveryOptionId,
    notes: values.notes,
    coupon_code: values.couponCode,
  };
}

function validBangladeshPhone(raw: string): boolean {
  return nationalPhone(raw) !== null;
}

/** A Bangladesh mobile number as `01XXXXXXXXX`, however it was written; null when it is not one. */
function nationalPhone(raw: string): string | null {
  const digits = raw
    .replace(/[০-৯]/g, (digit) => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)))
    .replace(/[\s\-().]/g, '');
  let national = digits.replace(/^\+/, '').replace(/^00/, '');
  if (national.startsWith('880')) national = `0${national.slice(3)}`;
  return /^01[3-9]\d{8}$/.test(national) ? national : null;
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The server's price for the draft while the review form is closed, so the merchant can check the
 * total, delivery fee and advance against the AI's reply without opening it. The open form quotes
 * on its own. It prices for the conversation's customer; the form prices for whoever owns the
 * typed phone, so an advance asked of one customer can differ until the form is opened.
 */
function useCollapsedQuote(
  values: FormValues,
  customerId: string | null,
  active: boolean,
): OrderQuote | 'failed' | null {
  const [quote, setQuote] = useState<OrderQuote | 'failed' | null>(null);
  const items = quoteItems(values.lines);
  const itemsKey = JSON.stringify(items);
  const optionId = values.deliveryOptionId;
  useEffect(() => {
    if (!active || !items || !optionId) {
      // oxlint-disable-next-line react-hooks/set-state-in-effect -- nothing to price while open or incomplete
      setQuote(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void call(() =>
        api.POST('/v1/orders/quote', {
          body: {
            items,
            delivery_option_id: optionId,
            customer_id: customerId,
            coupon_code: values.couponCode.trim() || null,
          },
        }),
      ).then((result) => {
        if (!cancelled) setQuote(result.ok ? result.data : 'failed');
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `items` is derived from `values.lines`; `itemsKey` stands in for it.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, itemsKey, optionId, customerId, values.couponCode]);
  return quote;
}

function formField(field: string): string {
  return field
    .replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
    .replace(/\.removed$/, '');
}
