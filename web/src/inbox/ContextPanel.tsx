import {
  ClipboardList,
  TriangleAlert,
  Compass,
  MessageCircle,
  Pencil,
  Phone,
  ArrowUpRight,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { call } from '../api/call';
import { ActionButton, IconButton, Section, actionButtonClass } from '../components/ui';
import { formatPhone } from '../i18n/format';
import type { Order } from '../orders/orderForm';
import type { Conversation } from './InboxPage';
import { CustomerDetails } from './CustomerDetails';
import { FollowUps } from './FollowUps';
import { CustomerAdvance } from '../customers/CustomerAdvance';
import { CustomerOrders } from '../customers/CustomerOrders';
import { OrderPanel } from './OrderPanel';
import { TeamNote } from '../customers/TeamNote';
import { type ConversationUpdate } from './ThreadHeader';
import { useUrlPanel } from '../navigation/useUrlPanel';
import type { ConversationContext } from './useConversationContext';

export function ContextPanel({
  conversation,
  context,
  failed,
  onChanged,
  onReload,
  onCustomerSaved,
  orderProductId = null,
  onOrderProductUsed,
}: {
  conversation: Conversation;
  context: ConversationContext | null;
  failed: boolean;
  onChanged: (updated: Conversation) => void;
  /** Refetch the context: an order was created or the team note changed. */
  onReload: () => void;
  onCustomerSaved: () => void;
  /** A product to put on the order form (from a card's "+ Order"), until `onOrderProductUsed`. */
  orderProductId?: string | null;
  onOrderProductUsed?: () => void;
}) {
  const { t } = useTranslation();
  const id = conversation.id;
  // Bumped when an order is created here, so the customer's order list picks it up.
  const [ordersVersion, setOrdersVersion] = useState(0);
  const [created, setCreated] = useState<Order | null>(null);
  const [editingCustomer, setEditingCustomer] = useUrlPanel('customer');

  async function patch(body: ConversationUpdate) {
    const result = await call(() =>
      api.PATCH('/v1/conversations/{conversation_id}', {
        params: { path: { conversation_id: id } },
        body,
      }),
    );
    if (result.ok) onChanged(result.data);
  }

  function orderCreated(order: Order) {
    setCreated(order);
    setOrdersVersion((n) => n + 1);
    onReload();
  }

  const customer = context?.customer;
  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- the selected conversation changed
    setCreated(null);
  }, [id]);
  const origin = context?.origin ?? {};
  const originKeys = Object.keys(origin);

  return (
    <aside aria-label={t('inbox.customerPanel')} className="text-sm">
      {failed && (
        <p role="alert" className="m-4 rounded-md bg-danger px-3 py-2 text-danger-ink">
          {t('inbox.contextFailed')}
        </p>
      )}

      {conversation.needs_human && (
        <Section
          title={t('inbox.panel.escalation')}
          icon={TriangleAlert}
          storageKey="inbox.panel.escalation"
        >
          <div role="note" className="rounded-md bg-warn p-3 text-warn-ink">
            <p className="font-medium">{t('inbox.escalatedTitle')}</p>
            {conversation.escalation_reason && (
              <p className="mt-1">{t(`inbox.escalation.${conversation.escalation_reason}`)}</p>
            )}
          </div>
          <ActionButton
            size="sm"
            className="mt-2"
            onClick={() => void patch({ needs_human: false })}
          >
            {t('inbox.clearNeedsHuman')}
          </ActionButton>
        </Section>
      )}
      {customer?.phone_e164 && <ContactStrip phone={customer.phone_e164} />}

      {customer && <TeamNote customer={customer} onSaved={onReload} />}

      {/* The order comes straight after the note: it is what the chat is for. */}
      {context && customer && (
        <Section title={t('inbox.order.title')} icon={ClipboardList} storageKey="inbox.panel.order">
          <OrderPanel
            key={id}
            conversationId={id}
            context={context}
            onCreated={orderCreated}
            createdOrder={created}
            productId={orderProductId}
            onProductUsed={onOrderProductUsed}
          />
        </Section>
      )}

      <Section
        title={t('inbox.customer')}
        icon={UserRound}
        storageKey="inbox.panel.customer"
        forceOpen={editingCustomer}
        action={
          customer && !editingCustomer ? (
            <IconButton
              icon={Pencil}
              label={t('inbox.customerEdit.edit')}
              onClick={() => setEditingCustomer(true)}
              className="size-7 border-transparent bg-transparent"
            />
          ) : undefined
        }
      >
        <CustomerDetails
          fallbackName={conversation.customer_name}
          customer={customer}
          noted={context?.customer_details}
          editing={editingCustomer}
          onEditingChange={setEditingCustomer}
          onSaved={onCustomerSaved}
        />
      </Section>

      {customer && (
        <CustomerOrders customerId={customer.id} refresh={ordersVersion}>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/orders"
              className="inline-flex items-center gap-1 text-xs text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              {t('inbox.panel.openOrders')}
              <ArrowUpRight aria-hidden className="size-3" />
            </Link>
          </div>
        </CustomerOrders>
      )}

      {customer && <CustomerAdvance customerId={customer.id} />}

      {context && <FollowUps conversation={conversation} followUp={context.follow_up} />}

      {originKeys.length > 0 && (
        <Section
          title={t('inbox.origin')}
          icon={Compass}
          defaultOpen={false}
          storageKey="inbox.panel.origin"
        >
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
            {originKeys.map((key) => (
              <div key={key} className="contents">
                <dt className="text-xs text-ink-faint">{key}</dt>
                <dd className="break-words text-ink">{String(origin[key])}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
    </aside>
  );
}

/** Call or WhatsApp the customer. The number is already E.164 (`+8801…`). */
function ContactStrip({ phone }: { phone: string }) {
  const { t } = useTranslation();
  const display = formatPhone(phone);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
      <a
        href={`tel:${phone}`}
        title={t('inbox.panel.call', { phone: display })}
        className="inline-flex items-center gap-1.5 font-mono text-sm text-ink hover:underline"
      >
        <Phone aria-hidden className="size-3.5" />
        {display}
      </a>
      <a
        href={`https://wa.me/${phone.replace(/^\+/, '')}`}
        target="_blank"
        rel="noopener noreferrer"
        className={actionButtonClass({ size: 'sm' })}
      >
        <MessageCircle aria-hidden className="size-3.5" />
        {t('inbox.panel.whatsapp')}
      </a>
    </div>
  );
}
