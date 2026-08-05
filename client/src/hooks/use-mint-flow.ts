'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTokenIds } from '@/components/providers/TokensProvider';

//
// A write whose result the player is waiting to *see*: send it, then keep waiting until the tokens it
// mints are on the felt — and say which ones they were.
//
// **A receipt is not what the player asked for.** Between `account.execute` landing and the cards
// appearing sits the indexer, and that gap is seconds long — so a control that went back to reading
// `Purchase` at the receipt would invite a second purchase, and one that merely stopped spinning
// would look finished with nothing to show. Hence `indexing`, a third phase that ends when Torii
// publishes the mint rather than when anything here decides it has waited long enough.
//
// **What ends the wait is the hand growing, not a poll.** `TokensProvider` already subscribes to
// every balance this account holds, so the arrival is delivered; all this has to do is remember which
// tokens the player held when the write went out. That is also why the baseline is taken at the click
// and not at the receipt: with a slow wallet and a fast indexer the mint can be published *before*
// `isSuccess`, and a baseline read then would be the hand that already includes it — an offer stuck
// on `indexing` for good.
//
// **The difference is `arrivals`, and it outlives the flow.** Which tokens turned up is a strictly
// better answer than how many, and it is the one some callers came for: opening a pack has to put the
// duelists that came out of *that pack* on the table, not merely notice that the hand grew. So the
// arrivals are state, they survive the reset below, and only the next `send` (or `clear`) drops them.
//
// **Then it resets, so the control comes back.** A player may want a second pack; whoever offered the
// first one decides whether to keep offering (`use-pack-purchase.ts` does, `use-starter-pack.ts`
// cannot — its own eligibility is gone). Dropping the receipt is what returns the phase to `ready`.
//
// **The variables ride in on `send`, not on the hook.** Which token a write is about is not always
// known before the click: one `open` mutation serves a button on every pack on the felt
// (`use-pack-open.ts`), and `sent` is what tells one of those buttons that it is the one waiting. An
// offer that *is* one specific mint binds its own variables and hands its button a {@link MintControl}.
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
 * What a *control* needs of a mint: where it has got to, and one call to take it. Every offer on the
 * table exposes this shape, which is what lets one button (`pages/decks/MintButton`) serve all of
 * them — the variables of the write are the offer's business, bound before they reach here.
 */
export type MintControl = {
  phase: MintPhase;
  send: () => void;
};

/**
 * The whole mint, as {@link useMintFlow} reports it: a {@link MintControl} that also takes the write's
 * variables and says what came back.
 */
export type MintFlow<TArgs> = {
  phase: MintPhase;
  /** Take the mint. A `void` `TArgs` makes this a `MintControl['send']` as it stands. */
  send: (variables: TArgs) => void;
  /**
   * The variables of the write that is in flight or still being indexed; `undefined` at rest — so it
   * is what tells one button among many that *it* is the one waiting.
   */
  sent?: TArgs;
  /**
   * Ids of {@link MintToken} this account did not hold when the last `send` went out, from the moment
   * they land. **They outlive the reset below**: the wait being over is exactly when a caller wants
   * to show them. The next `send` clears them, and so does {@link clear}.
   */
  arrivals: string[];
  /** Drop the arrivals — whatever they were being shown for is over. */
  clear: () => void;
};

/** What a mint flow needs of a `useContractMutation` result. */
type MintMutation<TArgs> = {
  mutate: (variables: TArgs) => void;
  isPending: boolean;
  isSuccess: boolean;
  reset: () => void;
};

/** One array for "nothing arrived", so clearing an already-clear reveal costs no render. */
const NOTHING: string[] = [];

/**
 * Drive `mutation` and wait for what it mints to show up in the player's hand.
 *
 * The token ids that turn up are reported as {@link MintFlow.arrivals}; a caller with nothing to show
 * simply ignores them and reads the phase.
 */
export function useMintFlow<TArgs>(
  mutation: MintMutation<TArgs>,
  arrival: MintToken,
): MintFlow<TArgs> {
  const { mutate, isPending, isSuccess, reset } = mutation;
  const held = useTokenIds(arrival.game, arrival.name);

  // The hand as it stood when the write went out; `null` while nothing is in flight. State rather
  // than a ref, unlike the count this used to keep: the arrivals are derived from it, so a render has
  // to follow it being taken and being dropped.
  const [baseline, setBaseline] = useState<Set<string> | null>(null);
  const [sent, setSent] = useState<TArgs>();
  const [arrivals, setArrivals] = useState<string[]>(NOTHING);

  const send = useCallback(
    (variables: TArgs) => {
      setBaseline(new Set(held));
      // The updater form, because `TArgs` may itself be a function as far as this hook knows.
      setSent(() => variables);
      setArrivals(NOTHING);
      mutate(variables);
    },
    [held, mutate],
  );

  const clear = useCallback(() => setArrivals(NOTHING), []);

  // Only ever acted on with a receipt in hand, which is what makes a baseline left behind by a
  // reverted transaction harmless — the next `send` overwrites it.
  const arrived = baseline !== null && held.some(id => !baseline.has(id));

  // On the felt: publish what arrived, then drop the receipt and with it the wait. The reset
  // re-renders, so `isSuccess` is false by the time anything reads the phase again.
  useEffect(() => {
    if (!isSuccess || baseline === null) return;
    const fresh = held.filter(id => !baseline.has(id));
    if (fresh.length === 0) return;
    setBaseline(null);
    setArrivals(fresh);
    reset();
  }, [isSuccess, baseline, held, reset]);

  const phase: MintPhase = isPending ? 'sending' : isSuccess && !arrived ? 'indexing' : 'ready';

  // Memoized because an offer built on this one is itself memoized on it, and a fresh object every
  // render would defeat that. `sent` is gated on the phase rather than cleared: an error leaves the
  // mutation at rest with its variables still in state, and at rest nobody is waiting.
  return useMemo(
    () => ({ phase, send, sent: phase === 'ready' ? undefined : sent, arrivals, clear }),
    [phase, send, sent, arrivals, clear],
  );
}
