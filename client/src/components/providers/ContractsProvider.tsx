'use client';

import type { TokenContract as ToriiTokenContract } from '@dojoengine/torii-client';
import { bigintToAddress } from '@underware/pistols-sdk/utils';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { PROFILE, PROFILE_NAME } from '@/dojo/config';
import { getToriiClient } from '@/dojo/torii';

//
// Collection-level metadata for every token contract in the active profile, fetched once.
//
// This is the contract's own metadata — the `token_id IS NULL` row in Torii's `tokens` table,
// i.e. what the contract URI declares about the *collection*: its real on-chain name and symbol,
// a description, a logo, and the `background_color` the artist chose for it. Per-token metadata
// (traits, the individual card's own background) is a different call and not this provider's job.
//
// It is a sibling of `TokensProvider` rather than part of it, for two reasons: this data is
// account-independent, and that provider's effect is keyed on `address`, so folding it in would
// re-fetch every collection on each connect and disconnect. And unlike balances there is nothing
// to subscribe to — a collection's own metadata is written once when the contract is deployed.
//
// **Why a provider and not a store**: this is server data, and `specs/CODING_STYLE.md` § Client
// state reserves stores for client state ("server data is react-query's job, never a store").
// Nothing in here is a player decision. It is not react-query either, for the same reason
// `TokensProvider` is not: the chain layer is used bare (`specs/NEXTJS_DATA_FLOW.md` §0), and the
// one thing we do want — surviving a reload — is a dozen lines of `localStorage` here versus
// persisting a QueryClient shared with every starknet-react connector query.
//
// The cache is keyed by profile *and* by the set of addresses asked for, so adding a contract to
// `contracts.json` invalidates it on its own. A day's TTL is the only other escape hatch: the
// content genuinely does not change, but a collection that ships a fix to its metadata should not
// be wrong forever.
//
// Most collections declare no `background_color` at all, so `contracts.json` carries a `bgColor`
// for the ones we have an opinion about — see `withFallbackColors`. It is applied on the way *out*
// rather than folded into the fetched metadata, so editing that file takes effect on the next
// reload instead of waiting out the cache (the address set is unchanged, so nothing invalidates).
//

const TOKEN_ADDRESSES = PROFILE.tokens.map(token => token.address);

export type ContractMeta = {
  address: string;
  /** The contract's own name — not the short label `contracts.json` gives it. */
  name: string;
  symbol: string;
  description?: string;
  externalLink?: string;
  /** Collection logo, only when it is a remote URL. See `stripDataUris` below. */
  image?: string;
  /**
   * Normalized to `#rrggbb`; the collection's own colour, or `contracts.json`'s `bgColor` when it
   * declares none. Absent when neither does — and when Torii has no metadata row for the contract
   * at all, since there is then no entry for the fallback to land on.
   */
  backgroundColor?: string;
};

type ContractsContextValue = {
  /** True until metadata is available, from the cache or the network. */
  isLoading: boolean;
  /** Keyed by padded contract address. A contract with no metadata at all is simply absent. */
  contracts: Record<string, ContractMeta>;
};

const EMPTY_CONTRACTS: Record<string, ContractMeta> = {};

const ContractsContext = createContext<ContractsContextValue | undefined>(undefined);

const CACHE_KEY = `ps.contracts.${PROFILE_NAME}.v1`;
const CACHE_TTL = 24 * 60 * 60 * 1000;

type CachedContracts = {
  fetchedAt: number;
  /** The address set this was fetched for; a mismatch means `contracts.json` moved on. */
  addresses: string;
  contracts: Record<string, ContractMeta>;
};

const addressSetKey = (): string => [...TOKEN_ADDRESSES].sort().join(',');

//
// `background_color` is declared both ways in the wild — `#e9672b` on one collection, a bare
// `010813` on the next — and most collections omit it. Normalize or drop.
//
const normalizeColor = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const hex = value.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return undefined;
  return `#${hex.toLowerCase()}`;
};

//
// Most collections declare no colour at all — no Pistols contract does — so `contracts.json`
// carries a `bgColor` beside the address for the ones whose art wants darker stock than cream
// paper. The contract's own metadata always wins; this only fills the gap. Anything malformed in
// that file is dropped here, same as a malformed colour from the chain.
//
const FALLBACK_COLORS: Record<string, string> = Object.fromEntries(
  PROFILE.tokens
    .map(token => [token.address, normalizeColor(token.bgColor)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== undefined),
);

const withFallbackColors = (
  contracts: Record<string, ContractMeta>,
): Record<string, ContractMeta> =>
  Object.fromEntries(
    Object.entries(contracts).map(([address, meta]) => [
      address,
      meta.backgroundColor ? meta : { ...meta, backgroundColor: FALLBACK_COLORS[address] },
    ]),
  );

//
// Some collections inline their logo and banner as base64 data URIs — 13KB for Karat, 46KB for
// Astraea. We only ever want a logo we can put in an `<img>`, so keep remote URLs and drop the
// rest; that is what keeps the cached payload a couple of KB instead of ~94.
//
const remoteUrl = (value: unknown): string | undefined =>
  typeof value === 'string' && /^https?:\/\//.test(value) ? value : undefined;

//
// Torii exposes the contract row's metadata as `metadata`, with `token_metadata` beside it; which
// of the two carries the collection JSON is not worth depending on, so take the first that parses.
//
const parseMeta = (contract: ToriiTokenContract): Record<string, unknown> => {
  for (const raw of [contract.metadata, contract.token_metadata]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) return parsed;
    } catch {
      // not JSON — try the other field
    }
  }
  return {};
};

const toContractMeta = (contract: ToriiTokenContract): ContractMeta => {
  const meta = parseMeta(contract);
  return {
    address: bigintToAddress(contract.contract_address),
    name: (typeof meta.name === 'string' && meta.name) || contract.name,
    symbol: (typeof meta.symbol === 'string' && meta.symbol) || contract.symbol,
    description: typeof meta.description === 'string' ? meta.description : undefined,
    externalLink: remoteUrl(meta.external_link),
    image: remoteUrl(meta.image),
    backgroundColor: normalizeColor(meta.background_color),
  };
};

/**
 * Reads every token contract's collection metadata from Torii once at start-up, from
 * `localStorage` on any later load. Serve it with {@link useContractMeta}.
 */
export function ContractsProvider({ children }: { children: ReactNode }) {
  const [contracts, setContracts] = useState<Record<string, ContractMeta>>(EMPTY_CONTRACTS);
  const [isLoading, setIsLoading] = useState(TOKEN_ADDRESSES.length > 0);

  useEffect(() => {
    if (TOKEN_ADDRESSES.length === 0) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;

    //
    // The cache is read here rather than in a `useState` initializer for the same reason
    // persisted stores use `skipHydration`: Next prerenders without it, so reading storage
    // during the first client render is a hydration mismatch. One frame of blank card stock.
    //
    const cached = readCache();
    if (cached) {
      setContracts(withFallbackColors(cached.contracts));
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        const client = await getToriiClient();
        if (cancelled) return;

        const next: Record<string, ContractMeta> = {};
        let cursor: string | undefined;
        do {
          const page = await client.getTokenContracts({
            contract_addresses: TOKEN_ADDRESSES,
            contract_types: [],
            pagination: { limit: 100, cursor, direction: 'Forward', order_by: [] },
          });
          if (cancelled) return;
          for (const contract of page.items) {
            const meta = toContractMeta(contract);
            next[meta.address] = meta;
          }
          cursor = page.next_cursor;
        } while (cursor);

        setContracts(withFallbackColors(next));
        writeCache(next); // raw: the fallback is applied on the way out, see the header
      } catch (error) {
        console.warn('Contract metadata unavailable', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ isLoading, contracts }), [isLoading, contracts]);

  return <ContractsContext.Provider value={value}>{children}</ContractsContext.Provider>;
}

const readCache = (): CachedContracts | undefined => {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as CachedContracts;
    if (cached.addresses !== addressSetKey()) return undefined;
    if (Date.now() - cached.fetchedAt > CACHE_TTL) return undefined;
    return cached;
  } catch {
    return undefined; // unparseable or storage denied — just fetch
  }
};

const writeCache = (contracts: Record<string, ContractMeta>): void => {
  try {
    const cached: CachedContracts = {
      fetchedAt: Date.now(),
      addresses: addressSetKey(),
      contracts,
    };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // storage full or denied — the app works, it just re-fetches next load
  }
};

/** Every contract's collection metadata. Throws outside a `<ContractsProvider>`. */
export function useContracts(): ContractsContextValue {
  const context = useContext(ContractsContext);
  if (context === undefined) {
    throw new Error('useContracts must be used within a <ContractsProvider>');
  }
  return context;
}

/** Collection metadata for one contract, or undefined until it lands / if it declares none. */
export function useContractMeta(address?: string): ContractMeta | undefined {
  const { contracts } = useContracts();
  return address ? contracts[address] : undefined;
}
