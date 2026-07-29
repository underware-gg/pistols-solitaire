'use client';

import { Button } from '@/components/ui/Button';
import { NotificationBadge } from '@/components/ui/NotificationBadge';
import { Spinner } from '@/components/ui/Spinner';
import type { StarterPackOffer } from '@/hooks/use-starter-pack';
import { cn } from '@/lib/cn';

//
// The free starter pack, in the two places the table shows it — the mark on the deck and the claim.
//
// They are deliberately not the same control. **The mark is a label, not a button**: the deck it sits
// on is already the hit target (`CardTable` hands an empty Packs deck a click for exactly this
// reason), and a button drawn on top of a clickable deck gives the player two things to aim at for
// one action. So the table points at the deck, opening the deck is the whole gesture, and the claim
// waits on the other side where there is room to explain itself.
//
// Whether either is shown at all is `useStarterPackOffer`'s call, not theirs — see `DecksScene`.
//

/** Where the mark's art lives. Game art, so `public/assets/`, not an icon (specs/CODING_STYLE.md). */
const NOTICE_URL = '/assets/notification.png';

/**
 * The mark over the Packs deck: "there is something here for you". A `ui/NotificationBadge` and
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

/** The claim itself, on `/deck/<packs>`: one button, the loudest thing on the page. */
export function StarterPackClaim({
  offer,
  className,
}: {
  offer: StarterPackOffer;
  className?: string;
}) {
  return (
    <Button
      variant="accent"
      size="lg"
      className={cn('pointer-events-auto', className)}
      disabled={offer.isClaiming}
      onClick={offer.claim}
    >
      {/* `md` is the icon size a text button at this scale carries — `lg` is for the icon-only ones. */}
      {offer.isClaiming && <Spinner size="md" />}
      {offer.isClaiming ? 'Claiming…' : 'Claim Starter Pack'}
    </Button>
  );
}
