'use client';

import { Wallet } from 'lucide-react';
import { useCollectionView } from '@/components/pages/collection/CollectionScene';
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
  const { isConnected, isConnecting, connect } = useController();
  const { isLoading } = useCollectionView();

  return (
    <div className={cn('flex items-start gap-4', className)}>
      <div>
        <h1>Your Collection</h1>
        <p className="text-ps-text/60 text-sm">
          {isLoading ? 'Reading the table…' : 'Pick a deck.'}
        </p>
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
