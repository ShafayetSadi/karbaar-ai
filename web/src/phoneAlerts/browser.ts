/**
 * What this browser can do for phone alerts (ADR 0072), kept apart from the UI so each state can be
 * tested and so logout can drop the subscription without loading the settings page.
 */

export type BrowserState =
  /** Notifications are possible and the permission can still be asked for. */
  | 'ready'
  /** Facebook, Messenger, Instagram and similar in-app browsers cannot hold a push subscription. */
  | 'in-app-browser'
  /** iPhone/iPad only support web push from a web app added to the Home Screen. */
  | 'ios-install'
  /** No service worker, Push API or Notifications API. */
  | 'unsupported'
  /** The person turned notifications off for this site in the browser. */
  | 'blocked';

interface Env {
  userAgent: string;
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPush: boolean;
  permission: NotificationPermission | undefined;
}

const IN_APP = /FBAN|FBAV|FB_IAB|Messenger|Instagram|MicroMessenger|Line\//i;

export function browserState(env: Env): BrowserState {
  if (IN_APP.test(env.userAgent)) return 'in-app-browser';
  if (/iPhone|iPad|iPod/.test(env.userAgent) && !env.standalone) return 'ios-install';
  if (!env.hasServiceWorker || !env.hasPush || env.permission === undefined) return 'unsupported';
  if (env.permission === 'denied') return 'blocked';
  return 'ready';
}

export function currentBrowserState(): BrowserState {
  return browserState({
    userAgent: navigator.userAgent,
    standalone:
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches === true,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPush: 'PushManager' in window,
    permission: 'Notification' in window ? Notification.permission : undefined,
  });
}

/** A short name for the phone, so the device list is recognisable. Not an identifier. */
export function deviceLabel(userAgent = navigator.userAgent): string {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'iPhone';
  if (/Android/.test(userAgent)) return 'Android phone';
  if (/Windows/.test(userAgent)) return 'Windows browser';
  if (/Macintosh|Mac OS/.test(userAgent)) return 'Mac browser';
  return 'Browser';
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded =
    value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export type SubscribeResult =
  | { ok: true; subscription: { endpoint: string; keys: { p256dh: string; auth: string } } }
  | { ok: false; reason: 'denied' | 'dismissed' | 'failed' };

/**
 * Ask for permission (only ever called from a button press) and create a fresh subscription. An
 * earlier subscription is dropped first, so a browser that another account used never hands that
 * account's endpoint to this one.
 */
export async function subscribeThisBrowser(publicKey: string): Promise<SubscribeResult> {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'denied') return { ok: false, reason: 'denied' };
    if (permission !== 'granted') return { ok: false, reason: 'dismissed' };
    const registration = await navigator.serviceWorker.ready;
    await (await registration.pushManager.getSubscription())?.unsubscribe();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    });
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
      await subscription.unsubscribe();
      return { ok: false, reason: 'failed' };
    }
    return {
      ok: true,
      subscription: {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      },
    };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** Drop this browser's subscription. Best effort: the server already treats the device as off. */
export async function unsubscribeThisBrowser(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    return subscription ? await subscription.unsubscribe() : true;
  } catch {
    return false;
  }
}
