'use client';

import { useReadContract } from '@starknet-react/core';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getPistolsContract, type PistolsContractName } from '@/dojo/contracts';

//
// One view call on one of the world's contracts, over `@starknet-react/core`'s `useReadContract`.
//
// The chain hook is used bare, not cached on top of (specs/NEXTJS_DATA_FLOW.md §0) — this adds no
// query layer, it only resolves the contract and carries the return type. `useReadContract` builds
// a starknet.js `Contract` and calls it with `parseResponse: true`, so a Cairo struct comes back as
// an object and a Cairo enum as a `CairoCustomEnum` (which is what the SDK's `convert_*` helpers
// expect). Reads go through the `StarknetConfig` provider, so they work with no wallet connected.
//
// The one cast: `useReadContract`'s types come from abi-wan-kanabi, which infers `functionName`,
// `args` and the result from an `as const` ABI literal. Ours is runtime JSON out of the manifest
// (see `dojo/contracts.ts`), so the generics have nothing to read and each hook declares its own
// `T` instead. That cast lives here, once, rather than at every call site.
//
type ContractReadProps = {
  contract: PistolsContractName;
  /** The Cairo entrypoint, snake_case as the contract spells it. */
  functionName: string;
  /** Arguments in ABI order; compiled against the ABI by starknet.js. */
  args: unknown[];
  /** Skip the call — for arguments that are not known yet. Defaults to true. */
  enabled?: boolean;
  /** Refetch on every new block. Off by default: most of these change on our own writes. */
  watch?: boolean;
};

export function useContractRead<T>({
  contract,
  functionName,
  args,
  enabled = true,
  watch = false,
}: ContractReadProps): UseQueryResult<T, Error> {
  const { address, abi } = getPistolsContract(contract);

  return useReadContract({
    // biome-ignore lint/suspicious/noExplicitAny: runtime manifest ABI, see the note above
    abi: abi as any,
    address,
    functionName,
    args,
    enabled,
    watch,
  }) as UseQueryResult<T, Error>;
}

//
// Refetch view calls after our own write changed what they answer.
//
// `useQueryInvalidate().invalidateKey` can't reach these: starknet-react keys a read as a single
// object (`[{ entity: 'readContract', contract, functionName, args, … }]`), so matching a key
// *segment* never hits one. A predicate on that object is what does, and it is what makes
// `invalidateContractReads('pack_token')` mean "every view call on the pack token is now stale".
// Pass `functionName` when only one of them moved.
//
export function useInvalidateContractReads() {
  const queryClient = useQueryClient();

  return useCallback(
    (contract: PistolsContractName, functionName?: string) => {
      const { address } = getPistolsContract(contract);
      queryClient.invalidateQueries({
        predicate: query => {
          const key = query.queryKey[0] as
            | { entity?: string; contract?: string; functionName?: string }
            | undefined;
          if (key?.entity !== 'readContract') return false;
          if (BigInt(key.contract ?? 0) !== BigInt(address)) return false;
          return !functionName || key.functionName === functionName;
        },
      });
    },
    [queryClient],
  );
}
