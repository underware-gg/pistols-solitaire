'use client';

import { toast } from 'sonner';

//
// Error reporting for the mutation layer (see specs/NEXTJS_DATA_FLOW.md §6).
// Called by useActionMutation's onError — components never do this themselves.
//
// `toastId` replaces an existing toast in place instead of opening a new one. The server-action
// layer leaves it unset (it dismisses its loading toast in onSettled); the chain layer passes the
// id of its own loading toast, so one toast follows a transaction from sent to reverted.
//
export function handleApiError(
  apiName: string,
  params: unknown,
  error: unknown,
  { toastId }: { toastId?: string } = {},
) {
  console.error('[API Error]', { apiName, params, error });

  const message = (error as { message?: string })?.message ?? 'An unexpected error occurred.';
  toast.error(message, {
    id: toastId,
    description: apiName,
    closeButton: true,
    duration: 5000,
  });
}
