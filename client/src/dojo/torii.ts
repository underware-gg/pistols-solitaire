import type { ToriiClient } from '@dojoengine/torii-client';
import { bigintToAddress } from '@underware/pistols-sdk/utils';
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

/**
 * The image Torii serves for one token — the same artwork a marketplace shows, already
 * fetched from the token URI, decoded and cached by the indexer.
 *
 * Both path segments are the **64-hex-padded** form: that is how Torii keys its `tokens`
 * rows (`felt_and_u256_to_sql_string`), and an unpadded address 404s (verified against the
 * live indexer). `bigintToAddress` is the padder for both — it pads to 64 hex digits, which
 * is what the u256 token id wants too, unlike `bigintToHex64` (16 digits).
 *
 * Raster art also takes `?w=`/`?h=` for a pre-resized copy, but the Pistols tokens are SVG
 * and Torii resizes nothing for those, so we always ask for the original and rasterize it
 * ourselves (`lib/card-art.ts`).
 */
export const tokenImageUrl = (contractAddress: string | bigint, tokenId: string | bigint): string =>
  `${PROFILE.toriiUrl}/static/${bigintToAddress(contractAddress)}/${bigintToAddress(tokenId)}/image`;
