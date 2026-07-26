'use client';

import { ChevronLeft, ChevronRight, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTokenBalances } from '@/components/providers/TokensProvider';
import { CardTable, type TableDeck } from '@/components/pages/collection/CardTable';
import { gridPageSize } from '@/components/pages/collection/table-layout';
import { Button } from '@/components/ui/Button';
import { PROFILE } from '@/dojo/config';
import { useController } from '@/hooks/use-controller';

//
// The `/collection` route: every ERC-721 collection the account holds, as a deck on the table.
// Pick a deck and it deals a page of its cards face up; pick a card and it comes up to the camera.
//
// The 3D lives in `CardTable`; this page owns the view state and the flat UI around it. That split
// is deliberate — the chrome is ordinary DOM (Tailwind, `Button`, real text) laid over a
// transparent canvas, and only the things that have to move with a mesh are `<Html>` inside the
// scene. Anything that would be a modal elsewhere is a card in front of the camera here.
//
// The same table serves the full game collections later: a deck is a contract plus a list of token
// ids, so a collection nobody owns is the same component fed a different list.
//

const ERC721_TOKENS = PROFILE.tokens.filter(token => token.type === 'ERC721');

export function CollectionPage() {
  const { isConnected, isConnecting, connect } = useController();
  const { isLoading, balances } = useTokenBalances();

  const [selected, setSelected] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [zoomed, setZoomed] = useState<string | null>(null);

  const decks = useMemo<TableDeck[]>(
    () =>
      ERC721_TOKENS.map(token => ({
        address: token.address,
        game: token.game,
        name: token.name,
        tokenIds: balances.erc721[token.address] ?? [],
      })),
    [balances],
  );

  const deck = selected === null ? undefined : decks[selected];
  const pages = deck ? Math.max(1, Math.ceil(deck.tokenIds.length / gridPageSize())) : 1;

  const close = () => {
    setZoomed(null);
    setSelected(null);
    setPage(0);
  };

  // Escape backs out one level: the zoomed card first, then the deck.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (zoomed) setZoomed(null);
      else if (deck) close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomed, deck]);

  const turnPage = (delta: number) => {
    setZoomed(null);
    setPage(current => Math.min(pages - 1, Math.max(0, current + delta)));
  };

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <CardTable
        decks={decks}
        selected={selected}
        page={page}
        zoomed={zoomed}
        onSelect={index => {
          setPage(0);
          setZoomed(null);
          setSelected(index);
        }}
        onZoom={setZoomed}
      />

      {/* The chrome. Inert by default so every pixel of felt stays clickable — each control turns
       * its own pointer events back on. */}
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col p-6">
        <div className="flex items-start gap-4">
          {deck ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label="Back to the table"
              className="pointer-events-auto"
              onClick={close}
            >
              <ChevronLeft className="size-5" />
            </Button>
          ) : (
            <div>
              <h1>Your Collection</h1>
              <p className="text-ps-text/60 text-sm">
                {isLoading ? 'Reading the table…' : 'Pick a deck.'}
              </p>
            </div>
          )}

          {deck && (
            <div className="text-left">
              <h2>{deck.name}</h2>
              <p className="text-ps-text/60 text-sm">
                {deck.game} · {deck.tokenIds.length} cards
              </p>
            </div>
          )}

          {!isConnected && (
            <Button
              className="pointer-events-auto ml-auto"
              onClick={connect}
              disabled={isConnecting}
            >
              <Wallet className="size-4" />
              {isConnecting ? 'Connecting…' : 'Connect'}
            </Button>
          )}
        </div>

        {deck && pages > 1 && (
          <div className="mt-auto flex items-center justify-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              aria-label="Previous page"
              className="pointer-events-auto"
              disabled={page === 0}
              onClick={() => turnPage(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="small-caps font-title text-lg">
              {page + 1} / {pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Next page"
              className="pointer-events-auto"
              disabled={page === pages - 1}
              onClick={() => turnPage(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
