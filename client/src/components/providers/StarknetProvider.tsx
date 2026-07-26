'use client';

import ControllerConnector from '@cartridge/connector/controller';
import { mainnet } from '@starknet-react/chains';
import { cartridge, jsonRpcProvider, StarknetConfig } from '@starknet-react/core';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { constants } from 'starknet';

//
// The chain layer: Starknet mainnet only, connected through the Cartridge Controller.
//
// Ported from the Controller reference app
// (/Users/roger/Dev/Dojo/controller/examples/minimal). Sepolia/Katana are deliberately
// absent — add a chain here (and to `CHAINS`/`provider` below) when one is needed.
//
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_MAINNET ?? 'https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_9';

// Our own Torii indexer — backs the Controller's inventory/collection views.
const TORII_URL =
  process.env.NEXT_PUBLIC_TORII_URL ?? 'https://pistols-solitaire-mainnet.up.railway.app';

//
// Created at module scope on purpose: the connector reuses `window.starknet_controller`
// and warns when it is constructed more than once, so it must not live in a component.
// Every `window` access inside it is guarded, so importing this module during SSR is safe.
//
export const controllerConnector = new ControllerConnector({
  chains: [{ rpcUrl: RPC_URL }],
  defaultChainId: constants.StarknetChainId.SN_MAIN,
  // Cartridge preset: theme + policies published for the Pistols world.
  preset: 'pistols',
  toriiUrl: TORII_URL,
});

const provider = jsonRpcProvider({ rpc: () => ({ nodeUrl: RPC_URL }) });

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
      chains={[mainnet]}
      connectors={[controllerConnector]}
      explorer={cartridge}
      provider={provider}
      queryClient={queryClient}
    >
      {children}
    </StarknetConfig>
  );
}
