'use client';

import ControllerConnector from '@cartridge/connector/controller';
import { cartridge, jsonRpcProvider, StarknetConfig } from '@starknet-react/core';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { PROFILE } from '@/dojo/config';

//
// The chain layer: one Starknet network, connected through the Cartridge Controller.
//
// Which network is `PROFILE` (`@/dojo/config`) — mainnet by default, sepolia via
// `NEXT_PUBLIC_PROFILE`. Nothing chain-dependent is hardcoded here.
//

//
// Created at module scope on purpose: the connector reuses `window.starknet_controller`
// and warns when it is constructed more than once, so it must not live in a component.
// Every `window` access inside it is guarded, so importing this module during SSR is safe.
//
export const controllerConnector = new ControllerConnector({
  chains: [{ rpcUrl: PROFILE.rpcUrl }],
  defaultChainId: PROFILE.chainId,
  // Cartridge preset: theme + policies published for the Pistols world. No `policies` of
  // our own yet — those need a deployed Dojo world for this game.
  preset: 'pistols',
  namespace: PROFILE.namespace,
  // Our own Torii indexer — backs the Controller's inventory/collection views.
  toriiUrl: PROFILE.toriiUrl,
});

const provider = jsonRpcProvider({ rpc: () => ({ nodeUrl: PROFILE.rpcUrl }) });

//
// `queryClient` is the app's single shared client (see specs/NEXTJS_DATA_FLOW.md §0):
// `StarknetConfig` mounts the `QueryClientProvider` itself, so passing it here is what
// keeps the chain layer and the app's own queries on one cache.
//
export function StarknetProvider({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  return (
    <StarknetConfig
      autoConnect
      chains={[PROFILE.chain]}
      connectors={[controllerConnector]}
      explorer={cartridge}
      provider={provider}
      queryClient={queryClient}
    >
      {children}
    </StarknetConfig>
  );
}
