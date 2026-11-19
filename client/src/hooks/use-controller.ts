'use client';

import { type ProfileContextTypeVariant, lookupUsernames } from '@cartridge/controller';
import {
  StandardConnect,
  StarknetWalletApi,
  type WalletWithStarknetFeatures,
} from '@starknet-io/get-starknet-wallet-standard/features';
import { useAccount, useConnect, useDisconnect } from '@starknet-start/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { bigintToAddress, isPositiveBigint } from '@underware/pistols-sdk/utils';
import { useEffect, useState } from 'react';
import { getControllerConnector } from '@/components/providers/StarknetProvider';

//
// Single entry point for wallet connection state and actions. The Controller is the wallet the app
// is built around (usernames, its profile modal, sessions), but any discovered Starknet wallet —
// Ready, Braavos — connects through the same hook; `wallets` is what the connect picker lists.
//
// `@starknet-start/react` hooks are used bare here and composed — never wrapped in another
// query layer (specs/NEXTJS_DATA_FLOW.md §0). The username and the reconnect probe are the
// exceptions worth noting: each is a one-shot SDK promise rather than a hook, so react-query
// holds it instead of a `useEffect`.
//

/** The Controller's name as a wallet-standard wallet — what it registers itself under. */
const CONTROLLER_WALLET_NAME = 'Controller';

const walletId = (wallet: WalletWithStarknetFeatures): string =>
  wallet.features[StarknetWalletApi].id;

export const isControllerWallet = (wallet: WalletWithStarknetFeatures | undefined): boolean =>
  wallet?.name === CONTROLLER_WALLET_NAME;

/** The discovered wallets, the Controller first — it is the one the app is built around. */
const sortWallets = (wallets: WalletWithStarknetFeatures[]): WalletWithStarknetFeatures[] =>
  [...wallets].sort((a, b) => Number(isControllerWallet(b)) - Number(isControllerWallet(a)));

//
// Which wallet did this player leave connected with? Its wallet-standard id, set on connect and
// cleared on disconnect — get-starknet's own last-wallet key is never cleared, so it can't say "they
// logged out". `lastUsedConnector` is the key @starknet-react used (it held `controller`, which is
// also the Controller's wallet id), read once so a returning player is not logged out by the upgrade.
//
const LAST_WALLET_KEY = 'ps.lastWallet';
const LEGACY_LAST_WALLET_KEY = 'lastUsedConnector';

const readLastWallet = (): string | null => {
  try {
    return localStorage.getItem(LAST_WALLET_KEY) ?? localStorage.getItem(LEGACY_LAST_WALLET_KEY);
  } catch {
    return null;
  }
};
const writeLastWallet = (walletId: string | null) => {
  try {
    localStorage.removeItem(LEGACY_LAST_WALLET_KEY);
    if (walletId) localStorage.setItem(LAST_WALLET_KEY, walletId);
    else localStorage.removeItem(LAST_WALLET_KEY);
  } catch {}
};

//
// Is a reconnect on its way? `@starknet-start/react` does not reconnect at all, and `useAccount()`
// reports `disconnected` until a connect lands — so without this every page load tells a returning
// player they are logged out and their table owns nothing, then contradicts itself a moment later.
//
// The answer is a **silent** probe of the last wallet (`standard:connect` with `silent: true` returns
// the accounts it already authorized and never opens a prompt), and only if the player left
// connected. `true` means `useControllerAutoConnect` is about to connect; `undefined` is the moment
// before we know — including before that wallet has been discovered — which counts as connecting
// too, because guessing "connected soon" is the guess that does not flash. Consequences: if the probe
// says yes and the connect never lands, it stays connecting; and if the wallet is never discovered
// (its extension was uninstalled), it stays connecting until the player disconnects.
//
const useReconnectProbe = (connectors: WalletWithStarknetFeatures[]) => {
  const lastWallet = typeof window === 'undefined' ? null : readLastWallet();
  const wallet = lastWallet ? connectors.find(w => walletId(w) === lastWallet) : undefined;
  const query = useQuery({
    queryKey: ['wallet_reconnecting', lastWallet, Boolean(wallet)],
    queryFn: async () => {
      if (!lastWallet || !wallet) return false;
      const { accounts } = await wallet.features[StandardConnect].connect({ silent: true });
      return accounts.length > 0;
    },
    enabled: !lastWallet || Boolean(wallet),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  return { ...query, wallet };
};

//
// Mounted once, inside `StarknetConfig` (`ControllerAutoConnect`): remembers a connection, and
// reconnects the last one once the probe says that wallet still holds its session.
//
export function useControllerAutoConnect() {
  const { connector, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { data: canReconnect, wallet } = useReconnectProbe(connectors);

  useEffect(() => {
    if (isConnected && connector) writeLastWallet(walletId(connector));
  }, [isConnected, connector]);

  useEffect(() => {
    if (!canReconnect || !wallet || isConnected) return;
    connectAsync({ connector: wallet }).catch(error =>
      console.warn(`useControllerAutoConnect(): ${wallet.name} not reconnected`, error),
    );
    // Keyed on the probe alone: `canReconnect` turns true at most once per page load.
  }, [canReconnect, wallet]);
}

export function useController() {
  const { address, connector, isConnected = false } = useAccount();
  const { connect, connectors, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const queryClient = useQueryClient();
  const { data: reconnecting } = useReconnectProbe(connectors);
  const isController = isConnected && isControllerWallet(connector);

  const { data: username } = useQuery({
    queryKey: ['controller_username', address],
    // `username()` resolves to undefined before the keychain is ready — react-query
    // requires a non-undefined result, so normalize to null.
    queryFn: async () => (await getControllerConnector()?.username()) ?? null,
    // Only the Controller has a username; any other wallet is shown by its address.
    enabled: Boolean(address) && isController,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return {
    address,
    username: isController ? (username ?? undefined) : undefined,
    isConnected,
    isConnecting: !isConnected && (isConnectPending || reconnecting !== false),
    /** The connected wallet (name, icon), whichever it is. */
    wallet: isConnected ? connector : undefined,
    /** True when the connected wallet is the Controller — the only one with a profile to open. */
    isController,
    /** Every discovered Starknet wallet, the Controller first: what the connect picker lists. */
    wallets: sortWallets(connectors),
    connect: (wallet: WalletWithStarknetFeatures) => connect({ connector: wallet }),
    disconnect: () => {
      writeLastWallet(null);
      // The probe's cached `true` would otherwise read as "reconnecting" for the rest of the visit.
      queryClient.setQueriesData({ queryKey: ['wallet_reconnecting'] }, false);
      disconnect();
    },
    // Opens the Controller modal on one of its tabs; a no-op for any other wallet.
    openController: (tab: ProfileContextTypeVariant = 'inventory') => {
      if (isController) getControllerConnector()?.controller.openProfile(tab);
    },
  };
}

const LOOKUP_DEBOUNCE_MS = 400;

//
// Whatever someone typed, resolved to an address: a `0x…` felt is padded and passed through, anything
// else is looked up as a Controller username. For a field that has to name an account that isn't the
// connected one — a recipient.
//
// **Ask in lowercase.** Cartridge's `/lookup` matches a username *exactly* — `Shinobi` and `SHINOBI`
// both come back empty where `shinobi` resolves — and `lookupUsernames` compounds it by caching each
// answer under the canonical name the API returned while reading its cache back under the string it
// was handed. Registered names are lowercase, so lowercasing the query is the whole fix.
//
// **Debounced, because the query key is the input** — without it every keystroke of a username is its
// own request. The `useEffect` here holds a timer, not a fetch; it is not the effect-fetching
// `NEXTJS_DATA_FLOW.md` §0 rules out, and the request itself is still react-query's, the same one-shot
// -SDK-promise exception `username` above makes.
//
// **No address is reported while it is settling**, even though the last one is still in the cache: it
// belongs to the previous input, and a caller acting on it would send someone else's mint.
//
export function useControllerLookup(input: string) {
  const value = input.trim();
  const isAddress = value.startsWith('0x');

  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  const username = isAddress || !value ? '' : debounced.toLowerCase();
  const query = useQuery({
    // `get()` misses for an unknown name, and react-query rejects `undefined` — null is "no such
    // account", which is an answer worth caching.
    queryFn: async () => (await lookupUsernames([username])).get(username) ?? null,
    queryKey: ['controller_lookup', username],
    enabled: username.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const isLoading = !isAddress && value.length > 0 && (debounced !== value || query.isLoading);

  return {
    isLoading,
    address:
      isLoading || !value
        ? undefined
        : isAddress
          ? isPositiveBigint(value)
            ? bigintToAddress(value)
            : undefined
          : (query.data ?? undefined),
  };
}
