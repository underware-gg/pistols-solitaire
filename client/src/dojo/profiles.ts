import { type Chain, mainnet, sepolia } from '@starknet-react/chains';
import {
  ChainId,
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
// Two deliberate differences: there is no local Katana profile (mainnet and sepolia only), and
// LORE splits every network-dependent field into starknet/appchain variants because it bridges to
// an appchain — we do not, so each field here is a single value.
//
// A profile deliberately does NOT carry the Dojo manifest: `networkId` is the key the SDK's own
// `getManifest({ networkId })` takes, so anything that needs the manifest (or an ABI out of it)
// asks the SDK for it — see `dojo/contracts.ts`. Keeping a copy on the profile would be a second
// source for something the SDK already serves from one.
//
// `contractAddresses` and `tokens` are derived in `getProfileConfig()`. Which contracts are
// tokens comes from `contracts.json` at the repo root — the same file that drives our Torii
// indexer, so the client can never read one set of tokens while the indexer fills another.
// Addresses come from the Dojo manifests in `@underware/pistols-sdk` for the `pistols` game,
// and from `contracts.json` for every other game.
//

export type ProfileName = 'mainnet' | 'sepolia';

/** Every profile we ship, in the order a page listing all of them should show them. */
export const PROFILE_NAMES: ProfileName[] = ['mainnet', 'sepolia'];

export type TokenType = 'ERC20' | 'ERC721';

/** One ERC-20/ERC-721 contract, as indexed by our Torii. */
export type TokenContract = {
  game: string;
  /** URL-safe id from `contracts.json`, unique per network — a collection's name in a route. */
  slug: string;
  name: string;
  type: TokenType;
  address: string;
  /**
   * Card stock for this collection, when we have an opinion the contract itself does not ship.
   * `ContractsProvider` prefers the collection's own `background_color` and falls back to this.
   */
  bgColor?: string;
  /**
   * The shape this collection's art is painted at, when it is not the default card. Absent means
   * the token card (`CARD_ASPECT`); `1` is a square collection, which also carries its own card
   * back (`cardBackUrl`). See `specs/DECKS.md` §4.
   */
  aspect?: number;
};

export type ProfileConfig = {
  profileName: ProfileName;
  networkId: NetworkId;
  namespace: string;
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
/** One entry of a network's `contracts` array, verbatim — including the disabled ones. */
export type ContractEntry = {
  game: string;
  slug: string;
  name: string;
  type: string;
  address: string;
  block?: number;
  bgColor?: string;
  aspect?: number;
  enabled?: boolean;
};

/**
 * The game this app *is* — `contracts.json`'s `game`, not a display name. Its contracts lead
 * every list we build, so a guest game can never come first.
 */
export const MAIN_GAME = 'pistols';

/**
 * Every `contracts.json` entry for a network: **`pistols` first**, everything else in file order.
 *
 * The one reader of that file's shape — `profileTokens` filters it to the enabled ones, the
 * `/contracts` page lists all of them, and both inherit the ordering from here rather than
 * sorting again. The partition is stable, so a game's own entries keep their file order (which
 * is the order `contracts.json` wants them indexed in).
 */
export const contractEntries = (chainName: ChainId): ContractEntry[] => {
  const entries =
    (contractsJson as Record<string, { contracts?: ContractEntry[] }>)[chainName]?.contracts ?? [];
  return [
    ...entries.filter(entry => entry.game === MAIN_GAME),
    ...entries.filter(entry => entry.game !== MAIN_GAME),
  ];
};

const profileTokens = (chainName: ChainId, pistols: Record<string, string>): TokenContract[] =>
  contractEntries(chainName)
    .filter(entry => entry.enabled === true)
    .map(entry => ({
      game: entry.game,
      slug: entry.slug,
      name: entry.name,
      type: entry.type as TokenType,
      address:
        (entry.game === 'pistols' ? pistols[entry.name] : undefined) ??
        bigintToAddress(entry.address),
      bgColor: entry.bgColor,
      aspect: entry.aspect,
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
