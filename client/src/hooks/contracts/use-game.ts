'use client';

import { type DuelProgress, convert_duel_progress } from '@underware/pistols-sdk/pistols';
import { bigintToHex, isPositiveBigint } from '@underware/pistols-sdk/utils';
import { useMemo } from 'react';
import type { BigNumberish } from 'starknet';
import { useContractRead } from '@/hooks/contracts/use-contract-read';

//
// `pistols-game` — the duel system. One hook per entrypoint we call; both are views.
//

const CONTRACT = 'game';

/**
 * `get_duel_deck(duel_id) -> Span<Span<u8>>` — the card ids each duelist may draw from, one inner
 * span per deck. Returned as plain numbers; the raw values are `u8` card ids, not table positions.
 */
export function useGetDuelDeck(duelId: BigNumberish) {
  const query = useContractRead<BigNumberish[][]>({
    contract: CONTRACT,
    functionName: 'get_duel_deck',
    args: [bigintToHex(duelId ?? 0n)],
    enabled: isPositiveBigint(duelId ?? 0n),
  });

  const decks = useMemo(
    () => query.data?.map(deck => deck.map(card => Number(card))),
    [query.data],
  );

  return { ...query, decks };
}

/**
 * `get_duel_progress(duel_id) -> DuelProgress` — the full replay of a settled duel.
 *
 * The Cairo type is a struct of enums, so the response is a tree of `CairoCustomEnum`s;
 * `convert_duel_progress` (a pure SDK helper, no Dojo context) flattens it into named card values.
 *
 * **It only answers for a finished duel** — the contract returns an empty `steps` for one still in
 * play, and for a moment after it settles too, while the block confirms. So gate the call on the
 * duel being over rather than reading `steps.length === 0` as "no such duel".
 */
export function useGetDuelProgress(duelId: BigNumberish, enabled = true) {
  const query = useContractRead<unknown>({
    contract: CONTRACT,
    functionName: 'get_duel_progress',
    args: [bigintToHex(duelId ?? 0n)],
    enabled: enabled && isPositiveBigint(duelId ?? 0n),
  });

  const duelProgress = useMemo<DuelProgress | null>(
    () => (query.data ? convert_duel_progress(query.data) : null),
    [query.data],
  );

  return { ...query, duelProgress };
}
