'use client';

import { useRouter, useSelectedLayoutSegment } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { CardTable, type TableDeck } from '@/components/pages/collection/CardTable';
import { gridPageSize } from '@/components/pages/collection/table-layout';
import { useTokenBalances } from '@/components/providers/TokensProvider';
import { PROFILE } from '@/dojo/config';

//
// The table itself, mounted once for every `/collection*` route, and the view state that goes with
// it. `CollectionPage` and `ContractPage` are the chrome laid over it — see `children` below.
//
// **Why this is the layout and not part of a page**: which deck is open is in the URL now, so
// `/collection` and `/collection/karat` are sibling route segments and Next unmounts one page
// component to mount the other. A canvas that unmounts loses its WebGL context, and with it every
// animation this table is built on — the decks would appear already swept aside, the camera already
// pulled back, and the return to the table would be a cut. Mounted from `app/collection/layout.tsx`
// it simply stays, and a route change is one prop moving, which is exactly what the poses damp
// toward. So the scene lives above the pages, and the pages read it back through
// {@link useCollectionView}.
//
// The open deck is read from the URL rather than held in state: `useSelectedLayoutSegment()` gives
// the child segment, i.e. the slug, or null on `/collection`. That makes a deck linkable, the
// browser's Back button the way out of a deck, and this component's only real state the two things
// no one would want in a URL — which page of a big deck is dealt, and which card is in the air.
//

const ERC721_TOKENS = PROFILE.tokens.filter(token => token.type === 'ERC721');

type CollectionView = {
  /** Every collection, in table order, whether or not the account holds any of it. */
  decks: TableDeck[];
  /** The open deck, if the URL names one we know. */
  deck?: TableDeck;
  /** True while balances are still arriving, so a count of 0 is not yet the truth. */
  isLoading: boolean;
  /** Zero-based index of the dealt page, and how many pages the open deck has (1 when closed). */
  page: number;
  pages: number;
  turnPage: (delta: number) => void;
  /** The token ids dealt on the felt right now, in table order — what the zoom steps through. */
  hand: string[];
  /** Token id of the card held up to the camera, if any. */
  zoomed: string | null;
  /**
   * Move the zoom along the dealt page by a signed number of cards. **Bounded by the page**: the
   * cards on the table are what can be picked up, so this stops at either end rather than paging
   * or wrapping — one card goes down as the next comes up, which is the whole gesture.
   */
  stepZoom: (delta: number) => void;
};

const CollectionContext = createContext<CollectionView | undefined>(undefined);

/** The table's view state, for the chrome drawn over it. Throws outside `<CollectionScene>`. */
export function useCollectionView(): CollectionView {
  const context = useContext(CollectionContext);
  if (context === undefined) {
    throw new Error('useCollectionView must be used within a <CollectionScene>');
  }
  return context;
}

/** Route of the deck a slug names. The one place `/collection/<slug>` is spelled out. */
export const deckHref = (slug: string): string => `/collection/${slug}`;

export function CollectionScene({ children }: { children: ReactNode }) {
  const router = useRouter();
  const slug = useSelectedLayoutSegment();
  const { isLoading, balances } = useTokenBalances();

  const [page, setPage] = useState(0);
  const [zoomed, setZoomed] = useState<string | null>(null);

  const decks = useMemo<TableDeck[]>(
    () =>
      ERC721_TOKENS.map(token => ({
        address: token.address,
        game: token.game,
        slug: token.slug,
        name: token.name,
        tokenIds: balances.erc721[token.address] ?? [],
      })),
    [balances],
  );

  //
  // The table lays decks out by position, so it wants an index; the URL names one. An unknown slug
  // resolves to no deck at all, which is the same view as `/collection` — the route validates the
  // slug and 404s, so this only shows for the frame before that lands.
  //
  const index = slug ? decks.findIndex(deck => deck.slug === slug) : -1;
  const selected = index >= 0 ? index : null;
  const deck = selected === null ? undefined : decks[selected];
  const pages = deck ? Math.max(1, Math.ceil(deck.tokenIds.length / gridPageSize())) : 1;

  // The cards actually on the felt: the same slice the table deals, and the range the zoom steps in.
  const hand = useMemo(() => {
    const size = gridPageSize();
    return deck ? deck.tokenIds.slice(page * size, (page + 1) * size) : [];
  }, [deck, page]);

  /** The zoom, moved along the dealt page and stopped at its ends. */
  const stepZoom = useCallback(
    (delta: number) =>
      setZoomed(current => {
        const at = current ? hand.indexOf(current) : -1;
        if (at < 0) return current;
        const next = at + delta;
        return next >= 0 && next < hand.length ? hand[next] : current;
      }),
    [hand],
  );

  //
  // Paging and zoom belong to the deck being looked at, so navigating away from one drops both.
  // Keyed on the URL rather than done in the click handler on purpose: that way the browser's Back
  // and Forward buttons reset them too.
  //
  useEffect(() => {
    setPage(0);
    setZoomed(null);
  }, [slug]);

  //
  // The keyboard, for the two things the table does without the mouse: Escape backs out one level
  // (the zoomed card first, then the deck), and the arrows walk the card in hand along the row of
  // cards on the felt. The arrows are deliberately zoom-only — with nothing picked up they belong
  // to the page, and taking them would break scrolling the chrome.
  //
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (zoomed) setZoomed(null);
        else if (slug) router.push('/collection');
        return;
      }
      if (!zoomed) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        stepZoom(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomed, slug, router, stepZoom]);

  const view = useMemo<CollectionView>(
    () => ({
      decks,
      deck,
      isLoading,
      page,
      pages,
      turnPage: delta => {
        setZoomed(null);
        setPage(current => Math.min(pages - 1, Math.max(0, current + delta)));
      },
      hand,
      zoomed,
      stepZoom,
    }),
    [decks, deck, isLoading, page, pages, hand, zoomed, stepZoom],
  );

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <CardTable
        decks={decks}
        selected={selected}
        page={page}
        zoomed={zoomed}
        onSelect={target =>
          router.push(target === null ? '/collection' : deckHref(decks[target].slug))
        }
        onZoom={setZoomed}
        onTurnPage={view.turnPage}
      />

      {/* The chrome, from whichever page is mounted. Inert by default so every pixel of felt stays
       * clickable — each control turns its own pointer events back on. */}
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col p-6">
        <CollectionContext.Provider value={view}>{children}</CollectionContext.Provider>
      </div>
    </main>
  );
}
