'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Toaster } from 'sonner';

//
// Client-side providers for the whole app.
//
// One shared QueryClient backs every query hook (src/hooks/queries/) and every
// action mutation (src/hooks/mutations/) — see specs/NEXTJS_DATA_FLOW.md.
// When the Dojo/Starknet layer lands, its provider wraps QueryClientProvider here
// and shares this same client, so chain hooks are never re-wrapped (§0).
//
export default function Providers({ children }: { children: ReactNode }) {
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
    <QueryClientProvider client={queryClient}>
      {children}
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
    </QueryClientProvider>
  );
}
