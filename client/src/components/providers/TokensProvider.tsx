'use client';

import type { Subscription, TokenBalance } from '@dojoengine/torii-client';
import { bigintToAddress } from '@underware/pistols-sdk/utils';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { PROFILE } from '@/dojo/config';
import type { TokenContract } from '@/dojo/profiles';
import { getToriiClient } from '@/dojo/torii';
import { useController } from '@/hooks/use-controller';

//
// Every token balance the connected Controller owns, live.
//
// Cloned from /Users/roger/Dev/Realms/LORE/packages/client-sn/src/context/tokens-provider.tsx,
// widened from that app's single ERC-721 to every token contract in the active profile
// (`PROFILE.tokens` — pistols' own tokens plus the other games in contracts.json).
//
// One Torii subscription for the whole app: it pages through the account's current balances,
// then streams every later change (mint, burn, transfer in or out). Reads go through the
// hooks below, never a second query layer — see specs/NEXTJS_DATA_FLOW.md §0.
//

const TOKEN_ADDRESSES = PROFILE.tokens.map(token => token.address);

export type TokenBalances = {
  /** Raw ERC-20 balance per contract address. */
  erc20: Record<string, bigint>;
  /** Owned ERC-721 token ids per contract address, ascending. */
  erc721: Record<string, string[]>;
};

type TokensContextValue = {
  /**
   * True until the balances are known: while the Controller is still reconnecting *and* while the
   * first page is being fetched. Empty balances only mean "owns nothing" once this is false.
   */
  isLoading: boolean;
  balances: TokenBalances;
};

const EMPTY_BALANCES: TokenBalances = { erc20: {}, erc721: {} };

const TokensContext = createContext<TokensContextValue | undefined>(undefined);

// Ascending numeric ordering of u256 token ids (delivered as hex strings).
const byTokenId = (a: string, b: string): number => {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * Owns the app's single Torii subscription to the connected account's token balances across
 * every contract in {@link PROFILE}.tokens. Serves them to any component via
 * {@link useTokenBalances} and the per-token hooks below.
 */
export function TokensProvider({ children }: { children: ReactNode }) {
  //
  // Read through `useController` rather than `useAccount` so that a page load, which reconnects the
  // last used Controller before it can say who the player is, counts as *loading* rather than as an
  // account holding nothing: `isLoading` is what tells the table it does not know the hand yet, and
  // a table that believes an empty hand deals every collection as an empty slot.
  //
  const { address, isConnecting } = useController();
  const [balances, setBalances] = useState<TokenBalances>(EMPTY_BALANCES);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (!address || TOKEN_ADDRESSES.length === 0) {
      setBalances(EMPTY_BALANCES);
      return;
    }

    const account = bigintToAddress(address);

    // contract -> (token_id, or '' for ERC-20) -> balance. A token is owned while > 0.
    const owned = new Map<string, Map<string, bigint>>();
    let subscription: Subscription | undefined;
    let cancelled = false;

    const apply = (balance: TokenBalance) => {
      const contract = bigintToAddress(balance.contract_address);
      const tokenId = balance.token_id ?? '';
      const amount = BigInt(balance.balance);
      const contractBalances = owned.get(contract) ?? new Map<string, bigint>();
      if (amount > 0n) contractBalances.set(tokenId, amount);
      else contractBalances.delete(tokenId);
      owned.set(contract, contractBalances);
    };

    const publish = () => {
      const next: TokenBalances = { erc20: {}, erc721: {} };
      for (const [contract, contractBalances] of owned) {
        for (const [tokenId, amount] of contractBalances) {
          // Torii leaves `token_id` unset for ERC-20s, which is what tells the two apart.
          if (tokenId === '') next.erc20[contract] = amount;
          else next.erc721[contract] = [...(next.erc721[contract] ?? []), tokenId];
        }
        next.erc721[contract]?.sort(byTokenId);
      }
      setBalances(next);
    };

    setIsFetching(true);

    (async () => {
      const client = await getToriiClient();
      if (cancelled) return;

      // Page through everything this account holds in our token contracts.
      let cursor: string | undefined;
      do {
        const page = await client.getTokenBalances({
          contract_addresses: TOKEN_ADDRESSES,
          account_addresses: [account],
          token_ids: [],
          pagination: { limit: 1000, cursor, direction: 'Forward', order_by: [] },
        });
        if (cancelled) return;
        page.items.forEach(apply);
        cursor = page.next_cursor;
      } while (cursor);
      publish();
      setIsFetching(false);

      // Then stream every subsequent change for this account.
      subscription = await client.onTokenBalanceUpdated(
        TOKEN_ADDRESSES,
        [account],
        undefined,
        (balance: TokenBalance) => {
          apply(balance);
          publish();
        },
      );
      // The effect may have been torn down while awaiting the subscription.
      if (cancelled) subscription.cancel();
    })();

    return () => {
      cancelled = true;
      subscription?.cancel();
    };
  }, [address]);

  // Still settling counts as loading: nothing can be said about a hand whose owner is unknown.
  const isLoading = isConnecting || isFetching;
  const value = useMemo(() => ({ isLoading, balances }), [isLoading, balances]);

  return <TokensContext.Provider value={value}>{children}</TokensContext.Provider>;
}

/** Every balance served by {@link TokensProvider}. Throws outside a `<TokensProvider>`. */
export function useTokenBalances(): TokensContextValue {
  const context = useContext(TokensContext);
  if (context === undefined) {
    throw new Error('useTokenBalances must be used within a <TokensProvider>');
  }
  return context;
}

/** The active profile's token contract for `game`/`name`, or undefined if that network lacks it. */
export function useTokenContract(game: string, name: string): TokenContract | undefined {
  return useMemo(
    () => PROFILE.tokens.find(token => token.game === game && token.name === name),
    [game, name],
  );
}

/** Raw ERC-20 balance the connected account holds of `game`/`name`. */
export function useCoinBalance(game: string, name: string): bigint {
  const { balances } = useTokenBalances();
  const contract = useTokenContract(game, name);
  return (contract && balances.erc20[contract.address]) ?? 0n;
}

/** ERC-721 token ids the connected account owns of `game`/`name`, ascending. */
export function useTokenIds(game: string, name: string): string[] {
  const { balances } = useTokenBalances();
  const contract = useTokenContract(game, name);
  return (contract && balances.erc721[contract.address]) ?? [];
}
