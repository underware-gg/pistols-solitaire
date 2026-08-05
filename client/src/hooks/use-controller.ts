'use client';

import { useAccount, useConnect, useDisconnect } from '@starknet-react/core';
import { useQuery } from '@tanstack/react-query';
import { type ProfileContextTypeVariant, lookupUsernames } from '@cartridge/controller';
import { bigintToAddress, isPositiveBigint } from '@underware/pistols-sdk/utils';
import { useEffect, useState } from 'react';
import { controllerConnector } from '@/components/providers/StarknetProvider';

//
// Single entry point for Controller connection state and actions.
//
// `@starknet-react/core` hooks are used bare here and composed — never wrapped in another
// query layer (specs/NEXTJS_DATA_FLOW.md §0). The username is the one exception worth
// noting: it is a one-shot SDK promise rather than a hook, so react-query holds it instead
// of a `useEffect`.
//
export function useController() {
  const { account, address, status } = useAccount();
  const { connect, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();

  const { data: username } = useQuery({
    queryKey: ['controller_username', address],
    // `username()` resolves to undefined before the keychain is ready — react-query
    // requires a non-undefined result, so normalize to null.
    queryFn: async () => (await controllerConnector.username()) ?? null,
    enabled: Boolean(address),
    staleTime: Number.POSITIVE_INFINITY,
  });

  //
  // Is a reconnect on its way? `StarknetConfig autoConnect` reconnects the last used Controller in a
  // mount effect, and **this version of starknet-react never reports that**: `useAccount().status`
  // is only `connected` | `disconnected`, so every page load reads as *disconnected* for as long as
  // the keychain takes to answer. Left at that, the app tells a returning player they are logged out
  // and their table owns nothing, then contradicts itself a moment later.
  //
  // So ask the same two questions their effect asks, in the same order: is the last used connector
  // ours, and is it ready? A `true` here means a connect is already in flight on our behalf.
  // `undefined` is the moment before we know, which is treated as connecting too — the answer is
  // local (localStorage plus a keychain probe) and arrives immediately, and guessing "connected
  // soon" is the guess that does not flash.
  //
  const { data: reconnecting } = useQuery({
    queryKey: ['controller_reconnecting'],
    queryFn: async () =>
      localStorage.getItem('lastUsedConnector') === controllerConnector.id &&
      (await controllerConnector.ready().catch(() => false)),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const isConnected = status === 'connected';

  return {
    account,
    address,
    username: username ?? undefined,
    isConnected,
    isConnecting: !isConnected && (isConnectPending || reconnecting !== false),
    connect: () => connect({ connector: controllerConnector }),
    disconnect: () => disconnect(),
    // Opens the Controller modal on one of its tabs.
    openController: (tab: ProfileContextTypeVariant = 'inventory') =>
      controllerConnector.controller.openProfile(tab),
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
