import type { Chain } from '@starknet-start/chains';
import { VoyagerExplorer } from '@starknet-start/explorers';
import { bigintToAddress } from '@underware/pistols-sdk/utils';
import type { BigNumberish } from 'starknet';
import { PROFILE } from '@/dojo/config';

//
// Block-explorer URLs, from `@starknet-start/explorers` — never a hand-written
// `voyager.online/...`, which would have to learn each network's subdomain.
// `VoyagerExplorer` reads the URL off `chain.explorers.voyager`, so the chain on the profile
// is the whole configuration.
//
// It is a plain class, not a hook (`useExplorer` needs the provider and would tie every link
// to the *connected* chain), so a caller can link to a network the app is not running on.
//
// A second explorer is another one-line factory here; nothing outside this file names one.
//

const explorers = new Map<Chain, VoyagerExplorer>();

const voyager = (chain: Chain): VoyagerExplorer => {
  const cached = explorers.get(chain);
  if (cached) return cached;
  const explorer = new VoyagerExplorer(chain);
  explorers.set(chain, explorer);
  return explorer;
};

/** Voyager page for a contract on `chain`, defaulting to the active profile's network. */
export const voyagerContractUrl = (address: BigNumberish, chain: Chain = PROFILE.chain): string =>
  voyager(chain).contract(bigintToAddress(address));
