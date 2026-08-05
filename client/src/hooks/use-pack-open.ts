'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useTokenContract } from '@/components/providers/TokensProvider';
import { MAIN_GAME } from '@/dojo/profiles';
import { useOpenPack } from '@/hooks/contracts/use-pack-token';
import { type MintPhase, type MintToken, useMintFlow } from '@/hooks/use-mint-flow';

//
// Tearing a pack open: `open(pack_id)` on every pack the player holds, and the duelists that come out.
//
// **This is the table's third offer and the first that is not one button.** The starter pack and the
// purchase each hang a control under a *deck* (`DECKS.md` §6); an open belongs to one **card**, and
// there is a card for every pack on the felt — so what this hook serves is not a control but the
// pieces one is built from: which pack is being opened, where that write has got to, and the call to
// start another. `pages/decks/PackOpen.tsx` turns those into a button per card.
//
// **One mutation for all of them**, which is the reason `useMintFlow` takes its variables at the click
// rather than at the hook: N cards, one write in flight, and `sent` is what tells one button among
// them that it is the one waiting. It is also what makes "no second open while one is running" a fact
// rather than a rule each button has to keep — there is a single phase.
//
// **No view is asked first.** `open` asserts ownership and that the pack is unopened, and both are
// already true of anything on this felt: the deck is the account's own packs from Torii, and an opened
// pack is burned, so it leaves the hand in the same transaction that mints what was inside. The
// contract has no `can_open` to ask anyway.
//
// **What comes out is duelists, and they are the point.** So the wait is measured against the
// *duelists* — the pack itself only disappears — and the flow's `arrivals` are the ids of the ones
// this open minted, which is what the table deals beside the packs that are left (`CardTable`'s
// `reveal`). A pack that mints nothing new would leave the flow waiting, which is correct: a pack
// always mints at least one duelist.
//
// **The reveal belongs to this visit to the deck.** Leaving `/deck/packs` clears it, so coming back is
// a table of packs and not last time's duelists still lying on the felt. Opening another pack clears
// it too — that one is `useMintFlow`'s own doing, and it is what sends the previous duelists home.
//

const PACKS_TOKEN: MintToken = { game: MAIN_GAME, name: 'Packs' };
const DUELISTS_TOKEN: MintToken = { game: MAIN_GAME, name: 'Duelists' };

/** One array for "nothing revealed", so a table off the packs deck re-renders no more than it must. */
const NOTHING: string[] = [];

export type PackOpenOffer = {
  /**
   * Slug of the **packs** deck: whose cards carry the buttons, and beside whose page what they mint is
   * dealt. The pack is where the gesture starts and the duelists arrive next to it, so one deck
   * carries both — the same shape as the other two offers naming their own deck.
   */
  slug: string;
  /** Where the write has got to. Only ever about {@link opening}. */
  phase: MintPhase;
  /** The pack being opened, if one is — the token id, as the deck spells it. */
  opening?: string;
  /** Tear one open. Refused while another is in flight, which is `phase`'s to say. */
  open: (packId: string) => void;
  /**
   * Contract address of the duelists collection: whose art the revealed cards wear, and whose deck
   * they fly home to when the next pack is opened.
   */
  duelists: string;
  /** Token ids of the duelists the last open minted, while they are still on the felt. */
  revealed: string[];
};

/**
 * The open offer, or `undefined` on a network with no packs or duelists contract. Unlike the other two
 * offers this one asks the chain nothing and is not gated on a connection: a player with no packs has
 * no cards to put a button on, which is the same answer arrived at for free.
 *
 * Meant to be called **once**, by `DecksScene` — the component that survives the navigation between
 * the two deck routes, so an open survives it too (`use-mint-flow.ts`).
 *
 * `slug` is the deck the URL has open, which is how the reveal is scoped to this visit.
 */
export function usePackOpenOffer(slug: string | null): PackOpenOffer | undefined {
  const packs = useTokenContract(PACKS_TOKEN.game, PACKS_TOKEN.name);
  const duelists = useTokenContract(DUELISTS_TOKEN.game, DUELISTS_TOKEN.name);

  const mutation = useOpenPack();
  const flow = useMintFlow(mutation, DUELISTS_TOKEN);
  const { clear, send } = flow;

  const open = useCallback((packId: string) => send({ packId }), [send]);

  // Off the packs deck there is nothing to reveal on, so the reveal is dropped rather than parked:
  // the cards it was showing are already flying home with the rest of the hand.
  const showing = packs !== undefined && slug === packs.slug;
  useEffect(() => {
    if (!showing) clear();
  }, [showing, clear]);

  return useMemo(
    () =>
      packs && duelists
        ? {
            slug: packs.slug,
            phase: flow.phase,
            // The id went out as a string and comes back as the `BigNumberish` the entrypoint takes.
            opening: flow.sent === undefined ? undefined : String(flow.sent.packId),
            open,
            duelists: duelists.address,
            // `clear` above settles this a render later, so the ternary is what makes the reveal
            // disappear on the same frame the URL does.
            revealed: showing ? flow.arrivals : NOTHING,
          }
        : undefined,
    [packs, duelists, flow.phase, flow.sent, flow.arrivals, open, showing],
  );
}
