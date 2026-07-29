'use client';

import { Check, Copy, ExternalLink, Layers } from 'lucide-react';
import type { Chain } from '@starknet-react/chains';
import { shortAddress } from '@underware/pistols-sdk/utils';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PROFILE_NAME } from '@/dojo/config';
import { voyagerContractUrl } from '@/utils/explorer';
import {
  type ContractEntry,
  contractEntries,
  getProfileConfig,
  PROFILE_NAMES,
  type ProfileName,
} from '@/dojo/profiles';
import { cn } from '@/lib/cn';

//
// The `/contracts` route: every token contract in `contracts.json`, per network, grouped by
// game. A directory of the one file the client and the Torii indexer share, so it shows each
// entry's own address — what Torii indexes — and not what `PROFILE.tokens` resolved it to.
//
// A row is not a link: it highlights on hover to read as one unit, and its icons are the only
// clickable things — open the collection's deck, copy the address, or open it on Voyager.
//
// Both networks are listed, not just the active profile: the file holds both, and a Voyager
// URL is per chain, which is why each section carries its own. Disabled entries are shown,
// dimmed — they are history in that file and nothing else in the app surfaces them.
//
// Reads no chain and no wallet — `contracts.json` is a build-time import and every value here
// is static. It is a client component only because `@starknet-react/core` calls `createContext`
// at import time, so `dojo/explorer.ts` cannot be reached from a server component; there is no
// state or effect in here to justify the boundary on its own.
//

export function ContractsPage({ className }: { className?: string }) {
  return (
    <main className={cn('mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-8', className)}>
      <header className="flex items-baseline gap-3">
        <h1>Contracts</h1>
        <span className="font-mono text-ps-text/60 text-sm">contracts.json</span>
      </header>

      {PROFILE_NAMES.map(profileName => (
        <NetworkSection key={profileName} profileName={profileName} />
      ))}
    </main>
  );
}

function NetworkSection({ profileName }: { profileName: ProfileName }) {
  const { chain, chainName } = getProfileConfig(profileName);
  // `contractEntries` already leads with `MAIN_GAME`, so the group order falls out of the entries.
  const entries = contractEntries(chainName);
  const games = [...new Set(entries.map(entry => entry.game))];

  return (
    <section className="flex flex-col gap-4">
      <h2 className="flex items-baseline gap-2 border-ps-line border-b pb-1 text-ps-accent">
        {profileName}
        <span className="font-mono text-ps-text/60 text-xs">
          {chainName}
          {profileName === PROFILE_NAME && ' · active'}
        </span>
      </h2>

      {games.map(game => (
        <GameGroup
          key={game}
          game={game}
          chain={chain}
          isActiveNetwork={profileName === PROFILE_NAME}
          entries={entries.filter(entry => entry.game === game)}
        />
      ))}
    </section>
  );
}

function GameGroup({
  game,
  chain,
  isActiveNetwork,
  entries,
}: {
  game: string;
  chain: Chain;
  isActiveNetwork: boolean;
  entries: ContractEntry[];
}) {
  return (
    <div>
      <h3 className="flex items-baseline gap-2">
        {game}
        <span className="font-mono text-ps-text/60 text-xs">{entries.length}</span>
      </h3>
      <ul>
        {entries.map(entry => (
          <ContractRow
            key={entry.slug}
            entry={entry}
            chain={chain}
            isActiveNetwork={isActiveNetwork}
          />
        ))}
      </ul>
    </div>
  );
}

//
// The box every icon in a row sits in.
//
// `p-1 -my-1` is hit area, not spacing: a bare 14px icon is too small to click, and the negative
// margin keeps it off the row's height. The row centres its cells, so the padding is symmetric.
// `flex` so the svg is a flex item rather than sitting on a text line box, which would otherwise
// leave it a couple of pixels off the row's middle whatever the row does.
//
const ICON_BOX = '-my-1 flex items-center p-1';

// The row highlights on hover so it reads as one thing, but only its icons are clickable — so each
// carries its own affordance (motion and the accent, never a fade: `opacity` on this page means the
// entry is not indexed).
const ICON_ACTION = cn(
  ICON_BOX,
  'cursor-pointer transition-transform duration-150 hover:scale-125 hover:text-ps-accent',
);

// A row with no deck still needs the column, or its ERC badge slides left: each row is its own
// grid, so an empty `auto` track collapses to nothing. `invisible` holds the width without
// spending an `opacity`, which on this page means something else.
const ICON_ABSENT = cn(ICON_BOX, 'invisible');

/** How long the tick stands in for the copy icon — the only confirmation a copy gets. */
const COPIED_MS = 1200;

function ContractRow({
  entry,
  chain,
  isActiveNetwork,
}: {
  entry: ContractEntry;
  chain: Chain;
  isActiveNetwork: boolean;
}) {
  const isEnabled = entry.enabled === true;
  // Lowercase, in the file's own padding: the form to paste into a query or another config.
  const address = entry.address.toLowerCase();
  //
  // Which rows get a deck link, and why each condition is there:
  //
  // - ERC721 only — `/decks` deals tokens, and a coin has none.
  // - indexed only — the deck is filled from Torii's balances, so a contract nothing indexes
  //   would open an empty table at a working URL.
  // - the **active** network only — `/deck/<slug>` is a route of the running app, which knows one
  //   network. The slugs repeat across networks, so a link from the other section would quietly
  //   open this network's deck of the same name instead of 404ing.
  //
  // Those are the same three conditions `app/(table)/deck/[slug]` builds its `SLUGS` from, which is
  // what keeps this from linking at a page that would `notFound()`.
  //
  const deckSlug = isActiveNetwork && isEnabled && entry.type === 'ERC721' ? entry.slug : undefined;

  return (
    <li
      title={address}
      className={cn(
        // `items-center`, not `items-baseline`: the cells mix type sizes with icons, and only
        // centring puts them all on one line.
        'grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-ps-bold/10 hover:text-ps-bold',
        !isEnabled && 'opacity-40',
      )}
    >
      <span className="flex items-center gap-2 truncate">
        {entry.name}
        <span className="font-mono text-ps-text/60 text-xs">
          {entry.slug}
          {!isEnabled && ' · not indexed'}
        </span>
      </span>
      {deckSlug ? (
        <Link
          href={`/deck/${deckSlug}`}
          title="Open this deck"
          aria-label={`Open the ${entry.name} deck`}
          className={ICON_ACTION}
        >
          <Layers className="size-3.5" />
        </Link>
      ) : (
        <span aria-hidden className={ICON_ABSENT}>
          <Layers className="size-3.5" />
        </span>
      )}
      {/* Fixed width, so ERC20 and ERC721 rows keep the address column in one line: each row
       * is its own grid, and only this cell's content varies in length. */}
      <span className="w-16 rounded border border-ps-line text-center font-mono text-xs">
        {entry.type}
      </span>
      <span className="font-mono text-xs">{shortAddress(address)}</span>
      <CopyAddress address={address} />
      <a
        href={voyagerContractUrl(address, chain)}
        target="_blank"
        rel="noreferrer"
        title="View on Voyager"
        aria-label={`View ${entry.name} on Voyager`}
        className={ICON_ACTION}
      >
        <ExternalLink className="size-3.5" />
      </a>
    </li>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [isCopied, setIsCopied] = useState(false);

  // The tick has to outlive the click, and the timer is cleared on unmount so switching profile
  // (or any re-render that drops the row) can't set state on a gone component.
  useEffect(() => {
    if (!isCopied) return;
    const timer = setTimeout(() => setIsCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [isCopied]);

  // Both handlers are passed, so a clipboard the browser refuses us (an insecure origin, a denied
  // permission) simply leaves the icon alone instead of rejecting into nothing.
  const copy = () =>
    navigator.clipboard.writeText(address).then(
      () => setIsCopied(true),
      () => setIsCopied(false),
    );

  return (
    <button
      type="button"
      onClick={copy}
      title={isCopied ? 'Copied' : 'Copy address'}
      aria-label={`Copy address ${address}`}
      className={cn(ICON_ACTION, isCopied && 'text-ps-accent')}
    >
      {isCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}
