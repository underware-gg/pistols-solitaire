import { erc20_abi } from '@underware/pistols-sdk/abis';
import { bigintToU256 } from '@underware/pistols-sdk/starknet';
import { bigintToAddress, isPositiveBigint } from '@underware/pistols-sdk/utils';
import { type BigNumberish, type Call, CallData } from 'starknet';
import { PROFILE } from '@/dojo/config';
import { getPistolsContract, type PistolsContractName } from '@/dojo/contracts';

//
// The calls that ride *in front of* a system call in the same transaction.
//
// A paid Dojo entrypoint is rarely one call: the contract pulls LORDS, so an ERC-20 approval has to
// land first, and anything that draws randomness needs a VRF request in the same transaction. Both
// are the world's shape rather than any one entrypoint's, so they live here and the per-entrypoint
// hooks compose them (see `hooks/contracts/use-contract-mutation.tsx`'s `before`).
//
// Addresses come from `PROFILE.contractAddresses.pistols`, the one registry — never a getter called
// a second time here.
//

/** An ERC-20 `approve`, or nothing at all for a zero value — there is no point in the call. */
export function approveErc20Call(
  tokenAddress: BigNumberish,
  spenderAddress: BigNumberish,
  value: BigNumberish,
): Call | undefined {
  if (!isPositiveBigint(value)) return undefined;
  return {
    contractAddress: bigintToAddress(tokenAddress),
    entrypoint: 'approve',
    calldata: new CallData(erc20_abi).compile('approve', [
      bigintToAddress(spenderAddress),
      bigintToU256(value),
    ]),
  };
}

/** Let the bank take `value` LORDS — what every purchase in this world is paid with. */
export function approveLordsCall(value: BigNumberish): Call | undefined {
  const { lords, bank } = PROFILE.contractAddresses.pistols;
  return approveErc20Call(lords, bank, value);
}

//
// A Cartridge VRF request for `contract`, seeded off the caller's own address.
// https://docs.cartridge.gg/vrf/overview#executing-vrf-transactions
//
// The `source` argument is a Cairo enum and is compiled by hand — `{ type: 0, … }` is
// `Source::Nonce(address)`, its first variant. The VRF contract is not a Dojo resource, so it has no
// row in our manifest and no ABI to compile against; this is the same shape the Pistols SDK sends.
//
export function vrfRequestCall(contract: PistolsContractName, accountAddress: BigNumberish): Call {
  const { address } = getPistolsContract(contract);
  return {
    contractAddress: bigintToAddress(PROFILE.contractAddresses.pistols.vrf),
    entrypoint: 'request_random',
    calldata: CallData.compile({
      caller: address,
      source: { type: 0, address: bigintToAddress(accountAddress) },
    }),
  };
}
