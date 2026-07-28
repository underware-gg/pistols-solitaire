'use client';

import { ChevronLeft, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
// import { useDecksView } from '@/components/pages/decks/DecksScene';
import { Button } from '@/components/ui/Button';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/SegmentedControl';
import { useController } from '@/hooks/use-controller';
import { cn } from '@/lib/cn';
import { type GameFilter, useSettingsStore } from '@/stores/settings-store';

//
// The `/decks` route: every ERC-721 collection the account holds, as a deck on the felt.
// Picking one goes to `/deck/<slug>` — see `DeckCardsPage`.
//
// This is only the chrome. The table, and the state it shares with `DeckCardsPage`, are in
// `DecksScene`, mounted by `app/(table)/layout.tsx` so the canvas survives the navigation
// between the two routes; read that file before moving anything up or down.
//

// Which collections come to the table. The setting is the player's, so it lives in the settings
// store and outlives the visit; the table reads it back in `DecksScene`.
const GAME_OPTIONS: SegmentedOption<GameFilter>[] = [
  { value: 'pistols', label: 'Pistols Only' },
  { value: 'all', label: 'All Games' },
];

export function DecksPage({ className }: { className?: string }) {
  const router = useRouter();
  const { isConnected, isConnecting, connect } = useController();
  const gameFilter = useSettingsStore(s => s.gameFilter);
  const setGameFilter = useSettingsStore(s => s.setGameFilter);
  // const { isLoading } = useDecksView();

  return (
    <div className={cn('flex items-start gap-6', className)}>
      {/* One level up from the table, in the same spot `DeckCardsPage` puts its way out of a deck —
       * so backing out of a deck and then off the table is the same button twice. */}
      <Button
        variant="ghost"
        size="sm"
        aria-label="Back to the game"
        className="mt-1 pointer-events-auto"
        onClick={() => router.push('/')}
      >
        <ChevronLeft className="size-5" />
      </Button>

      <div>
        <h1>Your Decks</h1>
        {/* <p className="text-ps-text/60 text-sm">
          {isLoading ? 'Reading the table…' : 'Pick a deck.'}
        </p> */}
      </div>

      {!isConnected && (
        <>
          <Button className="pointer-events-auto ml-auto" onClick={connect} disabled={isConnecting}>
            <Wallet className="size-4" />
            {isConnecting ? 'Connecting…' : 'Connect'}
          </Button>
          <div className="flex-1" />
        </>
      )}

      {isConnected && (
        <SegmentedControl
          className="pointer-events-auto ml-auto"
          label="Which collections"
          options={GAME_OPTIONS}
          value={gameFilter}
          onChange={setGameFilter}
        />
      )}
    </div>
  );
}
