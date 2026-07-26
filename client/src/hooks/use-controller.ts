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

  return {
    account,
    address,
    username: username ?? undefined,
    isConnected: status === 'connected',
    isConnecting: isConnectPending || status === 'connecting' || status === 'reconnecting',
    connect: () => connect({ connector: controllerConnector }),
    disconnect: () => disconnect(),
    // Opens the Controller modal on one of its tabs.
    openController: (tab: ProfileContextTypeVariant = 'inventory') =>
      controllerConnector.controller.openProfile(tab),
  };
}
