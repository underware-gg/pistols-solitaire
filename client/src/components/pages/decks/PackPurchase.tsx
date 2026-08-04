'use client';

import { weiToEthString } from '@underware/pistols-sdk/starknet';
import { Plus } from 'lucide-react';
import { MintButton } from '@/components/pages/decks/MintButton';
import type { MintPhase } from '@/hooks/use-mint-flow';
import type { PackPurchaseOffer } from '@/hooks/use-pack-purchase';
import { cn } from '@/lib/cn';

//
// Buying a pack, in the two places the table shows it — the `+` in the empty slot on the browsing
// table, and the button under the deck on `/deck/packs`. Both on the **packs** deck, which is where
// the pack lands.
//
// The pair is the starter pack's, one deck over and a rung quieter: same shape (a label in the slot,
// the control on the deck's own page), `primary` rather than `accent`, because a page never has two
// accent buttons and the free pack is the louder offer whenever both could be on the table. They are
// never both on it — `usePackPurchaseOffer` is held back while the free pack is owed.
//

/**
 * The mark in the empty packs slot: a `+` in a circle, drawn where the pack will be. An empty slot on
 * its own reads as an absence — this is what turns it into somewhere cards can be *got*.
 *
 * A drawn mark rather than a `ui/NotificationBadge`, which is for finished art: this is a `+`, i.e. an
 * icon (`lucide`, per specs/CODING_STYLE.md), and it is drawn from the palette's own accent so it
 * belongs to whatever felt the player picked. It borrows the badge's `animate-notify` so the two marks
 * on this table pulse alike — a `filter`, so nothing here can carry a `drop-shadow`.
 *
 * Only shown while the deck is empty (`PackPurchaseOffer.empty`), and only ever a label: it takes no
 * pointer events, so the deck under it stays one hit target and the button under the deck is the one
 * thing to aim at.
 */
export function PackPurchaseMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        // `shrink-0`, because `Deck3D` centres a notice in a one-pixel box: a flex item that agreed to
        // shrink would collapse instead of overflowing it.
        'pointer-events-none flex size-16 shrink-0 animate-notify items-center justify-center rounded-full border-2 border-ps-accent bg-ps-panel/70 text-ps-accent motion-reduce:animate-none',
        className,
      )}
    >
      <Plus className="size-8" />
    </span>
  );
}

/**
 * What each phase says. `indexing` is the pack's own wait — the LORDS are spent and the receipt is in,
 * and the deck is still one pack short until Torii publishes the mint.
 */
const PURCHASE_LABEL: Record<MintPhase, string> = {
  ready: 'Buy a Pack',
  sending: 'Buying…',
  indexing: 'Indexing…',
};

/**
 * The purchase, under the packs deck. It names its price, because it spends real LORDS and the pack it
 * rolls is random: the charge is the *cheapest* of the packs it might deal, so it is a price and not
 * an estimate (`PURCHASE_RANDOM_PACK_TYPE`). Until the chain has quoted it the button is still
 * offered — the fee read and the purchase are independent, and a quote that has not landed is no
 * reason to withhold the control.
 *
 * **No `+` icon on it**, though the mark above is one: the price is what has to be read here, and the
 * button sits over the felt beside a dealt grid — measured, a wider label is what starts clipping the
 * nearest card's corner on a full page (`ACTION_DROP`).
 */
export function PackPurchaseButton({
  offer,
  className,
}: {
  offer: PackPurchaseOffer;
  className?: string;
}) {
  const labels =
    offer.fee === undefined
      ? PURCHASE_LABEL
      : { ...PURCHASE_LABEL, ready: `Buy a Pack · ${weiToEthString(offer.fee)} LORDS` };

  return <MintButton flow={offer} labels={labels} className={className} />;
}
