import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { call } from '../api/call';
import { messageForCode } from '../api/errors';
import type { components } from '../api/schema';
import { useAuth } from '../auth/AuthProvider';
import { useApproval } from '../auth/useApproval';
import { useFeatures } from '../entitlements/useFeatures';
import { ApprovalLock } from '../components/ApprovalLock';
import { ActionButton, actionButtonClass, cx, fieldClass } from '../components/ui';
import { formatDateTime } from '../i18n/format';
import { PageEvidence } from './PageEvidence';

type Connection = components['schemas']['ConnectionRead'];
type Page = components['schemas']['PageChoiceRead'];

interface Callback {
  state: string;
  selection: string | null;
  code: string | null;
}

// A refresh must not lose a half-finished connect, so the selection id also lives in
// sessionStorage (tab-scoped, short-lived: the server expires the selection itself).
const SELECTION_KEY = 'messenger.selection';

function rememberSelection(id: string | null) {
  try {
    if (id) window.sessionStorage.setItem(SELECTION_KEY, id);
    else window.sessionStorage.removeItem(SELECTION_KEY);
  } catch {
    // Storage can be blocked; the flow then just cannot resume after a refresh.
  }
}

function rememberedSelection(): string | null {
  try {
    return window.sessionStorage.getItem(SELECTION_KEY);
  } catch {
    return null;
  }
}

// The API redirects back to `/settings#messenger=…`. The fragment never reaches a server, so the
// selection id stays out of logs; it is read once and removed from the address bar.
function readCallback(): Callback | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const state = params.get('messenger');
  if (!state) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return { state, selection: params.get('selection'), code: params.get('code') };
}

export function MessengerConnection() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const owner = state.status === 'authenticated' && state.me.role === 'owner';
  const verified = state.status === 'authenticated' && state.me.user.email_verified;
  const { locked } = useApproval();
  // Until Meta approves the app, connecting is closed for every shop staff have not exempted.
  // The answer comes with the features; until it arrives, nothing to connect with.
  // The key is the staff exemption's name, but the API resolves it to "connecting is open" here.
  const features = useFeatures();
  const connectOpen = features.isEnabled('page_connect_before_meta_live');
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [pageId, setPageId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const handled = useRef(new Set<string>());
  const chooser = useRef<HTMLDivElement>(null);
  // Requests outlive the component; a late answer must not set state on an unmounted tree.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const result = await call(() => api.GET('/v1/channels/messenger'));
    if (!mounted.current) return;
    if (result.ok) {
      setConnection(result.data);
      setFailed(false);
    } else {
      setFailed(true);
    }
    setLoaded(true);
  }, []);

  const connectPage = useCallback(
    async (selectionId: string, page: Page) => {
      setBusy(true);
      const result = await call(() =>
        api.POST('/v1/channels/messenger/connect', {
          body: { selection_id: selectionId, page_id: page.id },
        }),
      );
      if (!mounted.current) return;
      if (result.ok) {
        window.dispatchEvent(new Event('commerce:setup-changed'));
        rememberSelection(null);
        setConnection(result.data);
        setSelection(null);
        setMessage(null);
        setNotice(t('messenger.connected', { name: result.data.name }));
      } else {
        setMessage(result.error.message);
      }
      setBusy(false);
    },
    [t],
  );

  const startSelection = useCallback(
    async (id: string) => {
      // Strict mode runs the mount effect twice; a selection is handled once.
      if (handled.current.has(id)) return;
      handled.current.add(id);
      setBusy(true);
      const [pagesResult, current] = await Promise.all([
        call(() =>
          api.GET('/v1/channels/messenger/pages', { params: { query: { selection: id } } }),
        ),
        call(() => api.GET('/v1/channels/messenger')),
      ]);
      if (!mounted.current) return;
      const choices = pagesResult.ok ? pagesResult.data.pages : [];
      const first = choices[0];
      if (!pagesResult.ok || !first) {
        rememberSelection(null);
        setMessage(pagesResult.ok ? t('messenger.noPages') : pagesResult.error.message);
        setBusy(false);
        return;
      }
      // Nothing to choose: one shared Page, or the Page being reconnected (broken, or missing a
      // permission; a live connection cannot switch Pages anyway). Connect it directly.
      const reconnecting =
        current.ok && current.data?.token_status !== 'revoked' ? current.data : null;
      const same = reconnecting
        ? choices.find((p) => p.id === reconnecting.external_account_id)
        : undefined;
      const only = choices.length === 1 ? first : undefined;
      const auto = same ?? only;
      if (auto) {
        await connectPage(id, auto);
        return;
      }
      setSelection(id);
      setPages(choices);
      setPageId(first.id);
      setBusy(false);
    },
    [t, connectPage],
  );

  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- load on mount
    void load();
    const callback = readCallback();
    if (!callback) {
      const resumed = rememberedSelection();
      if (resumed) void startSelection(resumed);
      return;
    }
    if (callback.state === 'select' && callback.selection) {
      rememberSelection(callback.selection);
      void startSelection(callback.selection);
    } else if (callback.state === 'denied') {
      setMessage(t('messenger.denied'));
    } else {
      setMessage(messageForCode(callback.code ?? 'UNKNOWN'));
    }
  }, [load, startSelection, t]);

  useEffect(() => {
    if (selection) chooser.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [selection]);

  async function connect() {
    const page = pages.find((p) => p.id === pageId);
    if (selection && page) await connectPage(selection, page);
  }

  async function disconnect() {
    if (!window.confirm(t('messenger.disconnectConfirm'))) return;
    setBusy(true);
    const result = await call(() => api.DELETE('/v1/channels/messenger'));
    if (result.ok) {
      setConnection(null);
      setMessage(null);
    } else {
      setMessage(result.error.message);
    }
    setBusy(false);
  }

  const live = connection && connection.token_status !== 'revoked' ? connection : null;
  const broken = live?.token_status === 'broken';
  const missing = live?.missing_permissions ?? [];

  return (
    <div className="rounded-lg border border-line bg-panel p-4 sm:p-6">
      <h2 className="text-base font-semibold text-ink">{t('messenger.title')}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">{t('messenger.hint')}</p>

      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {t('messenger.loadFailed')}
        </p>
      )}
      {notice && !selection && (
        <p role="status" className="mt-4 rounded-md bg-ok px-3 py-2 text-sm text-ok-ink">
          {notice}
        </p>
      )}
      {busy && !selection && !connection && (
        <p role="status" className="mt-4 text-sm text-ink-muted">
          {t('messenger.connecting')}
        </p>
      )}
      {message && (
        <p role="alert" className="mt-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {message}
        </p>
      )}

      {selection ? (
        <div
          ref={chooser}
          className="mt-5 space-y-4 rounded-lg border border-active bg-panel-muted/40 p-4"
        >
          <p className="text-sm font-semibold text-ink">{t('messenger.oneMoreStep')}</p>
          <label className="block text-sm font-medium text-ink-muted">
            {t('messenger.choosePage')}
            <select
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              className={cx('mt-1 block w-full', fieldClass)}
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <ActionButton tone="primary" disabled={busy} onClick={() => void connect()}>
            {t('messenger.connectPage')}
          </ActionButton>
        </div>
      ) : (
        loaded &&
        !features.loading && (
          <div className="mt-4">
            {live ? (
              <div className="space-y-4 rounded-lg border border-line bg-panel-muted/30 p-4">
                <p className="text-sm text-ink">
                  <span className="block break-words font-medium">{live.name}</span>
                  <span className="mt-1 block text-ink-faint">
                    {t('messenger.connectedAt', { when: formatDateTime(live.connected_at) })}
                  </span>
                </p>
                {broken && (
                  <p role="alert" className="rounded-md bg-warn px-3 py-2 text-sm text-warn-ink">
                    {t('messenger.broken')}
                  </p>
                )}
                {missing.length > 0 && (
                  <p role="alert" className="rounded-md bg-warn px-3 py-2 text-sm text-warn-ink">
                    {t('messenger.missingPermissions', { permissions: missing.join(', ') })}
                  </p>
                )}
                <PageEvidence connection={live} owner={owner} onChanged={setConnection} />
                <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                  {owner && connectOpen && (broken || missing.length > 0) && (
                    <ConnectLink
                      label={t('messenger.reconnect')}
                      enabled={owner && verified && !locked}
                      primary
                    />
                  )}
                  {owner && (
                    <ActionButton disabled={busy} onClick={() => void disconnect()}>
                      {t('messenger.disconnect')}
                    </ActionButton>
                  )}
                </div>
              </div>
            ) : !connectOpen ? (
              <p
                role="status"
                className="rounded-md bg-panel-muted px-3 py-2 text-sm font-medium text-ink-muted"
              >
                {t('messenger.opensAfterMeta')}
              </p>
            ) : (
              <div className="space-y-2">
                <ConnectLink
                  label={t('messenger.connect')}
                  enabled={owner && verified && !locked}
                  primary
                />
                {locked && <ApprovalLock className="block" />}
                {!verified && (
                  <p className="text-sm text-ink-faint">{t('messenger.verifyFirst')}</p>
                )}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

// A full-page navigation: the API redirects to Facebook, which sends the merchant back.
function ConnectLink({
  label,
  enabled,
  primary,
}: {
  label: string;
  enabled: boolean;
  primary?: boolean;
}) {
  const style = actionButtonClass({ tone: primary ? 'primary' : 'neutral' });
  if (!enabled) {
    return (
      <span aria-disabled="true" className={cx(style, 'cursor-not-allowed opacity-60')}>
        {label}
      </span>
    );
  }
  return (
    <a href="/v1/channels/messenger/connect" className={style}>
      {label}
    </a>
  );
}
