'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTokenIds } from '@/components/providers/TokensProvider';

//
// A write whose result the player is waiting to *see*: send it, then keep waiting until the token it
// mints is on the felt.
//
// **A receipt is not what the player asked for.** Between `account.execute` landing and the cards
// appearing sits the indexer, and that gap is seconds long — so a control that went back to reading
// `Purchase` at the receipt would invite a second purchase, and one that merely stopped spinning
// would look finished with nothing to show. Hence `indexing`, a third phase that ends when Torii
// publishes the mint rather than when anything here decides it has waited long enough.
//
// **What ends the wait is the hand growing, not a poll.** `TokensProvider` already subscribes to
// every balance this account holds, so the arrival is delivered; all this has to do is remember how
// many of the token the player held when the write went out. That is also why the baseline is taken
// at the click and not at the receipt: with a slow wallet and a fast indexer the mint can be
// published *before* `isSuccess`, and a baseline read then would be the count that already includes
// it — an offer stuck on `indexing` for good.
//
// **Then it resets, so the control comes back.** A player may want a second pack; whoever offered the
// first one decides whether to keep offering (`use-pack-purchase.ts` does, `use-starter-pack.ts`
// cannot — its own eligibility is gone). Dropping the receipt is what returns the phase to `ready`.
//
// **Call it where it survives a navigation.** The mutation's state is React state: a component that
// unmounts mid-transaction takes the phase with it and the control comes back reading `ready` over a
// pending purchase. On the deck table that means `DecksScene` (mounted by the *layout*), never a page.
//

/** The token a mint is waited on, as `PROFILE.tokens` names it. */
export type MintToken = { game: string; name: string };

/**
 * How far along the write is. One value rather than a pair of booleans, because they are stages of
 * one thing and no two of them are ever true at once.
 *
 * - `ready` — the player's to take.
 * - `sending` — in the wallet and on its way to a block.
 * - `indexing` — it landed; waiting for Torii to publish what it minted.
 */
export type MintPhase = 'ready' | 'sending' | 'indexing';

/**
 * A mint the UI can drive and report on: one call to make it happen, one value for where it has got
 * to. Every offer built on {@link useMintFlow} carries this shape, which is what lets one button
 * (`pages/decks/MintButton`) serve all of them.
 */
export type MintFlow = {
  phase: MintPhase;
  send: () => void;
};

/** What a mint flow needs of a `useContractMutation` result. */
type MintMutation<TArgs> = {
  mutate: (variables: TArgs) => void;
  isPending: boolean;
  isSuccess: boolean;
  reset: () => void;
};

/**
 * Drive `mutation` and wait for what it mints to show up in the player's hand.
 *
 * `variables` are fixed for the life of the flow — a mint offer is one specific purchase, not a form
 * — so keep them a module constant rather than a literal built in render.
 */
export function useMintFlow<TArgs>(
  mutation: MintMutation<TArgs>,
  arrival: MintToken,
  variables: TArgs,
): MintFlow {
  const { mutate, isPending, isSuccess, reset } = mutation;
  const held = useTokenIds(arrival.game, arrival.name).length;

  // How many the player held when the write went out; `null` while nothing is in flight. A ref, not
  // state: nothing renders differently for it having been taken, only for the count passing it.
  const baseline = useRef<number | null>(null);

  const send = useCallback(() => {
    baseline.current = held;
    mutate(variables);
  }, [held, mutate, variables]);

  // Only ever read with a receipt in hand, which is what makes a baseline left behind by a reverted
  // transaction harmless — the next `send` overwrites it.
  const arrived = baseline.current !== null && held > baseline.current;

  // On the felt: drop the receipt, and with it the wait. The reset re-renders, so `isSuccess` is
  // false by the time anything reads the phase again.
  useEffect(() => {
    if (isSuccess && arrived) {
      baseline.current = null;
      reset();
    }
  }, [isSuccess, arrived, reset]);

  const phase: MintPhase = isPending ? 'sending' : isSuccess && !arrived ? 'indexing' : 'ready';

  // Memoized because an offer built on this one is itself memoized on it, and a fresh object every
  // render would defeat that.
  return useMemo(() => ({ phase, send }), [phase, send]);
}
