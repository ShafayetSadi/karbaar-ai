import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <Splash />;
  if (state.status === 'anonymous')
    return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Owners land on Home; teammates keep the inbox. */
function landingPath(owner: boolean) {
  return owner ? '/home' : '/inbox';
}

/** Unknown paths: owners land on Home, teammates (and visitors, who sign in first) on the inbox. */
export function CatchAllRedirect() {
  const { state } = useAuth();
  if (state.status === 'loading') return <Splash />;
  // A visitor logs in with no saved destination, so the sign-in rules above pick their landing page.
  if (state.status === 'anonymous') return <Navigate to="/login" replace />;
  return <Navigate to={landingPath(state.me.role === 'owner')} replace />;
}

/** Login and signup: signed-in users go straight to the app. */
export function RedirectIfAuthed() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <Splash />;
  if (state.status === 'authenticated') {
    const destination = (
      location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null
    )?.from;
    const from = destination?.pathname;
    // A new shop (signup, or a login before it was submitted) finishes with Check and submit.
    const owner = state.me.role === 'owner';
    const status = state.me.merchant.review_status;
    if (owner && status === 'unsubmitted') return <Navigate to="/onboarding/review" replace />;
    if (owner && (status === 'pending' || status === 'rejected'))
      return <Navigate to="/getting-started" replace />;
    const safe =
      from?.startsWith('/') && !from.startsWith('//') && !['/login', '/signup'].includes(from)
        ? from
        : null;
    if (safe)
      return (
        <Navigate
          to={{ pathname: safe, search: destination?.search, hash: destination?.hash }}
          replace
        />
      );
    // An approved owner lands on Home even before the shop is set up: Home leads with the
    // setup steps still to do.
    return <Navigate to={landingPath(owner)} replace />;
  }
  return <Outlet />;
}

function Splash() {
  return (
    <div role="status" className="flex min-h-screen items-center justify-center text-ink-faint">
      Loading…
    </div>
  );
}
