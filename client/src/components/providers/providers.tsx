'use client';

import { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { StarknetProvider } from '@/components/providers/StarknetProvider';
import { TokensProvider } from '@/components/providers/TokensProvider';

//
// Client-side providers for the whole app.
//
// One shared QueryClient backs every query hook (src/hooks/queries/), every action
// mutation (src/hooks/mutations/) and the chain layer — see specs/NEXTJS_DATA_FLOW.md.
// `StarknetProvider` mounts the QueryClientProvider with this client, so chain hooks are
// never re-wrapped (§0).
//
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <StarknetProvider queryClient={queryClient}>
      <TokensProvider>{children}</TokensProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--color-ps-panel)',
            color: 'var(--color-ps-text)',
            border: '1px solid var(--color-ps-line)',
          },
        }}
      />
    </StarknetProvider>
  );
}
