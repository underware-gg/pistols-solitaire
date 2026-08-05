'use client';

import { MintButton } from '@/components/pages/decks/MintButton';
import type { MintPhase } from '@/hooks/use-mint-flow';
import type { PackOpenOffer } from '@/hooks/use-pack-open';

//
// Opening a pack: a button on every pack on the felt.
//
// **The first control on this table that belongs to a card rather than to a deck.** The starter pack
// and the purchase are one offer about one collection, so they hang under the deck (`Deck3D`'s
// `action`); an open is about the pack the player is pointing at, and there is no way to say which
// pack from under a deck. So it is drawn on the card, and `CardTable`'s `cardAction` is the hook it
// hangs from — a deck says what to put on each of its dealt cards, the same way it says what to hang
// under itself.
//
// **They share one flow, so they are one control drawn N times.** Only the pack in `opening` reports
// the phase; every other button is locked while it runs, because the write in flight is the answer to
// a second click whichever card it was made on. That is `MintButton`'s `disabled`, and it is why the
// phase cannot simply be read per button.
//

/**
 * What each phase says — and past `ready`, nothing: the busy states are the spinner alone.
 *
 * **The other two offers name their `indexing`; this one has nowhere to write it.** Measured in the
 * real fonts, a `sm` button costs 44px before a single letter (20px of padding, a 16px spinner and
 * the 8px gap), every wording of the two busy phases lands between 90 and 111px wide, and the column
 * pitch on this table runs from 71px at the tightest window to 171px at the widest — so a label would
 * be **painted over by the next card's own button**, which is worse than not writing it. The spinner
 * alone is 36px, which clears its neighbours by 18px even at the tightest.
 *
 * What the rule in `DECKS.md` §7 asks for survives that: a spinner still turning after the receipt is
 * exactly "not finished, nothing to show yet", and the transaction's own toast carries the entrypoint
 * and a live elapsed time for anyone who wants the detail.
 */
const OPEN_LABEL: { ready: string } & Partial<Record<MintPhase, string>> = { ready: 'Open' };

/**
 * The button on one pack. `secondary` and `sm`: it sits on the felt just below the card
 * (`TABLE.cardActionDrop`), and there may be thirty of them out at once — the loud variants belong to
 * the one thing a page is offering, and this is the ordinary thing to do with a pack you own.
 *
 * **`Open` is measured against the grid, not chosen by eye.** In the real fonts it is 74px wide
 * against a column pitch that runs 71px at the tightest window this table lays out to 171px at the
 * widest — so two of them are edge to edge at the small end and comfortably apart everywhere else.
 * That is the margin to re-check before making this word longer.
 */
export function PackOpenButton({
  offer,
  packId,
  className,
}: {
  offer: PackOpenOffer;
  /** The pack this button is on, as the deck spells its token id. */
  packId: string;
  className?: string;
}) {
  const mine = offer.opening === packId;
  return (
    <MintButton
      // Only this pack's own button reports the write; the rest read `Open` and are simply locked.
      flow={{ phase: mine ? offer.phase : 'ready', send: () => offer.open(packId) }}
      labels={OPEN_LABEL}
      variant="secondary"
      size="sm"
      disabled={!mine && offer.phase !== 'ready'}
      className={className}
    />
  );
}
