'use client';

import type { constants } from '@underware/pistols-sdk/pistols/gen';
import { makeCustomEnum, parseEnumVariant } from '@underware/pistols-sdk/starknet';
import { bigintToAddress, bigintToHex, isPositiveBigint } from '@underware/pistols-sdk/utils';
import { useMemo } from 'react';
import type { BigNumberish, CairoCustomEnum, CairoOption } from 'starknet';
import { useContractMutation } from '@/hooks/contracts/use-contract-mutation';
import { useContractRead, useInvalidateContractReads } from '@/hooks/contracts/use-contract-read';
import { useController } from '@/hooks/use-controller';

//
// `pistols-ring_token` — the signet ring ERC-721.
//
// **There is no `can_claim_ring` / `claim_ring` entrypoint.** Checked against both the published
// SDK manifest and the newer one in the pistols checkout: a ring is always claimed *for a duel*,
// and the contract spells the pair
//
//   get_claimable_season_ring_type(recipient, duel_id) -> Option<RingType>
//   claim_season_ring(duel_id, ring_type) -> u128
//
// so the hooks below are named for the intent and call those. The third view, `has_claimed(recipient,
// ring_type)`, answers "does this account already hold that ring" independently of any duel — add a
// hook for it when something needs it.
//

const CONTRACT = 'ring_token';

/**
 * `get_claimable_season_ring_type(recipient, duel_id) -> Option<RingType>` — which ring, if any,
 * this duel earns the account. Defaults to the connected account.
 *
 * The Cairo `Option` comes back as a starknet.js `CairoOption`, so "no ring" is `None` rather than a
 * zero value: `canClaimRing` is false and `ringType` undefined. A `Some` carries the variant, which
 * is also what `useClaimRing` needs handed back to it.
 */
export function useCanClaimRing(duelId: BigNumberish, recipient?: BigNumberish) {
  const { address } = useController();
  const account = recipient ?? address ?? 0n;

  const query = useContractRead<CairoOption<CairoCustomEnum>>({
    contract: CONTRACT,
    functionName: 'get_claimable_season_ring_type',
    args: [bigintToAddress(account), bigintToHex(duelId ?? 0n)],
    enabled: isPositiveBigint(account) && isPositiveBigint(duelId ?? 0n),
  });

  const ringType = useMemo(() => {
    const option = query.data;
    if (!option?.isSome()) return undefined;
    return parseEnumVariant<constants.RingType>(option.unwrap() ?? null);
  }, [query.data]);

  return {
    ...query,
    ringType,
    canClaimRing: query.data ? ringType !== undefined : undefined,
  };
}

export type ClaimRingArgs = {
  /** The duel that earned the ring. */
  duelId: BigNumberish;
  /** Which ring — the `ringType` `useCanClaimRing` returned for this same duel. */
  ringType: constants.RingType;
};

/**
 * `claim_season_ring(duel_id, ring_type)` — mints the ring this duel earned.
 *
 * `ring_type` is a Cairo enum, built with the SDK's `makeCustomEnum` and compiled against the ABI
 * like every other argument. Passing a type the duel did not earn is the contract's call to reject,
 * so it surfaces as a revert in the toast.
 */
export function useClaimRing() {
  const invalidateContractReads = useInvalidateContractReads();

  return useContractMutation<ClaimRingArgs>({
    contract: CONTRACT,
    entrypoint: 'claim_season_ring',
    args: ({ duelId, ringType }) => [
      bigintToHex(duelId),
      makeCustomEnum(ringType) as CairoCustomEnum,
    ],
    onSuccess: () => invalidateContractReads(CONTRACT),
  });
}
