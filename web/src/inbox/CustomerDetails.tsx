import { LeaveGuard } from '../navigation/LeaveGuard';
import { Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { ApiError } from '../api/errors';
import { ActionButton, Field, cx, fieldClass } from '../components/ui';
import { formatPhone, languageName } from '../i18n/format';
import type { ConversationContext } from './useConversationContext';

type Customer = ConversationContext['customer'];
type Noted = ConversationContext['customer_details'];
type Gender = 'male' | 'female';

/** What the shop may store as a gender, with '' for "not known" (ADR 0052). */
const GENDERS = ['', 'male', 'female'] as const;

/** The translation key for a stored gender; anything else reads as "not known". */
function genderKey(gender: string | null | undefined): string {
  return gender === 'male' || gender === 'female' ? gender : 'unknown';
}

/**
 * Who the customer is: name, phone, delivery address and how to address them, which the merchant
 * can correct or fill in while reading the chat. Saving goes through the customers API, which
 * validates the phone number and keeps it unique per merchant; nothing is checked here beyond what
 * the form needs to send. Gender is here because it decides whether the AI says আপু or ভাইয়া: when
 * Messenger's profile has it wrong, this is where it gets fixed, and "not known" is a real answer
 * that leaves the AI using no such word at all.
 */
function EditForm({
  customer,
  address,
  onDone,
  onSaved,
}: {
  customer: NonNullable<Customer>;
  address: Customer['addresses'][number] | undefined;
  onDone: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState({
    name: customer.name ?? '',
    phone: customer.phone_e164 ?? '',
    address: address?.raw_text ?? '',
    gender: (customer.gender ?? '') as '' | Gender,
  });
  const [original] = useState(values);
  const saved = useRef(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(original);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!customer) return;
    setBusy(true);
    setError(null);
    const name = values.name.trim();
    const phone = values.phone.trim();
    const text = values.address.trim();

    // Only what changed is sent, so saving one field never overwrites another edited elsewhere.
    const profile: { name?: string | null; phone?: string | null; gender?: Gender | null } = {};
    if (name !== (customer.name ?? '')) profile.name = name || null;
    if (phone !== (customer.phone_e164 ?? '')) profile.phone = phone || null;
    if (values.gender !== (customer.gender ?? '')) profile.gender = values.gender || null;
    let changed = false;
    if (Object.keys(profile).length > 0) {
      const result = await call(() =>
        api.PATCH('/v1/customers/{customer_id}', {
          params: { path: { customer_id: customer.id } },
          body: profile,
        }),
      );
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      changed = true;
    }

    if (text !== (address?.raw_text ?? '')) {
      const path = { customer_id: customer.id };
      const result = await call(() => {
        if (address && text) {
          return api.PATCH('/v1/customers/{customer_id}/addresses/{address_id}', {
            params: { path: { ...path, address_id: address.id } },
            body: { raw_text: text },
          });
        }
        if (address) {
          return api.DELETE('/v1/customers/{customer_id}/addresses/{address_id}', {
            params: { path: { ...path, address_id: address.id } },
          });
        }
        return api.POST('/v1/customers/{customer_id}/addresses', {
          params: { path },
          body: { raw_text: text, is_default: true },
        });
      });
      if (!result.ok) {
        // The profile part may already be saved: refresh so the panel shows the truth.
        if (changed) onSaved();
        setError(result.error);
        setBusy(false);
        return;
      }
      changed = true;
    }

    setBusy(false);
    saved.current = true;
    onDone();
    if (changed) onSaved();
  }

  const failure = error
    ? error.code === 'CUSTOMER_PHONE_EXISTS'
      ? t('inbox.customerEdit.phoneTaken')
      : error.message
    : null;

  return (
    <form
      aria-label={t('inbox.customerEdit.title')}
      onSubmit={(e) => void save(e)}
      className="space-y-3"
    >
      <LeaveGuard
        ignoreParams={['menu', 'order', 'image']}
        dirty={dirty}
        bypass={saved}
        message={t('navigation.leaveUnsaved')}
      />
      <Field
        label={t('inbox.name')}
        value={values.name}
        maxLength={200}
        onChange={(e) => setValues({ ...values, name: e.target.value })}
      />
      <Field
        label={t('inbox.phone')}
        type="tel"
        inputMode="tel"
        placeholder="01XXXXXXXXX"
        value={values.phone}
        onChange={(e) => setValues({ ...values, phone: e.target.value })}
      />
      <Field
        label={t('inbox.address')}
        value={values.address}
        maxLength={1000}
        onChange={(e) => setValues({ ...values, address: e.target.value })}
      />
      <div>
        {/* The hint sits outside the label, so the select's accessible name stays "Gender". */}
        <label className="block text-sm font-medium text-ink-muted">
          {t('inbox.gender')}
          <select
            value={values.gender}
            onChange={(e) => setValues({ ...values, gender: e.target.value as '' | Gender })}
            className={cx('mt-1 block w-full', fieldClass)}
          >
            {GENDERS.map((value) => (
              <option key={genderKey(value)} value={value}>
                {t(`inbox.genderValue.${genderKey(value)}`)}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-sm text-ink-faint">{t('inbox.genderHint')}</p>
      </div>
      {failure && (
        <p role="alert" className="rounded-md bg-danger px-3 py-2 text-danger-ink">
          {failure}
        </p>
      )}
      <div className="flex gap-1.5">
        <ActionButton type="submit" size="sm" tone="primary" disabled={busy}>
          {busy ? t('common.pleaseWait') : t('inbox.customerEdit.save')}
        </ActionButton>
        <ActionButton size="sm" tone="ghost" disabled={busy} onClick={onDone}>
          {t('inbox.customerEdit.cancel')}
        </ActionButton>
      </div>
    </form>
  );
}

type Suggestions = { name: string | null; phone: string | null; address: string | null };

/**
 * What the AI noted from the chat that the customer record does not have yet: a name when the
 * record has none, a phone that differs from the saved one, and an address none of the saved ones
 * already is. Nothing here is saved until the merchant says so.
 */
function suggestionsFor(customer: Customer | undefined, noted: Noted | undefined): Suggestions {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const address = noted?.address_raw?.trim() || null;
  return {
    name: customer && !customer.name && noted?.name ? noted.name : null,
    phone:
      customer && noted?.phone_e164 && noted.phone_e164 !== customer.phone_e164
        ? noted.phone_e164
        : null,
    address:
      customer && address && !customer.addresses.some((a) => same(a.raw_text, address))
        ? address
        : null,
  };
}

/** One value the customer gave in the chat, with a button that saves it to the customer. */
function FromChat({
  field,
  value,
  mono = false,
  onSave,
}: {
  field: string;
  value: string;
  mono?: boolean;
  onSave: () => Promise<ApiError | null>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const failed = await onSave();
    setError(failed);
    setBusy(false);
  }

  return (
    <span className="mt-1 block rounded-md border border-ai-ink/25 bg-ai/60 px-2 py-1.5">
      <span className="flex items-center gap-1 text-xs font-semibold text-ai-ink">
        <Sparkles aria-hidden className="size-3" />
        {t('inbox.customerEdit.fromChat')}
      </span>
      <span className={cx('block break-words text-ink', mono && 'font-mono')}>{value}</span>
      <ActionButton
        size="sm"
        tone="soft-ok"
        className="mt-1"
        disabled={busy}
        aria-label={t('inbox.customerEdit.saveFromChat', { field })}
        onClick={() => void save()}
      >
        {busy ? t('common.pleaseWait') : t('inbox.customerEdit.save')}
      </ActionButton>
      {error && (
        <span role="alert" className="mt-1 block text-danger-ink">
          {error.code === 'CUSTOMER_PHONE_EXISTS'
            ? t('inbox.customerEdit.phoneTaken')
            : error.message}
        </span>
      )}
    </span>
  );
}

export function CustomerDetails({
  fallbackName,
  customer,
  noted,
  editing,
  onEditingChange,
  onSaved,
}: {
  /** The conversation's name for them, shown until the customer record has loaded. */
  fallbackName: string | null;
  customer: Customer | undefined;
  /** The name, phone and address the AI noted from the chat, offered for saving. */
  noted?: Noted;
  /** The edit form is open; the pencil in the section header toggles it. */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const address = customer?.addresses.find((a) => a.is_default) ?? customer?.addresses[0];
  const suggested = suggestionsFor(customer, noted);

  async function saveProfile(body: { name?: string; phone?: string }): Promise<ApiError | null> {
    if (!customer) return null;
    const result = await call(() =>
      api.PATCH('/v1/customers/{customer_id}', {
        params: { path: { customer_id: customer.id } },
        body,
      }),
    );
    if (!result.ok) return result.error;
    onSaved();
    return null;
  }

  async function saveAddress(): Promise<ApiError | null> {
    if (!customer || !noted?.address_raw) return null;
    // The parts as the AI structured them; the server checks the district and area again.
    const result = await call(() =>
      api.POST('/v1/customers/{customer_id}/addresses', {
        params: { path: { customer_id: customer.id } },
        body: {
          raw_text: noted.address_raw ?? '',
          district: noted.district,
          area: noted.area ?? null,
          line: noted.address_line ?? null,
          is_default: true,
        },
      }),
    );
    if (!result.ok) return result.error;
    onSaved();
    return null;
  }

  if (editing && customer) {
    return (
      <EditForm
        customer={customer}
        address={address}
        onDone={() => onEditingChange(false)}
        onSaved={onSaved}
      />
    );
  }

  return (
    <div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5">
        <dt className="text-ink-faint">{t('inbox.name')}</dt>
        <dd className="text-ink">
          {customer?.name ?? fallbackName ?? t('inbox.unknownCustomer')}
          {suggested.name && (
            <FromChat
              field={t('inbox.name')}
              value={suggested.name}
              onSave={() => saveProfile({ name: suggested.name ?? undefined })}
            />
          )}
        </dd>
        <dt className="text-ink-faint">{t('inbox.phone')}</dt>
        <dd className="text-ink">
          <span className="font-mono">
            {customer?.phone_e164 ? formatPhone(customer.phone_e164) : t('inbox.none')}
          </span>
          {suggested.phone && (
            <FromChat
              field={t('inbox.phone')}
              value={formatPhone(suggested.phone)}
              mono
              onSave={() => saveProfile({ phone: suggested.phone ?? undefined })}
            />
          )}
        </dd>
        <dt className="text-ink-faint">{t('inbox.address')}</dt>
        <dd className="break-words text-ink">
          {address?.raw_text ?? t('inbox.none')}
          {address?.district && !sameAddress(structured(address), address.raw_text) && (
            <span className="block text-ink-muted">{structured(address)}</span>
          )}
          {suggested.address && (
            <FromChat field={t('inbox.address')} value={suggested.address} onSave={saveAddress} />
          )}
        </dd>
        {customer && (
          <>
            <dt className="text-ink-faint">{t('inbox.gender')}</dt>
            <dd className="text-ink">{t(`inbox.genderValue.${genderKey(customer.gender)}`)}</dd>
          </>
        )}
        {customer?.locale && (
          <>
            <dt className="text-ink-faint">{t('inbox.language')}</dt>
            <dd className="text-ink">{languageName(customer.locale, i18n.language)}</dd>
          </>
        )}
        {customer?.first_seen_channel && (
          <>
            <dt className="text-ink-faint">{t('inbox.firstSeen')}</dt>
            <dd className="text-ink">
              {t(`inbox.channel.${customer.first_seen_channel}`, {
                defaultValue:
                  customer.first_seen_channel === 'storefront'
                    ? 'Website'
                    : customer.first_seen_channel,
              })}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

/** The address as read into line, area and district, which is often just the raw text again. */
function structured(address: Customer['addresses'][number]): string {
  return [address.line, address.area, address.district].filter(Boolean).join(', ');
}

/** The same address apart from case, spacing and punctuation between the parts. */
function sameAddress(a: string, b: string): boolean {
  const norm = (text: string) =>
    text
      .toLowerCase()
      .replace(/[\s,.\-–/]+/g, ' ')
      .trim();
  return norm(a) === norm(b);
}
