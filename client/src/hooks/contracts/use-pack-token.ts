'use client';

import type { constants } from '@underware/pistols-sdk/pistols/gen';
import { makeCustomEnum } from '@underware/pistols-sdk/starknet';
import { bigintToAddress, bigintToHex, isPositiveBigint } from '@underware/pistols-sdk/utils';
import type { BigNumberish, CairoCustomEnum } from 'starknet';
import { approveLordsCall, vrfRequestCall } from '@/dojo/calls';
import { callPistolsContract } from '@/dojo/contracts';
import { useContractMutation } from '@/hooks/contracts/use-contract-mutation';
import { useContractRead, useInvalidateContractReads } from '@/hooks/contracts/use-contract-read';
import { useController } from '@/hooks/use-controller';

//
// `pistols-pack_token` — the pack ERC-721. One hook per entrypoint we call.
//
// **A paid pack is three calls, not one**: approve the bank for the mint fee, request VRF (the pack's
// contents are random), then the entrypoint. `useContractMutation`'s `before` puts the first two in
// the same transaction — see `dojo/calls.ts`. The free claims below need neither.
//
// **`PackType` is ahead of the ABI.** The SDK's TS enum carries nine variants; the pack contract in
// the published manifest declares seven, so `PiratesDuelists5x` and `FreePirates5x` will not compile
// against it. That resolves itself when the SDK release catches up — until then, treat the manifest's
// list as the real one.
//

const CONTRACT = 'pack_token';

// Every pack argument is the same Cairo enum. Undefined stays undefined so `enabled` can catch it.
const packTypeEnum = (packType?: constants.PackType) =>
  (packType ? makeCustomEnum(packType) : undefined) as CairoCustomEnum | undefined;

/**
 * `can_claim_starter_pack(recipient) -> bool` — is this account still owed its free starter pack?
 * Defaults to the connected account, and stays disabled until there is one.
 *
 * `enabled` is for a caller with a cheaper question to ask first: `useStarterPackOffer` only spends
 * this call on a player who holds no duelists, and only once per address per session.
 */
export function useCanClaimStarterPack(
  recipient?: BigNumberish,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const { address } = useController();
  const account = recipient ?? address ?? 0n;

  const query = useContractRead<boolean>({
    contract: CONTRACT,
    functionName: 'can_claim_starter_pack',
    args: [bigintToAddress(account)],
    enabled: enabled && isPositiveBigint(account),
  });

  return { ...query, canClaimStarterPack: query.data };
}

/** Every field optional, so the call site is `claimStarterPack({})`. */
export type ClaimStarterPackArgs = {
  /** Who referred this player, if anyone. Zero means nobody, which is the norm. */
  referrerAddress?: BigNumberish;
};

/**
 * `claim_starter_pack(referrer_address)` — mints the free pack.
 *
 * A single call: unlike `purchase`, the starter pack costs nothing and draws no randomness, so it
 * needs neither a LORDS approval nor a VRF request in front of it. Once it lands,
 * `can_claim_starter_pack` is stale by definition, so every pack-token view is refetched (the packs
 * themselves arrive through Torii's own subscription, not from here).
 */
export function useClaimStarterPack() {
  const invalidateContractReads = useInvalidateContractReads();

  return useContractMutation<ClaimStarterPackArgs>({
    contract: CONTRACT,
    entrypoint: 'claim_starter_pack',
    args: ({ referrerAddress }) => [bigintToAddress(referrerAddress ?? 0n)],
    onSuccess: () => invalidateContractReads(CONTRACT),
  });
}

/**
 * `can_purchase(recipient, pack_type) -> bool` — may this account buy that pack?
 *
 * The contract reads `!can_claim_starter_pack(recipient) && pack_type.can_purchase()`, so it is two
 * things: **the starter pack has to be out of the way first** (a brand new account gets `false` here
 * and `true` from `useCanClaimStarterPack`), and the type has to be one that is on sale at all. It
 * says nothing about the LORDS balance — an account that cannot pay still gets `true` and reverts.
 *
 * `enabled` is for a caller that already knows the answer is no use to it — `usePackPurchaseOffer`
 * drops the question entirely while the free pack is still on the table.
 */
export function useCanPurchase(
  packType?: constants.PackType,
  recipient?: BigNumberish,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const { address } = useController();
  const account = recipient ?? address ?? 0n;
  const packTypeArg = packTypeEnum(packType);

  const query = useContractRead<boolean>({
    contract: CONTRACT,
    functionName: 'can_purchase',
    args: [bigintToAddress(account), packTypeArg],
    enabled: enabled && isPositiveBigint(account) && Boolean(packTypeArg),
  });

  return { ...query, canPurchase: query.data };
}

/**
 * `calc_mint_fee(recipient, pack_type) -> u128` — what that pack costs, in LORDS wei.
 *
 * The contract **ignores `recipient`** and returns the type's own price (50 LORDS for
 * `GenesisDuelists5x` on mainnet, 10 for `SingleDuelist`), so this is not a per-account quote — it is
 * still passed because the entrypoint takes it. For display: `usePurchase` asks again at click time
 * rather than reading it from here, so an approval can never be built off a stale block.
 */
export function useCalcMintFee(
  packType?: constants.PackType,
  recipient?: BigNumberish,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const { address } = useController();
  const account = recipient ?? address ?? 0n;
  const packTypeArg = packTypeEnum(packType);

  const query = useContractRead<bigint>({
    contract: CONTRACT,
    functionName: 'calc_mint_fee',
    args: [bigintToAddress(account), packTypeArg],
    enabled: enabled && isPositiveBigint(account) && Boolean(packTypeArg),
  });

  return { ...query, fee: query.data };
}

export type PurchaseArgs = {
  packType: constants.PackType;
  /** How many, default 1. The contract mints them as separate packs. */
  quantity?: number;
};

/** `purchase(pack_type, quantity)` — buys a pack: approve LORDS, request VRF, then mint. */
export function usePurchase() {
  const invalidateContractReads = useInvalidateContractReads();

  return useContractMutation<PurchaseArgs>({
    contract: CONTRACT,
    entrypoint: 'purchase',
    args: ({ packType, quantity = 1 }) => [packTypeEnum(packType) as CairoCustomEnum, quantity],
    before: async ({ packType }, { account }) => {
      const fee = await callPistolsContract<bigint>(account, CONTRACT, 'calc_mint_fee', [
        account.address,
        packTypeEnum(packType) as CairoCustomEnum,
      ]);
      return [approveLordsCall(fee), vrfRequestCall(CONTRACT, account.address)];
    },
    onSuccess: () => invalidateContractReads(CONTRACT),
  });
}

/**
 * The pack type `purchase_random` is **priced and gated by**, and the one thing a caller has to know
 * about an entrypoint that takes no arguments:
 *
 * - the **price** is `min(calc_mint_fee(…))` over the contract's available list, which is
 *   `GenesisDuelists5x` (50 LORDS on mainnet) and `PiratesDuelists5x` (100) — so this is the charge,
 *   and `usePurchaseRandom` approves exactly it;
 * - the **eligibility** is `_purchase`'s own two asserts, `pack_type.can_purchase()` and
 *   `!can_claim_starter_pack(recipient)`, which is `can_purchase(recipient, this)` exactly — so
 *   `useCanPurchase` on it is the gate, and a player still owed the free pack gets `false` here and
 *   would get `CLAIM_FIRST` from the chain.
 *
 * Both hold only while Genesis is the cheaper of the two; re-check them if the available list changes.
 */
export const PURCHASE_RANDOM_PACK_TYPE = 'GenesisDuelists5x' as constants.PackType;

/**
 * `purchase_random()` — buys one of the 5x duelist packs at random.
 *
 * **The price is the cheapest of the packs it might give you**, not the one it picks — see
 * {@link PURCHASE_RANDOM_PACK_TYPE}, which is what the approval in front of it is built from.
 *
 * **Not in the published SDK manifest** (1.3.2), only in the newer pistols checkout — live on chain,
 * no ABI entry here. It takes no arguments, which is what makes that harmless: with no `args` the
 * mutation compiles no calldata and never looks the entrypoint up. `calc_mint_fee` *is* in the
 * manifest, so the approval is unaffected.
 */
export function usePurchaseRandom() {
  const invalidateContractReads = useInvalidateContractReads();

  return useContractMutation({
    contract: CONTRACT,
    entrypoint: 'purchase_random',
    before: async (_variables, { account }) => {
      const fee = await callPistolsContract<bigint>(account, CONTRACT, 'calc_mint_fee', [
        account.address,
        packTypeEnum(PURCHASE_RANDOM_PACK_TYPE) as CairoCustomEnum,
      ]);
      return [approveLordsCall(fee), vrfRequestCall(CONTRACT, account.address)];
    },
    onSuccess: () => invalidateContractReads(CONTRACT),
  });
}

export type OpenPackArgs = {
  /** The pack token id — one the account owns and has not opened. */
  packId: BigNumberish;
};

/**
 * `open(pack_id)` — tears the pack open and mints what is inside.
 *
 * A single call: the randomness was drawn when the pack was bought, so there is nothing to approve
 * and no VRF request. What comes out lands as duelist tokens, which reach the app through Torii's
 * subscription rather than from here.
 */
export function useOpenPack() {
  const invalidateContractReads = useInvalidateContractReads();

  return useContractMutation<OpenPackArgs>({
    contract: CONTRACT,
    entrypoint: 'open',
    args: ({ packId }) => [bigintToHex(packId)],
    onSuccess: () => invalidateContractReads(CONTRACT),
  });
}
