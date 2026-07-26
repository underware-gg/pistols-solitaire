'use client';

import { toast } from 'sonner';

//
// Error reporting for the mutation layer (see specs/NEXTJS_DATA_FLOW.md §6).
// Called by useActionMutation's onError — components never do this themselves.
//
export function handleApiError(apiName: string, params: unknown, error: unknown) {
  console.error('[API Error]', { apiName, params, error });

  const message = (error as { message?: string })?.message ?? 'An unexpected error occurred.';
  toast.error(message, {
    description: apiName,
    closeButton: true,
    duration: 5000,
  });
}
