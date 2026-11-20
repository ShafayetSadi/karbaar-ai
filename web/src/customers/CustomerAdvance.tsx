import { Wallet } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import { ActionButton, Section, cx, fieldClass } from '../components/ui';
import { formatBDT, parseTaka } from '../i18n/format';

const POLICIES = ['', 'delivery_fee', 'fixed', 'full'] as const;
type Policy = (typeof POLICIES)[number];

/**
 * Ask this customer for an advance on every order: the delivery fee, a fixed amount or
 * the full price. The quote and the AI then ask for that amount; neither the customer nor the AI
 * is told it is about them. `onChanged` runs after a save, so the caller can price again.
 */
export function CustomerAdvance({
  customerId,
  onChanged,
  storageKey = 'inbox.panel.advance',
}: {
  customerId: string;
  onChanged?: () => void;
  storageKey?: string;
}) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState<{ policy: Policy; fixed: number | null } | null>(null);
  const [policy, setPolicy] = useState<Policy>('');
  const [amount, setAmount] = useState('');
  const [amountProblem, setAmountProblem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const show = useCallback((next: { policy: Policy; fixed: number | null }) => {
    setSaved(next);
    setPolicy(next.policy);
    setAmount(next.fixed ? String(next.fixed / 100) : '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    void call(() =>
      api.GET('/v1/customers/{customer_id}', { params: { path: { customer_id: customerId } } }),
    ).then((result) => {
      if (!cancelled && result.ok) {
        show({ policy: result.data.advance_policy ?? '', fixed: result.data.advance_fixed_minor });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [customerId, show]);

  async function save(event: FormEvent) {
    event.preventDefault();
    let fixed: number | null = null;
    if (policy === 'fixed') {
      fixed = parseTaka(amount);
      if (fixed === null || fixed <= 0) {
        setAmountProblem(true);
        return;
      }
    }
    setAmountProblem(false);
    setBusy(true);
    setError(null);
    const result = await call(() =>
      api.PUT('/v1/customers/{customer_id}/advance', {
        params: { path: { customer_id: customerId } },
        body: { policy: policy || null, fixed_minor: fixed },
      }),
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    show({ policy: result.data.advance_policy ?? '', fixed: result.data.advance_fixed_minor });
    onChanged?.();
  }

  if (!saved) return null;
  const changed =
    policy !== saved.policy || (policy === 'fixed' && parseTaka(amount) !== saved.fixed);
  return (
    <Section
      title={t('customers.advance.title')}
      icon={Wallet}
      summary={
        saved.policy
          ? saved.policy === 'fixed' && saved.fixed
            ? formatBDT(saved.fixed)
            : t(`customers.advance.policy.${saved.policy}`)
          : t('customers.advance.followsProducts')
      }
      storageKey={storageKey}
    >
      <form onSubmit={(e) => void save(e)} className="space-y-2">
        <label className="block font-medium text-ink-muted">
          {t('customers.advance.label')}
          <select
            value={policy}
            onChange={(e) => setPolicy(e.target.value as Policy)}
            className={cx('mt-1 block w-full', fieldClass)}
          >
            {POLICIES.map((value) => (
              <option key={value} value={value}>
                {t(`customers.advance.policy.${value || 'none'}`)}
              </option>
            ))}
          </select>
        </label>
        {policy === 'fixed' && (
          <label className="block font-medium text-ink-muted">
            {t('customers.advance.amount')}
            <input
              value={amount}
              inputMode="decimal"
              onChange={(e) => setAmount(e.target.value)}
              className={cx('mt-1 block w-full', fieldClass)}
            />
            {amountProblem && (
              <span role="alert" className="mt-1 block font-normal text-danger-ink">
                {t('customers.advance.amountProblem')}
              </span>
            )}
          </label>
        )}
        <p className="text-xs text-ink-faint">{t('customers.advance.hint')}</p>
        {error && (
          <p role="alert" className="rounded-md bg-danger px-3 py-2 text-danger-ink">
            {error.message}
          </p>
        )}
        {changed && (
          <ActionButton type="submit" size="sm" tone="primary" disabled={busy}>
            {busy ? t('common.pleaseWait') : t('customers.advance.save')}
          </ActionButton>
        )}
      </form>
    </Section>
  );
}
