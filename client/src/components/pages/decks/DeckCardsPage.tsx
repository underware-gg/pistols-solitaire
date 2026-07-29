'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useDecksView } from '@/components/pages/decks/DecksScene';
import { StarterPackClaim } from '@/components/pages/decks/StarterPack';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

//
// The `/deck/<slug>` route: one collection dealt out on the table, a page at a time.
//
// Like `DecksPage` this is only the chrome over a table it does not own — the deck is already
// open by the time this mounts, because `DecksScene` reads the slug from the URL. Which is why
// nothing here needs the slug: the deck the URL names is simply what `useDecksView` serves.
//
// Backing out is a navigation to `/decks`, which closes the deck by moving one prop in the
// scene — so the browser's Back button and the button below do exactly the same thing, and so does
// Escape (handled in the scene, since it is global).
//

export function DeckCardsPage({ className }: { className?: string }) {
  const router = useRouter();
  const { deck, page, pages, turnPage, hand, zoomed, stepZoom, starterPack } = useDecksView();

  if (!deck) return null;

  // The free pack is claimed on the page of the deck its duelists land in — the deck whose mark on the
  // felt is what brought the player here. Everywhere else the offer is not this page's business.
  const claim = starterPack?.slug === deck.slug ? starterPack : undefined;

  // Where the card in hand sits among the cards on the felt — and so which way there is left to go.
  const at = zoomed ? hand.indexOf(zoomed) : -1;

  return (
    <div className={cn('flex flex-1 flex-col', className)}>
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Back to the table"
          className="mt-1 pointer-events-auto"
          onClick={() => router.push('/decks')}
        >
          <ChevronLeft className="size-5" />
        </Button>

        <div className="text-left">
          <h2>{deck.name}</h2>
          <p className="text-ps-text/60 text-sm">
            {deck.game} · {deck.cardIds.length} cards
          </p>
        </div>
      </div>

      {/*
        The claim, in the middle of the table: the deck is parked off to the side and this deck is
        empty until the cards land, so the centre of the felt is exactly the space it is about to
        fill. **It outlives its own transaction** — through `Claiming…` and then `Indexing…` — and goes
        when the duelists arrive through Torii's subscription, which is also what deals them onto the
        felt underneath it. So the button is replaced by the thing it was promising, in one step, with
        nothing to navigate.
      */}
      {claim && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <StarterPackClaim offer={claim} />
        </div>
      )}

      {/*
        Flanking the card in hand: one card goes down as the next comes up, and never off the felt —
        `stepZoom` stops at the ends of the dealt page, so these grey out there. Same step the left
        and right arrow keys take (the scene owns those, since they are global).
      */}
      {at >= 0 && (
        // Centred and capped rather than pinned to the viewport: the zoomed card is centred too, so
        // this keeps the chevrons just outside its edges instead of stranded at the rails, and the
        // cap collapses on a narrow window (where the card is wide) so they never sit on top of it.
        <div className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-6 left-6 mx-auto flex max-w-2xl items-center justify-between">
          <Button
            variant="ghost"
            size="lg"
            aria-label="Previous card"
            className="pointer-events-auto"
            disabled={at === 0}
            onClick={() => stepZoom(-1)}
          >
            <ChevronLeft className="size-8" />
          </Button>
          <Button
            variant="ghost"
            size="lg"
            aria-label="Next card"
            className="pointer-events-auto"
            disabled={at === hand.length - 1}
            onClick={() => stepZoom(1)}
          >
            <ChevronRight className="size-8" />
          </Button>
        </div>
      )}

      {pages > 1 && (
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
  );
}
