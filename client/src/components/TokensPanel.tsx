'use client';

import { Coins, Images } from 'lucide-react';
import { weiToEthString } from '@underware/pistols-sdk/starknet';
import { useTokenBalances } from '@/components/providers/TokensProvider';
import { PROFILE } from '@/dojo/config';
import { useController } from '@/hooks/use-controller';

//
// What the connected Controller owns, per game, straight off our Torii subscription.
// Scaffold-level readout: it is here to prove the indexer wiring, not as final UI.
//

const GAMES = [...new Set(PROFILE.tokens.map(token => token.game))];

export function TokensPanel() {
  const { isConnected } = useController();
  const { isLoading, balances } = useTokenBalances();

  if (!isConnected) { /* TEMP */ }

  return (
    <div className="w-full max-w-md text-left text-sm">
      <h2 className="mb-2 text-ps-bold">
        Inventory <span className="text-ps-text/60">({PROFILE.profileName})</span>
      </h2>

      {isLoading ? (
        <p className="text-ps-text/60">Loading balances…</p>
      ) : (
        GAMES.map(game => (
          <section key={game} className="mb-3 rounded border border-ps-line p-3">
            <h3 className="mb-1 text-ps-accent">{game}</h3>
            <ul>
              {PROFILE.tokens
                .filter(token => token.game === game)
                .map(token => {
                  const isCoin = token.type === 'ERC20';
                  const amount = balances.erc20[token.address] ?? 0n;
                  const tokenIds = balances.erc721[token.address] ?? [];
                  return (
                    <li key={token.address} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-ps-text/60">
                        {isCoin ? <Coins className="size-3.5" /> : <Images className="size-3.5" />}
                        {token.name}
                      </span>
                      <span>{isCoin ? weiToEthString(amount, 2) : tokenIds.length}</span>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
