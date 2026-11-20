import { ArrowDown, ArrowUp, Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import { ActionButton, Chip, FormError, IconButton, cx, fieldClass } from '../components/ui';
import { formatPhone } from '../i18n/format';
import { Hint, SectionCard } from '../knowledge/parts';
import type { PaymentAccount } from '../knowledge/shopInfo';

type Method = PaymentAccount['method'];
type Kind = NonNullable<PaymentAccount['account_kind']>;

const METHODS: Method[] = ['bkash', 'nagad', 'rocket', 'bank'];
const KINDS: Kind[] = ['personal', 'merchant', 'agent'];

interface Form {
  /** The account being edited; null adds a new one. */
  id: string | null;
  method: Method;
  kind: Kind;
  number: string;
  details: string;
  note: string;
}

const NEW_FORM: Form = {
  id: null,
  method: 'bkash',
  kind: 'personal',
  number: '',
  details: '',
  note: '',
};

export function PaymentSection({
  accounts,
  onAccountsChanged,
  canEdit,
  set,
  highlighted,
}: {
  accounts: PaymentAccount[];
  /** Called after each saved change to the list, so the page can refresh what the AI will say. */
  onAccountsChanged: (accounts: PaymentAccount[]) => void;
  canEdit: boolean;
  set: number;
  highlighted: boolean;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const isBank = form?.method === 'bank';

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    const fields = {
      account_kind: isBank ? null : form.kind,
      number: isBank ? null : form.number.trim() || null,
      details: isBank ? form.details.trim() || null : null,
      note: form.note.trim() || null,
    };
    const result = form.id
      ? await call(() =>
          api.PATCH('/v1/shop-info/payment-accounts/{account_id}', {
            params: { path: { account_id: form.id as string } },
            body: fields,
          }),
        )
      : await call(() =>
          api.POST('/v1/shop-info/payment-accounts', { body: { method: form.method, ...fields } }),
        );
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setForm(null);
    onAccountsChanged(
      form.id
        ? accounts.map((a) => (a.id === form.id ? result.data : a))
        : [...accounts, result.data],
    );
  }

  async function remove(account: PaymentAccount) {
    setError(null);
    const result = await call(() =>
      api.DELETE('/v1/shop-info/payment-accounts/{account_id}', {
        params: { path: { account_id: account.id } },
      }),
    );
    if (!result.ok) return setError(result.error);
    onAccountsChanged(accounts.filter((a) => a.id !== account.id));
  }

  async function move(index: number, by: -1 | 1) {
    const order = [...accounts];
    const moved = order[index];
    const other = order[index + by];
    if (!moved || !other) return;
    order[index] = other;
    order[index + by] = moved;
    setError(null);
    const result = await call(() =>
      api.PUT('/v1/shop-info/payment-accounts/order', { body: { ids: order.map((a) => a.id) } }),
    );
    if (!result.ok) return setError(result.error);
    onAccountsChanged(result.data);
  }

  function describe(account: PaymentAccount) {
    return account.method === 'bank'
      ? (account.details ?? '')
      : account.number
        ? formatPhone(account.number)
        : '';
  }

  return (
    <SectionCard
      id="payment"
      title={t('knowledge.payment.title')}
      hint={t('knowledge.payment.hint')}
      set={set}
      total={1}
      highlighted={highlighted}
    >
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-ink">{t('knowledge.payment.accounts')}</h3>
        <ul
          className={cx(
            'divide-y divide-line rounded-lg border-line',
            accounts.length > 0 && 'border',
          )}
        >
          {accounts.map((account, index) => (
            <li
              key={account.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4 text-sm"
            >
              <span className="font-medium text-ink">
                {t(`knowledge.payment.method.${account.method}`)}
              </span>
              <span className="min-w-0 basis-full break-words font-mono text-ink sm:basis-auto">
                {describe(account)}
              </span>
              {account.account_kind && (
                <Chip>{t(`knowledge.payment.kind.${account.account_kind}`)}</Chip>
              )}
              {account.note && (
                <span className="min-w-0 basis-full break-words text-ink-muted">
                  “{account.note}”
                </span>
              )}
              {canEdit && (
                <span className="flex w-full items-center justify-end gap-1 border-t border-line pt-2 sm:ml-auto sm:w-auto sm:border-0 sm:pt-0">
                  <IconButton
                    icon={ArrowUp}
                    label={t('knowledge.payment.moveUp', { name: describe(account) })}
                    disabled={index === 0}
                    onClick={() => void move(index, -1)}
                  />
                  <IconButton
                    icon={ArrowDown}
                    label={t('knowledge.payment.moveDown', { name: describe(account) })}
                    disabled={index === accounts.length - 1}
                    onClick={() => void move(index, 1)}
                  />
                  <IconButton
                    icon={Pencil}
                    label={t('knowledge.payment.edit', { name: describe(account) })}
                    onClick={() => {
                      setError(null);
                      setForm({
                        id: account.id,
                        method: account.method,
                        kind: account.account_kind ?? 'personal',
                        number: account.number ? formatPhone(account.number) : '',
                        details: account.details ?? '',
                        note: account.note ?? '',
                      });
                    }}
                  />
                  <IconButton
                    icon={X}
                    label={t('knowledge.payment.remove', { name: describe(account) })}
                    onClick={() => void remove(account)}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
        <FormError error={error} />

        {form ? (
          <div className="space-y-4 rounded-lg border border-line bg-panel-muted/40 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-ink">
                {t('knowledge.payment.methodLabel')}
                <select
                  value={form.method}
                  disabled={form.id !== null}
                  onChange={(e) => setForm({ ...form, method: e.target.value as Method })}
                  className={cx('mt-1 block w-full', fieldClass)}
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(`knowledge.payment.method.${m}`)}
                    </option>
                  ))}
                </select>
              </label>
              {isBank ? (
                <label className="text-sm font-medium text-ink sm:col-span-2">
                  {t('knowledge.payment.details')}
                  <textarea
                    value={form.details}
                    rows={2}
                    maxLength={200}
                    onChange={(e) => setForm({ ...form, details: e.target.value })}
                    placeholder={t('knowledge.payment.detailsPlaceholder')}
                    className={cx('mt-1 block w-full', fieldClass)}
                  />
                </label>
              ) : (
                <>
                  <label className="text-sm font-medium text-ink">
                    {t('knowledge.payment.number')}
                    <input
                      value={form.number}
                      inputMode="tel"
                      onChange={(e) => setForm({ ...form, number: e.target.value })}
                      placeholder="01712-345678"
                      className={cx('mt-1 block w-full', fieldClass)}
                    />
                  </label>
                  <label className="text-sm font-medium text-ink">
                    {t('knowledge.payment.kindLabel')}
                    <select
                      value={form.kind}
                      onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}
                      className={cx('mt-1 block w-full', fieldClass)}
                    >
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {t(`knowledge.payment.kind.${k}`)}
                        </option>
                      ))}
                    </select>
                    <Hint>{t('knowledge.payment.kindHint')}</Hint>
                  </label>
                </>
              )}
              <label className="text-sm font-medium text-ink sm:col-span-2">
                {t('knowledge.payment.note')}
                <input
                  value={form.note}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder={t('knowledge.payment.notePlaceholder')}
                  className={cx('mt-1 block w-full', fieldClass)}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <ActionButton tone="primary" disabled={busy} onClick={() => void save()}>
                {t('knowledge.payment.saveAccount')}
              </ActionButton>
              <ActionButton disabled={busy} onClick={() => setForm(null)}>
                {t('common.cancel')}
              </ActionButton>
            </div>
          </div>
        ) : (
          canEdit && (
            <ActionButton
              icon={Plus}
              onClick={() => {
                setError(null);
                setForm(NEW_FORM);
              }}
            >
              {t('knowledge.payment.add')}
            </ActionButton>
          )
        )}
      </div>
    </SectionCard>
  );
}
