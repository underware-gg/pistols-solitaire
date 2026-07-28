import { getContractByName } from '@dojoengine/core';
import { getManifest, NAMESPACE } from '@underware/pistols-sdk/pistols/config';
import {
  type Abi,
  type AccountInterface,
  Contract,
  type ProviderInterface,
  type RawArgs,
} from 'starknet';
import { PROFILE } from '@/dojo/config';

//
// The world's system contracts we call directly: address + ABI, per active network.
//
// Both come out of the **SDK's own manifest** (`getManifest({ networkId })`), which is the same
// source `profiles.ts` reads its pistols addresses from — so an ABI here can never describe a
// contract other than the one we're calling. Nothing is vendored: hand-copied ABI slices would
// buy abi-wan-kanabi's type inference (it only infers from an `as const` literal) and pay for it
// with a second copy of the truth that drifts the day a contract is redeployed. Return types are
// declared by the hooks instead — `hooks/contracts/*`.
//
// This costs no bundle: the SDK statically imports all three manifests, so they are in the
// client either way. `@dojoengine/core`'s `getContractByName` resolves the `pistols-<name>` tag.
//
// Results are cached because the reference identity matters: `useReadContract` hands `abi` and
// `address` to `useContract`, which memoizes the starknet.js `Contract` on exactly those two, so
// a fresh object per render would rebuild it every render.
//

/** A Dojo system contract of the pistols world, by its manifest tag (minus the `pistols-`). */
export type PistolsContractName = 'game' | 'pack_token' | 'ring_token';

export type PistolsContract = {
  address: `0x${string}`;
  abi: Abi;
};

const _contracts = new Map<PistolsContractName, PistolsContract>();

export function getPistolsContract(name: PistolsContractName): PistolsContract {
  const cached = _contracts.get(name);
  if (cached) return cached;

  const manifest = getManifest({ networkId: PROFILE.networkId });
  const contract = getContractByName(manifest, NAMESPACE, name);
  if (!contract?.address || !contract?.abi) {
    throw new Error(`getPistolsContract(${name}): not in the ${PROFILE.profileName} manifest`);
  }

  const result: PistolsContract = {
    address: contract.address as `0x${string}`,
    abi: contract.abi as Abi,
  };
  _contracts.set(name, result);
  return result;
}

//
// One view call, right now, outside React.
//
// `hooks/contracts/use-contract-read.ts` is how a component reads the chain; this is for the inside
// of a write, where a value has to be current at the moment of the click rather than as of whenever
// a query last settled — a mint fee that a cached read got wrong is an approval for the wrong amount.
// The account doubles as the provider, so nothing extra has to be wired in to use it.
//
export async function callPistolsContract<T>(
  providerOrAccount: ProviderInterface | AccountInterface,
  name: PistolsContractName,
  entrypoint: string,
  args: RawArgs = [],
): Promise<T> {
  const { address, abi } = getPistolsContract(name);
  const contract = new Contract({ abi, address, providerOrAccount });
  return (await contract.call(entrypoint, args as never)) as T;
}
