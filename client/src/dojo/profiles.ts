import { type Chain, mainnet, sepolia } from '@starknet-react/chains';
import {
  ChainId,
  type DojoManifest,
  getAdminAddress,
  getBankAddress,
  getBotPlayerAddress,
  getDuelistTokenAddress,
  getDuelTokenAddress,
  getFameAddress,
  getFoolsAddress,
  getGameAddress,
  getGameLoopAddress,
  getLordsAddress,
  getManifest,
  getMatchmakerAddress,
  getPackTokenAddress,
  getRingTokenAddress,
  getTournamentTokenAddress,
  getTutorialAddress,
  getVrfAddress,
  getWorldAddress,
  NAMESPACE,
  NetworkId,
} from '@underware/pistols-sdk/pistols/config';
import { stringToFelt } from '@underware/pistols-sdk/starknet';
import { bigintToAddress, bigintToHex, isPositiveBigint } from '@underware/pistols-sdk/utils';
import contractsJson from '@root/contracts.json';

//
// Chain profiles: one per network we ship, with every chain-dependent value in one place.
//
// Ported from /Users/roger/Dev/Realms/LORE/packages/client-sn/src/dojo/config_profiles.ts.
// Two deliberate differences: there is no local Katana profile (mainnet and sepolia only),
// and a profile carries a single `manifest` — LORE splits every field into starknet/appchain
// variants because it bridges to an appchain, and we do not.
//
// `contractAddresses` and `tokens` are derived in `getProfileConfig()`. Which contracts are
// tokens comes from `contracts.json` at the repo root — the same file that drives our Torii
// indexer, so the client can never read one set of tokens while the indexer fills another.
// Addresses come from the Dojo manifests in `@underware/pistols-sdk` for the `pistols` game,
// and from `contracts.json` for every other game.
//

export type ProfileName = 'mainnet' | 'sepolia';

export type TokenType = 'ERC20' | 'ERC721';

/** One ERC-20/ERC-721 contract, as indexed by our Torii. */
export type TokenContract = {
  game: string;
  name: string;
  type: TokenType;
  address: string;
};

export type ProfileConfig = {
  profileName: ProfileName;
  networkId: NetworkId;
  namespace: string;
  manifest: DojoManifest;
  chain: Chain; // @starknet-react/chains chain for StarknetConfig
  chainName: ChainId; // chain name, and the section key into contracts.json
  rpcUrl: string;
  toriiUrl: string;
  //
  // built in getProfileConfig()
  chainId: `0x${string}`; // chain name as the hex felt starknet uses
  /** Addresses per game — `pistols` holds its tokens and game contracts, other games only their tokens. */
  contractAddresses: Record<string, Record<string, string>>;
  /** Every token contract of every game, flattened; what `TokensProvider` queries. */
  tokens: TokenContract[];
};

const profileConfigs: Record<ProfileName, ProfileConfig> = {
  mainnet: {
    profileName: 'mainnet',
    networkId: NetworkId.MAINNET,
    namespace: NAMESPACE,
    manifest: getManifest({ networkId: NetworkId.MAINNET }),
    chain: mainnet,
    chainName: ChainId.SN_MAIN,
    rpcUrl: 'https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_9',
    toriiUrl: 'https://pistols-solitaire-mainnet.up.railway.app',
    // derived at getProfileConfig()
    chainId: '0x0',
    contractAddresses: {},
    tokens: [],
  },
  sepolia: {
    profileName: 'sepolia',
    networkId: NetworkId.SEPOLIA,
    namespace: NAMESPACE,
    manifest: getManifest({ networkId: NetworkId.SEPOLIA }),
    chain: sepolia,
    chainName: ChainId.SN_SEPOLIA,
    rpcUrl: 'https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_9',
    toriiUrl: 'https://pistols-solitaire-sepolia.up.railway.app',
    // derived at getProfileConfig()
    chainId: '0x0',
    contractAddresses: {},
    tokens: [],
  },
};

//----------------------------------------------------
// contract addresses
//

//
// Every pistols address the SDK resolves from that network's manifest — its tokens and its
// game contracts. Contracts a network never deployed resolve to zero and are dropped
// (mainnet has no `tournament_token`).
//
const pistolsAddresses = (networkId: NetworkId): Record<string, string> => {
  const addresses: Record<string, string> = {
    world: getWorldAddress(networkId),
    // erc-20
    lords: getLordsAddress(networkId),
    fame_coin: getFameAddress(networkId),
    fools_coin: getFoolsAddress(networkId),
    // erc-721
    duelist_token: getDuelistTokenAddress(networkId),
    duel_token: getDuelTokenAddress(networkId),
    pack_token: getPackTokenAddress(networkId),
    ring_token: getRingTokenAddress(networkId),
    tournament_token: getTournamentTokenAddress(networkId),
    // game contracts
    game: getGameAddress(networkId),
    game_loop: getGameLoopAddress(networkId),
    bot_player: getBotPlayerAddress(networkId),
    matchmaker: getMatchmakerAddress(networkId),
    tutorial: getTutorialAddress(networkId),
    bank: getBankAddress(networkId),
    admin: getAdminAddress(networkId),
    vrf: getVrfAddress(networkId),
  };
  return Object.fromEntries(
    Object.entries(addresses).filter(([, address]) => isPositiveBigint(address)),
  );
};

//
// Which contracts are tokens, of which kind, and for which game: all of it from the same
// `contracts.json` the indexer reads, so this list is exactly what Torii has balances for.
// Disabled entries stay in that file as history — nothing indexes them, so we never surface
// them. Addresses for the `pistols` game still come from the manifest, which is authoritative
// for the world's own deployments; other games exist only in contracts.json.
//
type ContractsJsonEntry = {
  game: string;
  name: string;
  type: string;
  address: string;
  enabled?: boolean;
};

const profileTokens = (chainName: ChainId, pistols: Record<string, string>): TokenContract[] =>
  (
    (contractsJson as Record<string, { contracts?: ContractsJsonEntry[] }>)[chainName]?.contracts ??
    []
  )
    .filter(entry => entry.enabled === true)
    .map(entry => ({
      game: entry.game,
      name: entry.name,
      type: entry.type as TokenType,
      address:
        (entry.game === 'pistols' ? pistols[entry.name] : undefined) ??
        bigintToAddress(entry.address),
    }));

export const getProfileConfig = (profileName: ProfileName): ProfileConfig => {
  const result: ProfileConfig = profileConfigs[profileName];
  if (!result) {
    throw new Error(`Profile config for [${profileName}] not found`);
  }

  result.chainId = bigintToHex(stringToFelt(result.chainName));

  const pistols = pistolsAddresses(result.networkId);
  const tokens = profileTokens(result.chainName, pistols);

  result.contractAddresses = tokens.reduce<Record<string, Record<string, string>>>(
    (acc, token) => {
      acc[token.game] = { ...acc[token.game], [token.name]: token.address };
      return acc;
    },
    { pistols },
  );
  result.tokens = tokens;

  return result;
};
