'use client';

import { ChevronLeft, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
// import { useCollectionView } from '@/components/pages/collection/CollectionScene';
import { Button } from '@/components/ui/Button';
import { useController } from '@/hooks/use-controller';
import { cn } from '@/lib/cn';

//
// The `/collection` route: every ERC-721 collection the account holds, as a deck on the felt.
// Picking one goes to `/collection/<slug>` — see `ContractPage`.
//
// This is only the chrome. The table, and the state it shares with `ContractPage`, are in
// `CollectionScene`, mounted by `app/collection/layout.tsx` so the canvas survives the navigation
// between the two routes; read that file before moving anything up or down.
//

export function CollectionPage({ className }: { className?: string }) {
  const router = useRouter();
  const { isConnected, isConnecting, connect } = useController();
  // const { isLoading } = useCollectionView();

  return (
    <div className={cn('flex items-start gap-4', className)}>
      {/* One level up from the table, in the same spot `ContractPage` puts its way out of a deck —
       * so backing out of a deck and then off the table is the same button twice. */}
      <Button
        variant="ghost"
        size="sm"
        aria-label="Back to the game"
        className="pointer-events-auto"
        onClick={() => router.push('/')}
      >
        <ChevronLeft className="size-5" />
      </Button>

      <div>
        <h1>Your Collection</h1>
        {/* <p className="text-ps-text/60 text-sm">
          {isLoading ? 'Reading the table…' : 'Pick a deck.'}
        </p> */}
      </div>

      {!isConnected && (
        <Button className="pointer-events-auto ml-auto" onClick={connect} disabled={isConnecting}>
          <Wallet className="size-4" />
          {isConnecting ? 'Connecting…' : 'Connect'}
        </Button>
      )}
    </div>
  );
}
