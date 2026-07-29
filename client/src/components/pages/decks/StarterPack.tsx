'use client';

import { Button } from '@/components/ui/Button';
import { NotificationBadge } from '@/components/ui/NotificationBadge';
import { Spinner } from '@/components/ui/Spinner';
import type { StarterPackOffer, StarterPackPhase } from '@/hooks/use-starter-pack';
import { cn } from '@/lib/cn';

//
// The free starter pack, in the two places the table shows it — the mark on the deck and the claim.
//
// Both live on the **duelists** deck, not the Packs one: the duelists are what the offer is measured
// by and what the claim produces, so the deck the player is pointed at is the deck the cards appear
// in. Nothing has to navigate anywhere when the claim lands — the felt they are already looking at
// fills up.
//
// They are deliberately not the same control. **The mark is a label, not a button**: the deck it sits
// on is already the hit target (`CardTable` hands an empty deck a click for exactly this reason), and
// a button drawn on top of a clickable deck gives the player two things to aim at for one action. So
// the table points at the deck, opening the deck is the whole gesture, and the claim waits on the
// other side where there is room to explain itself.
//
// Whether either is shown at all is `useStarterPackOffer`'s call, not theirs — see `DecksScene`.
//

/** Where the mark's art lives. Game art, so `public/assets/`, not an icon (specs/CODING_STYLE.md). */
const NOTICE_URL = '/assets/notification.png';

/**
 * The mark over the empty duelists deck: "there is something here for you". A `ui/NotificationBadge` and
 * nothing else — everything about how a mark is drawn and pulsed belongs to the primitive; the only
 * thing this page knows is *which* art and *how big*.
 *
 * Sized in screen pixels, because `Deck3D` projects it rather than laying it on the felt, and it
 * should read the same on any table. `lg` is 128px of box, and the art is a tall glyph on a square
 * canvas — 33% of it wide, 88% tall — so the mark itself lands at ~42×112px: a badge inside the
 * empty slot without filling it.
 *
 * No label: the deck under it is the control and its caption is the name, so a description here
 * would only be read out twice.
 */
export function StarterPackMark({ className }: { className?: string }) {
  return <NotificationBadge src={NOTICE_URL} size="lg" className={className} />;
}

/**
 * What each phase of the claim says. **`indexing` is a state worth naming**: the transaction has
 * landed and the player is still looking at an empty deck, so a button that went back to reading
 * `Claim Starter Pack` would invite a second claim, and one that just stopped spinning would look
 * finished with nothing to show. `Indexing…` says the wait is Torii's, and it ends when the cards
 * arrive rather than when this component decides it has waited long enough.
 */
const CLAIM_LABEL: Record<StarterPackPhase, string> = {
  ready: 'Claim Starter Pack',
  claiming: 'Claiming…',
  indexing: 'Indexing…',
};

/**
 * The claim itself, on the duelists' own deck page: one button, the loudest thing on the felt.
 *
 * It is the only control on the page until it succeeds, and it never becomes a *second* claim —
 * everything but `ready` is disabled, and the offer stops being served the moment the duelists land.
 */
export function StarterPackClaim({
  offer,
  className,
}: {
  offer: StarterPackOffer;
  className?: string;
}) {
  const waiting = offer.phase !== 'ready';
  return (
    <Button
      variant="accent"
      size="lg"
      className={cn('pointer-events-auto', className)}
      disabled={waiting}
      onClick={offer.claim}
    >
      {/* `md` is the icon size a text button at this scale carries — `lg` is for the icon-only ones. */}
      {waiting && <Spinner size="md" />}
      {CLAIM_LABEL[offer.phase]}
    </Button>
  );
}
