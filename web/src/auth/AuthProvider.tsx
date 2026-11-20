import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api/client';
import { call as callOutcome } from '../api/call';
import { NETWORK_ERROR, parseApiError, type ApiError } from '../api/errors';
import type { components } from '../api/schema';
import i18n, { currentLanguage, setLanguage, type Language } from '../i18n';
import { unsubscribeThisBrowser } from '../phoneAlerts/browser';

export type Me = components['schemas']['MeResponse'];
type SignupAddress = components['schemas']['SignupAddress'];

type State = { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; me: Me };

/** Result of an auth action: the error is already parsed from the API envelope. */
export type Result = { ok: true } | { ok: false; error: ApiError };

interface AuthContextValue {
  state: State;
  /** `identifier` is an email, or a mobile number the owner verified. */
  login(identifier: string, password: string): Promise<Result>;
  signup(input: {
    email: string;
    password: string;
    merchantName: string;
    ownerName: string;
    /** An optional contact number for staff; it is not verified. */
    phone?: string;
    /** Exactly one proof: the one the API's signup options ask for. */
    phoneProof?: string;
    emailProof?: string;
    /** From a signup invite link (ADR 0081): it proves the email, so no email proof goes with it. */
    inviteToken?: string;
    facebookUrl: string;
    address: SignupAddress;
  }): Promise<Result>;
  /** Join a shop's team with an emailed invite token; logs the new teammate in. */
  acceptInvite(input: { token: string; name: string; password: string }): Promise<Result>;
  /**
   * Ends the session on the server first. If that fails the person stays signed in and the result
   * says so: a screen change alone must never look like a finished logout, because the session (and
   * its phone alerts) would still be live. The phone's push subscription is dropped afterwards.
   */
  logout(): Promise<Result>;
  /** Re-read `/me`, e.g. after the email was verified. */
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// openapi-fetch throws on network failure; turn that into the same shape as an API error.
async function call<T extends { error?: unknown; data?: unknown }>(request: () => Promise<T>) {
  try {
    return await request();
  } catch {
    return { error: { error: NETWORK_ERROR }, data: undefined } as const;
  }
}

// Shown instantly when a page is opened again, and refetched in the background (`staleTime: 0`), so
// moving between pages is fast without ever showing old data for long. Like before, a failed request
// is not retried and nothing refetches merely because the tab regained focus.
function newQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 0, retry: false, refetchOnWindowFocus: false },
    },
  });
}

/** Who the cached data belongs to: a new user or shop must never see the previous one's. */
function identityOf(state: State): string {
  return state.status === 'authenticated' ? `${state.me.user.id}:${state.me.merchant.slug}` : '';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const identity = identityOf(state);
  // One cache per signed-in identity, created afresh on login, logout and shop switch.
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- the identity is the cache's key
  const queryClient = useMemo(() => newQueryClient(), [identity]);

  const refresh = useCallback(async () => {
    const { data } = await call(() => api.GET('/v1/auth/me'));
    setState(data ? { status: 'authenticated', me: data } : { status: 'anonymous' });
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- initial session check
    void refresh();
  }, [refresh]);

  // Account language: the saved value wins on every device, a switch is saved, and an account
  // with none yet saves what this dashboard shows. A failed save is retried on the next visit.
  const userId = state.status === 'authenticated' ? state.me.user.id : null;
  const savedLanguage = state.status === 'authenticated' ? (state.me.user.language ?? null) : null;
  const saveLanguage = useCallback(
    async (language: Language) => {
      const { error } = await call(() => api.PUT('/v1/auth/me/language', { body: { language } }));
      if (error) return;
      setState((prev) =>
        prev.status === 'authenticated' && prev.me.user.id === userId
          ? { ...prev, me: { ...prev.me, user: { ...prev.me.user, language } } }
          : prev,
      );
    },
    [userId],
  );

  // Load: show the saved language, or save this dashboard's for an account with none yet.
  useEffect(() => {
    if (!userId) return;
    if (savedLanguage === null) void saveLanguage(currentLanguage());
    else if (savedLanguage !== currentLanguage()) void setLanguage(savedLanguage);
  }, [userId, savedLanguage, saveLanguage]);

  // Save: a switch to another language than the saved one.
  useEffect(() => {
    if (!userId) return;
    const switched = () => {
      const language = currentLanguage();
      if (language !== savedLanguage) void saveLanguage(language);
    };
    i18n.on('languageChanged', switched);
    return () => i18n.off('languageChanged', switched);
  }, [userId, savedLanguage, saveLanguage]);

  useEffect(() => {
    const expired = () => setState({ status: 'anonymous' });
    window.addEventListener('commerce-os:session-expired', expired);
    return () => window.removeEventListener('commerce-os:session-expired', expired);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const finish = (r: { error?: unknown; data?: unknown }): Result => {
      if (r.data) {
        setState({ status: 'authenticated', me: r.data as Me });
        return { ok: true };
      }
      return { ok: false, error: parseApiError(r.error) };
    };
    return {
      state,
      refresh,
      login: async (identifier, password) =>
        finish(await call(() => api.POST('/v1/auth/login', { body: { identifier, password } }))),
      signup: async ({
        email,
        password,
        merchantName,
        ownerName,
        phone,
        phoneProof,
        emailProof,
        inviteToken,
        facebookUrl,
        address,
      }) =>
        finish(
          await call(() =>
            api.POST('/v1/auth/signup', {
              body: {
                email,
                password,
                merchant_name: merchantName,
                owner_name: ownerName,
                phone,
                phone_proof: phoneProof,
                email_proof: emailProof,
                invite_token: inviteToken,
                facebook_url: facebookUrl,
                address,
                language: currentLanguage(),
              },
            }),
          ),
        ),
      acceptInvite: async ({ token, name, password }) =>
        finish(
          await call(() =>
            api.POST('/v1/auth/invites/accept', { body: { token, name, password } }),
          ),
        ),
      logout: async () => {
        const result = await callOutcome(() => api.POST('/v1/auth/logout'));
        // No valid session means there is nothing left to end.
        if (!result.ok && result.error.code !== 'UNAUTHENTICATED') return result;
        await unsubscribeThisBrowser();
        setState({ status: 'anonymous' });
        return { ok: true };
      },
    };
  }, [state, refresh]);

  return (
    <AuthContext.Provider value={value}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </AuthContext.Provider>
  );
}

/** Like `useAuth`, but null outside the provider: for small UI that must not break isolated renders. */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
