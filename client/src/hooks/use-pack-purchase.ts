'use client';

import { useMemo } from 'react';
import {
  useTokenBalances,
  useTokenContract,
  useTokenIds,
} from '@/components/providers/TokensProvider';
import { MAIN_GAME } from '@/dojo/profiles';
import {
  PURCHASE_RANDOM_PACK_TYPE,
  useCalcMintFee,
  useCanPurchase,
  usePurchaseRandom,
} from '@/hooks/contracts/use-pack-token';
import { useController } from '@/hooks/use-controller';
import { type MintFlow, type MintToken, useMintFlow } from '@/hooks/use-mint-flow';

//
// Buying a pack: `purchase_random`, on the deck the pack lands in.
//
// **One purchase, not a shop.** `purchase_random` takes no arguments — it rolls one of the available
// 5x duelist packs and charges the cheaper of them (`PURCHASE_RANDOM_PACK_TYPE`) — so there is nothing
// for the player to choose and the whole offer is a price and a button. A shop with a pack type to
// pick is `usePurchase`, and it is a different feature.
//
// **The chain says whether it is on offer, and it says it in one call.** `can_purchase(account, type)`
// is `pack_type.can_purchase() && !can_claim_starter_pack(account)` — the same pair `_purchase`
// asserts on — so one read covers both "packs are on sale" and "this player has taken their free one
// first". It says nothing about the LORDS balance: an account that cannot pay is still offered the
// purchase and finds out from the revert, which is the honest place to find out.
//
// **The free pack comes first anyway, and `enabled` is what makes that visible.** The offer would
// resolve to nothing on its own while the starter pack is owed, but `useClaimStarterPack` invalidates
// every pack-token read the moment the claim lands — so `can_purchase` turns `true` while the claimed
// duelists are still being indexed, and the table would grow a Purchase button under a deck that is
// still finishing a claim. `DecksScene` passes `enabled: !starterPack`, which holds the offer back
// until the claim is over and saves a brand-new account two reads besides.
//
// **The wait is `useMintFlow`'s**: the purchase is over when the pack is on the felt, not when the
// receipt lands, and the deck the button sits under is where it turns up.
//

const PACKS_TOKEN: MintToken = { game: MAIN_GAME, name: 'Packs' };

export type PackPurchaseOffer = MintFlow & {
  /** Slug of the **packs** deck: where the button sits, and where the pack arrives. */
  slug: string;
  /** What it will cost, in LORDS wei, once the chain has said. */
  fee?: bigint;
  /**
   * True while the player holds no packs at all — the deck is an empty slot, so it is worth marking
   * as somewhere cards can be *got* rather than leaving it to read as an absence. A player who
   * already holds packs needs no invitation, only the button.
   */
  empty: boolean;
};

/**
 * The purchase, or `undefined` when there is none — not connected, balances not in yet, or the chain
 * says no. A truthy result *is* the offer, so a caller never tests a flag.
 *
 * Meant to be called **once**, by `DecksScene`: it is the component that survives the navigation
 * between the two deck routes, and a purchase that outlives its own receipt has to (see
 * `use-mint-flow.ts`).
 */
export function usePackPurchaseOffer({
  /** False while something else has the player's attention — the free starter pack. See above. */
  enabled = true,
}: {
  enabled?: boolean;
} = {}): PackPurchaseOffer | undefined {
  const { isConnected } = useController();
  // Balances have to be in before anything is offered: `useMintFlow` measures the arrival against the
  // hand as it stood at the click, and a hand still being counted is zero of everything.
  const { isLoading } = useTokenBalances();
  const packs = useTokenIds(PACKS_TOKEN.game, PACKS_TOKEN.name);
  const deck = useTokenContract(PACKS_TOKEN.game, PACKS_TOKEN.name);

  const asking = enabled && isConnected && !isLoading;
  const { canPurchase } = useCanPurchase(PURCHASE_RANDOM_PACK_TYPE, undefined, {
    enabled: asking,
  });
  const { fee } = useCalcMintFee(PURCHASE_RANDOM_PACK_TYPE, undefined, { enabled: asking });

  const purchase = usePurchaseRandom();
  const flow = useMintFlow(purchase, PACKS_TOKEN, undefined);

  // Live while the chain says yes, and **still live through the purchase**: the flow's phase carries
  // it past the receipt, so the button reports the indexing wait instead of going quiet. Nothing ends
  // this offer the way duelists end the starter pack's — a player who bought one pack may buy another
  // — so the flow's own reset is what puts the button back to `Purchase` when the pack arrives.
  const available = asking && (canPurchase === true || flow.phase !== 'ready');

  return useMemo(
    () =>
      available && deck ? { slug: deck.slug, fee, empty: packs.length === 0, ...flow } : undefined,
    [available, deck, fee, packs.length, flow],
  );
}
