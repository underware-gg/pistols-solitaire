'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ElapsedTimeBadge } from '@/components/ElapsedTimeBadge';
import { handleApiError } from '@/lib/client-utils';

// Module-level incrementing id for addressable loading toasts (no store lib needed).
let _actionIdCounter = 0;
const nextActionId = () => (_actionIdCounter += 1);

//
// Generic wrapper for server-action mutations (see specs/NEXTJS_DATA_FLOW.md §2, §6).
// - throws when the action returns `success: false` so react-query treats it as an error
// - shows a sonner loading toast (with a live elapsed timer) for the action's duration
// - dismisses on settle; reports errors through handleApiError
// Components never manage these toasts themselves.
//
export function useActionMutation<A, R extends { success: boolean; error?: string }>(
  action: (variables: A) => Promise<R>,
  name?: string,
) {
  const actionName = `${name || action.name?.split('.')[0] || 'action'}()`;

  return useMutation({
    mutationFn: async (variables: A) => {
      const result = await action(variables);
      if (!result.success) {
        throw new Error(result.error || `${actionName} failed`);
      }
      return result;
    },
    onMutate: () => {
      const startedAt = Date.now();
      const actionId = nextActionId();
      const toastKey = `${actionName}-${actionId}`;
      toast.loading(
        <span>
          {actionName} <span className="text-ps-text/50 text-xs">#{actionId}</span>
        </span>,
        {
          description: <ElapsedTimeBadge startedAt={startedAt} />,
          id: toastKey,
        },
      );
      return { toastKey };
    },
    onSettled: (_data, _error, _variables, context) => {
      toast.dismiss(context?.toastKey);
    },
    onError: (error, variables) => {
      handleApiError(actionName, variables, error);
    },
  });
}
