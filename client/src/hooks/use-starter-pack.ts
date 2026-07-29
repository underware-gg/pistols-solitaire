'use client';

import { bigintToAddress } from '@underware/pistols-sdk/utils';
import { useEffect, useMemo } from 'react';
import {
  useTokenBalances,
  useTokenContract,
  useTokenIds,
} from '@/components/providers/TokensProvider';
import { useCanClaimStarterPack, useClaimStarterPack } from '@/hooks/contracts/use-pack-token';
import { useController } from '@/hooks/use-controller';

//
// The free starter pack, while the connected player is still owed one.
//
// Two questions, cheapest first. **Torii already knows whether the player holds a duelist**, and a
// player who holds one has been through this — so the balances the app is subscribed to anyway are
// what decides whether the chain is worth asking at all, and `can_claim_starter_pack` is only spent
// on an empty-handed account. Nothing is asked before the balances have landed: `isLoading` covers
// both the reconnect and the first fetch (`TokensProvider`), and an empty hand is not the truth
// until it is false.
//
// **The view call is made once per player address, for the session.** react-query keys the read by
// its arguments, but its `staleTime` is 60s (`providers.tsx`) and `useReadContract` does not let a
// caller raise it — so a remount a minute later would ask again, as would any other pack-token write
// invalidating its reads. The answer cannot change on its own (only our own claim changes it, and
// then it changes for good), so it is latched here instead: once an address has an answer the read is
// disabled, and a disabled query still serves what it fetched.
//
// Which leaves the claim, and it is the reason the latch is safe: a landed claim **drops the latched
// answer**, so the next render asks the chain again and gets the `false` that ends the offer for
// good. Dropping it rather than assuming the answer is what makes this self-healing — a player who
// leaves the table mid-claim comes back to a question, not to a stale `true` and a button that would
// revert. The claim's own `invalidateContractReads` is the belt to that brace.
//

/** The collection the free pack lands in — where the claim lives, and what it fills. */
const PACKS_TOKEN = { game: 'pistols', name: 'Packs' } as const;
/** Holding one of these means the player is past their first pack. */
const DUELISTS_TOKEN = { game: 'pistols', name: 'Duelists' } as const;

/** `can_claim_starter_pack` per player address, for the life of the session. See the note above. */
const answers = new Map<string, boolean>();

export type StarterPackOffer = {
  /** Slug of the deck the pack lands in — the route the offer points at, and where `claim` belongs. */
  slug: string;
  claim: () => void;
  /** True from the click until the transaction lands, so the button can say so and stop taking a second. */
  isClaiming: boolean;
};

/**
 * The offer, or `undefined` when there is none — not connected, holds a duelist, or the chain says
 * the pack has already been claimed. A truthy result *is* the offer, so a caller never tests a flag.
 *
 * Meant to be called **once**, by `DecksScene`, which serves it to its pages through `useDecksView`:
 * the latch above is per address and the claim is a mutation, so a second call site would ask the
 * same question again and hold its own idea of whether a claim is in flight.
 */
export function useStarterPackOffer(): StarterPackOffer | undefined {
  const { address, isConnected } = useController();
  const { isLoading } = useTokenBalances();
  const duelists = useTokenIds(DUELISTS_TOKEN.game, DUELISTS_TOKEN.name);
  const packs = useTokenContract(PACKS_TOKEN.game, PACKS_TOKEN.name);
  // `isSuccess` is the receipt, and it is read rather than hooked into a callback on purpose: the
  // per-call `onSuccess` is one of the ones react-query skips when a component unmounts mid-flight
  // (`use-contract-mutation.tsx`), and this is exactly the moment that would drop.
  const { mutate, isPending, isSuccess } = useClaimStarterPack();

  // Padded lowercase, so the same player is one key however the wallet spelled the address.
  const player = address ? bigintToAddress(address) : undefined;

  const empty = Boolean(player) && isConnected && !isLoading && duelists.length === 0;
  const answered = player !== undefined && answers.has(player);

  const { canClaimStarterPack } = useCanClaimStarterPack(undefined, {
    enabled: empty && !answered,
  });

  useEffect(() => {
    if (player && canClaimStarterPack !== undefined) answers.set(player, canClaimStarterPack);
  }, [player, canClaimStarterPack]);

  // The claim landed: forget the answer so the read asks again. It settles in one round — the fresh
  // answer is `false`, which latches and disables the read for the rest of the session.
  useEffect(() => {
    if (isSuccess && player) answers.delete(player);
  }, [isSuccess, player]);

  const available =
    empty &&
    player !== undefined &&
    !isSuccess &&
    (answers.get(player) ?? canClaimStarterPack) === true;

  return useMemo(
    () =>
      available && packs
        ? { slug: packs.slug, claim: () => mutate({}), isClaiming: isPending }
        : undefined,
    [available, packs, isPending, mutate],
  );
}
