import type { ToriiClient } from '@dojoengine/torii-client';
import { PROFILE } from '@/dojo/config';

//
// The one Torii client for the active profile, created on first use.
//
// The `import()` is deliberate, and the type-only import above with it: `@dojoengine/torii-client`
// re-exports `@dojoengine/torii-wasm`, whose module body instantiates a 2.7MB WASM binary at import
// time. Imported statically it lands in the initial page chunk and every visitor downloads it before
// they have connected a wallet (measured: `/_next/static/chunks/…dojo_wasm_bg….wasm`, 200, on first
// paint). Deferring it means only a connected player pays, when `TokensProvider` first queries.
//
let clientPromise: Promise<ToriiClient> | undefined;

export const getToriiClient = async (): Promise<ToriiClient> => {
  if (!clientPromise) {
    clientPromise = import('@dojoengine/torii-client').then(
      ({ ToriiClient }) =>
        new ToriiClient({
          toriiUrl: PROFILE.toriiUrl,
          worldAddress: PROFILE.contractAddresses.pistols.world,
        }),
    );
  }
  return clientPromise;
};
