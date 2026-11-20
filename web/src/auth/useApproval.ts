import { useOptionalAuth } from './AuthProvider';

export type ReviewStatus = 'unsubmitted' | 'pending' | 'approved' | 'rejected';

export interface Approval {
  status: ReviewStatus;
  /** Staff's reason, only when rejected. */
  note: string | null;
  approved: boolean;
  /** Locked actions show the lock line instead of failing on click (the server enforces it too). */
  locked: boolean;
  /** The owner's verified mobile, for the banner. */
  phone: string | null;
}

/** Where the signed-in shop is in staff review (ADR 0060). Signed-out callers count as approved. */
export function useApproval(): Approval {
  const state = useOptionalAuth()?.state;
  if (state?.status !== 'authenticated') {
    return { status: 'approved', note: null, approved: true, locked: false, phone: null };
  }
  const { merchant, user } = state.me;
  const status = (merchant.review_status ?? 'approved') as ReviewStatus;
  return {
    status,
    note: merchant.review_note ?? null,
    approved: status === 'approved',
    locked: status !== 'approved',
    phone: user.phone_verified ? (user.phone ?? null) : null,
  };
}
