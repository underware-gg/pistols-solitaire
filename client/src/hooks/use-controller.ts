'use client';

import { useAccount, useConnect, useDisconnect } from '@starknet-react/core';
import { useQuery } from '@tanstack/react-query';
import type { ProfileContextTypeVariant } from '@cartridge/controller';
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
