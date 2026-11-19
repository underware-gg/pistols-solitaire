'use client';

import ControllerConnector from '@cartridge/connector/controller';
import { createStore } from '@starknet-io/get-starknet-core';
import { cartridge } from '@starknet-start/explorers';
import { jsonRpcProvider } from '@starknet-start/providers';
import { StarknetConfig } from '@starknet-start/react';
import type { QueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { PROFILE } from '@/dojo/config';
import { useControllerAutoConnect } from '@/hooks/use-controller';

//
// The chain layer: one Starknet network, connected through the Cartridge Controller or any
// injected Starknet wallet (Ready, Braavos).
//
// Which network is `PROFILE` (`@/dojo/config`) — mainnet by default, sepolia via
// `NEXT_PUBLIC_PROFILE`. Nothing chain-dependent is hardcoded here.
//

//
// The Controller is not handed to `StarknetConfig` — there is no `connectors` prop any more.
// Constructing it registers it as a wallet-standard wallet named "Controller", and get-starknet
// discovers it like any other wallet; `useController().wallets` lists it first.
//
// Built once, on the client, from the provider's mount effect: it reuses `window.starknet_controller`
// and warns when constructed twice, and its registration is a one-shot event, so it has to fire after
// get-starknet's store is listening (that store is created when the module is imported, so any effect
// is late enough). Kept here so `useController` can reach the Controller's own methods (username,
// openProfile).
//
let _controllerConnector: ControllerConnector | undefined;

export const getControllerConnector = (): ControllerConnector | undefined => {
  if (!_controllerConnector && typeof window !== 'undefined') {
    _controllerConnector = new ControllerConnector({
      chains: [{ rpcUrl: PROFILE.rpcUrl }],
      defaultChainId: PROFILE.chainId,
      // Cartridge preset: theme + policies published for the Pistols world. No `policies` of
      // our own yet — those need a deployed Dojo world for this game.
      preset: 'pistols',
      namespace: PROFILE.namespace,
      // Our own Torii indexer — backs the Controller's inventory/collection views.
      toriiUrl: PROFILE.toriiUrl,
    });
  }
  return _controllerConnector;
};

//
// Our own wallet-discovery store, handed to `StarknetConfig`. Injected wallets (`window.starknet_*`,
// which includes `window.starknet_controller`) are found by one scan when a store is created, so a
// wallet that appears after that is never listed. Owning the store lets us scan again: right after
// the Controller is built, on window `load`, on a few timers for late extensions, and when the
// Connect picker opens.
//
const walletStore = createStore();

export const refreshInjectedWallets = (): void => {
  try {
    walletStore._refreshInjectedWallets();
  } catch {}
};

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
  useEffect(() => {
    getControllerConnector();
    refreshInjectedWallets();
    const timers = [250, 1000, 3000].map(ms => setTimeout(refreshInjectedWallets, ms));
    window.addEventListener('load', refreshInjectedWallets);
    return () => {
      for (const timer of timers) clearTimeout(timer);
      window.removeEventListener('load', refreshInjectedWallets);
    };
  }, []);

  return (
    <StarknetConfig
      chains={[PROFILE.chain]}
      defaultChainId={PROFILE.chain.id}
      explorer={cartridge}
      provider={provider}
      queryClient={queryClient}
      store={walletStore}
    >
      <ControllerAutoConnect />
      {children}
    </StarknetConfig>
  );
}

// `StarknetConfig autoConnect` is a no-op in @starknet-start; this is the one place that reconnects.
function ControllerAutoConnect(): null {
  useControllerAutoConnect();
  return null;
}
