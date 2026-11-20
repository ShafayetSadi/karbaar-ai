import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import type { components } from '../api/schema';
import { ActionButton, Chip } from '../components/ui';
import { formatDateTime } from '../i18n/format';
import {
  currentBrowserState,
  deviceLabel,
  subscribeThisBrowser,
  unsubscribeThisBrowser,
  type BrowserState,
} from './browser';

type Device = components['schemas']['PushDeviceRead'];
type AlertSwitch = 'push_on_draft' | 'push_on_escalation' | 'push_on_assignment';
const ALERT_SWITCHES: { name: AlertSwitch; label: string; hint: string }[] = [
  { name: 'push_on_draft', label: 'phoneAlerts.onDraft', hint: 'phoneAlerts.onDraftHint' },
  {
    name: 'push_on_escalation',
    label: 'phoneAlerts.onEscalation',
    hint: 'phoneAlerts.onEscalationHint',
  },
  {
    name: 'push_on_assignment',
    label: 'phoneAlerts.onAssignment',
    hint: 'phoneAlerts.onAssignmentHint',
  },
];
type Notice =
  | 'enabled'
  | 'denied'
  | 'dismissed'
  | 'failed'
  | 'conflict'
  | 'rateLimited'
  | 'testSent'
  | 'testFailed';

/**
 * Phone alerts for this member. Nothing here asks the browser for permission until the
 * person presses Turn on; every other state only explains what is missing. The list is the
 * member's own devices, and a device whose sign-in ended shows as off until it is turned on again.
 */
export function PhoneAlerts() {
  const { t } = useTranslation();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [browser, setBrowser] = useState<BrowserState>(() => currentBrowserState());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // The personal switches; null until loaded (and while they cannot be, the switches are hidden).
  const [switches, setSwitches] = useState<Record<AlertSwitch, boolean> | null>(null);
  const [switchFailed, setSwitchFailed] = useState(false);

  const load = useCallback(async () => {
    const [config, list] = await Promise.all([
      call(() => api.GET('/v1/notifications/push/public-key')),
      call(() => api.GET('/v1/notifications/push/devices')),
    ]);
    if (!config.ok || !list.ok) return setLoadFailed(true);
    setLoadFailed(false);
    setAvailable(config.data.available);
    setPublicKey(config.data.public_key ?? null);
    setDevices(list.data.items);
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void load();
  }, [load]);

  const current = devices?.find((d) => d.current && d.active);
  const enabled = current !== undefined;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void call(() => api.GET('/v1/merchant/members/me/preferences')).then((result) => {
      if (!cancelled && result.ok) {
        setSwitches({
          push_on_draft: result.data.push_on_draft,
          push_on_escalation: result.data.push_on_escalation,
          push_on_assignment: result.data.push_on_assignment,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  async function toggle(name: AlertSwitch, next: boolean) {
    const previous = switches;
    setSwitches((current) => (current ? { ...current, [name]: next } : current));
    setSwitchFailed(false);
    const result = await call(() =>
      api.PATCH('/v1/merchant/members/me/preferences', { body: { [name]: next } }),
    );
    if (result.ok) {
      setSwitches((current) => (current ? { ...current, [name]: result.data[name] } : current));
    } else {
      setSwitches(previous);
      setSwitchFailed(true);
    }
  }

  async function turnOn() {
    if (!publicKey) return;
    setBusy(true);
    setNotice(null);
    const subscribed = await subscribeThisBrowser(publicKey);
    setBrowser(currentBrowserState());
    if (!subscribed.ok) {
      setBusy(false);
      return setNotice(subscribed.reason);
    }
    const result = await call(() =>
      api.POST('/v1/notifications/push/devices', {
        body: { ...subscribed.subscription, label: deviceLabel() },
      }),
    );
    if (!result.ok) {
      // The server did not take it, so do not leave a subscription behind that nothing will use.
      await unsubscribeThisBrowser();
      setBusy(false);
      return setNotice(
        result.error.code === 'PUSH_ENDPOINT_UNAVAILABLE'
          ? 'conflict'
          : result.error.code === 'RATE_LIMITED'
            ? 'rateLimited'
            : 'failed',
      );
    }
    await load();
    setBusy(false);
    setNotice('enabled');
  }

  async function sendTest() {
    setBusy(true);
    setNotice(null);
    const result = await call(() => api.POST('/v1/notifications/push/devices/current/test'));
    setBusy(false);
    setNotice(
      result.ok ? 'testSent' : result.error.code === 'RATE_LIMITED' ? 'rateLimited' : 'testFailed',
    );
  }

  async function remove(device: Device) {
    setBusy(true);
    setNotice(null);
    const result = await call(() =>
      api.DELETE('/v1/notifications/push/devices/{device_id}', {
        params: { path: { device_id: device.id } },
      }),
    );
    // Removing this browser's own device also drops its subscription in the browser.
    if (result.ok && device.current) await unsubscribeThisBrowser();
    await load();
    setBusy(false);
  }

  const guidance: Partial<Record<BrowserState, string>> = {
    'in-app-browser': t('phoneAlerts.guidance.inAppBrowser'),
    'ios-install': t('phoneAlerts.guidance.iosInstall'),
    unsupported: t('phoneAlerts.guidance.unsupported'),
    blocked: t('phoneAlerts.guidance.blocked'),
  };

  return (
    <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <h3 className="text-sm font-semibold text-ink">{t('phoneAlerts.title')}</h3>
      <p className="mt-1 text-sm text-ink-muted">{t('phoneAlerts.hint')}</p>

      {loadFailed && (
        <p role="alert" className="mt-3 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('phoneAlerts.loadFailed')}
        </p>
      )}
      {available === false && (
        <p role="status" className="mt-3 text-sm text-ink-muted">
          {t('phoneAlerts.notConfigured')}
        </p>
      )}
      {available && browser !== 'ready' && (
        <p role="status" className="mt-3 rounded-md bg-panel-muted px-3 py-2 text-sm text-ink">
          {guidance[browser]}
        </p>
      )}

      {available && browser === 'ready' && !current && (
        <ActionButton tone="primary" className="mt-3" disabled={busy} onClick={() => void turnOn()}>
          {t('phoneAlerts.turnOn')}
        </ActionButton>
      )}
      {current && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Chip tone="ok">{t('phoneAlerts.on')}</Chip>
          <ActionButton disabled={busy} onClick={() => void sendTest()}>
            {t('phoneAlerts.sendTest')}
          </ActionButton>
        </div>
      )}

      {current && switches !== null && (
        <div className="mt-3 space-y-3">
          {ALERT_SWITCHES.map(({ name, label, hint }) => (
            <label key={name} className="flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                role="switch"
                aria-checked={switches[name]}
                checked={switches[name]}
                onChange={(e) => void toggle(name, e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{t(label)}</span>
                <span className="block text-ink-muted">{t(hint)}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {switchFailed && (
        <p role="alert" className="mt-2 text-sm text-danger-ink">
          {t('phoneAlerts.switchFailed')}
        </p>
      )}

      {notice && (
        <p
          role={notice === 'enabled' || notice === 'testSent' ? 'status' : 'alert'}
          className="mt-3 text-sm text-ink"
        >
          {t(`phoneAlerts.notice.${notice}`)}
        </p>
      )}

      {devices && devices.length > 0 && (
        <ul className="mt-4 divide-y divide-line" aria-label={t('phoneAlerts.devices')}>
          {devices.map((device) => (
            <li key={device.id} className="flex flex-wrap items-center gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {device.label}
                  {device.current && ` · ${t('phoneAlerts.thisPhone')}`}
                </p>
                <p className="text-xs text-ink-muted">
                  {device.active
                    ? device.last_sent_at
                      ? t('phoneAlerts.lastAlert', { when: formatDateTime(device.last_sent_at) })
                      : t('phoneAlerts.neverAlerted')
                    : t('phoneAlerts.signedOut')}
                </p>
              </div>
              <ActionButton
                className="ml-auto"
                size="sm"
                tone="danger"
                disabled={busy}
                onClick={() => void remove(device)}
              >
                {t('phoneAlerts.remove')}
              </ActionButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
