'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

type Options = {
  exact?: boolean;
};

//
// Query invalidation helpers (see specs/NEXTJS_DATA_FLOW.md §1).
// `invalidateKey` matches any query whose key *includes* the given segment, so
// e.g. `invalidateKey(duelId)` refreshes every query keyed on that duel.
//
export function useQueryInvalidate() {
  const queryClient = useQueryClient();

  const invalidateKey = useCallback(
    (key: unknown) => {
      queryClient.invalidateQueries({
        predicate: query => query.queryKey.includes(key),
      });
    },
    [queryClient],
  );

  const invalidateKeys = useCallback(
    (keys: unknown[], options: Options = {}) => {
      queryClient.invalidateQueries({ queryKey: keys, ...options });
    },
    [queryClient],
  );

  return { invalidateKey, invalidateKeys };
}
