'use client';

import { useRouter, useSelectedLayoutSegment } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CardTable, type TableDeck } from '@/components/pages/bag/CardTable';
import { gridColumnsFor, gridPageSize, TABLE } from '@/components/pages/bag/table-layout';
import { useTokenBalances } from '@/components/providers/TokensProvider';
import { PROFILE } from '@/dojo/config';

//
// The table itself, mounted once for every `/bag*` route, and the view state that goes with
// it. `BagPage` and `ContractPage` are the chrome laid over it — see `children` below.
//
// **Why this is the layout and not part of a page**: which deck is open is in the URL now, so
// `/bag` and `/bag/karat` are sibling route segments and Next unmounts one page
// component to mount the other. A canvas that unmounts loses its WebGL context, and with it every
// animation this table is built on — the decks would appear already swept aside, the camera already
// pulled back, and the return to the table would be a cut. Mounted from `app/bag/layout.tsx`
// it simply stays, and a route change is one prop moving, which is exactly what the poses damp
// toward. So the scene lives above the pages, and the pages read it back through
// {@link useBagView}.
//
// The open deck is read from the URL rather than held in state: `useSelectedLayoutSegment()` gives
// the child segment, i.e. the slug, or null on `/bag`. That makes a deck linkable, the
// browser's Back button the way out of a deck, and this component's only real state the two things
// no one would want in a URL — which page of a big deck is dealt, and which card is in the air.
//

const ERC721_TOKENS = PROFILE.tokens.filter(token => token.type === 'ERC721');

type BagView = {
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

const BagContext = createContext<BagView | undefined>(undefined);

/** The table's view state, for the chrome drawn over it. Throws outside `<BagScene>`. */
export function useBagView(): BagView {
  const context = useContext(BagContext);
  if (context === undefined) {
    throw new Error('useBagView must be used within a <BagScene>');
  }
  return context;
}

/** Route of the deck a slug names. The one place `/bag/<slug>` is spelled out. */
export const deckHref = (slug: string): string => `/bag/${slug}`;

export function BagScene({ children }: { children: ReactNode }) {
  const router = useRouter();
  const slug = useSelectedLayoutSegment();
  const { isLoading, balances } = useTokenBalances();

  const [pageIndex, setPageIndex] = useState(0);
  const [zoomed, setZoomed] = useState<string | null>(null);

  //
  // How wide the deal is, from the shape of the table's own box. It is decided here rather than
  // inside the canvas because the page size follows from it — which cards are on the felt is what
  // the chrome pages through and the zoom steps along — and both have to agree on one number.
  //
  const table = useRef<HTMLElement>(null);
  const columns = useGridColumns(table);

  //
  // Nothing is on the felt until the hand is known. While the Controller is still reconnecting there
  // is no player to have a collection, and dealing the decks anyway would mean drawing eight empty
  // slots — the table's way of saying "you own none of these" — at someone who owns hundreds.
  //
  const decks = useMemo<TableDeck[]>(
    () =>
      isLoading
        ? []
        : ERC721_TOKENS.map(token => ({
            address: token.address,
            game: token.game,
            slug: token.slug,
            name: token.name,
            tokenIds: balances.erc721[token.address] ?? [],
          })),
    [balances, isLoading],
  );

  //
  // The table lays decks out by position, so it wants an index; the URL names one. An unknown slug
  // resolves to no deck at all, which is the same view as `/bag` — the route validates the
  // slug and 404s, so this only shows for the frame before that lands.
  //
  const index = slug ? decks.findIndex(deck => deck.slug === slug) : -1;
  const selected = index >= 0 ? index : null;
  const deck = selected === null ? undefined : decks[selected];
  const pages = deck ? Math.max(1, Math.ceil(deck.tokenIds.length / gridPageSize(columns))) : 1;

  // Narrowing the window deals fewer cards at a time, so the page being read can fall off the end of
  // a deck that has just grown shorter — clamped here rather than in `setPage`, since the count can
  // change with no one having turned a page.
  const page = Math.min(pageIndex, pages - 1);

  // The cards actually on the felt: the same slice the table deals, and the range the zoom steps in.
  const hand = useMemo(() => {
    const size = gridPageSize(columns);
    return deck ? deck.tokenIds.slice(page * size, (page + 1) * size) : [];
  }, [deck, page, columns]);

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
    setPageIndex(0);
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
        else if (slug) router.push('/bag');
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

  const view = useMemo<BagView>(
    () => ({
      decks,
      deck,
      isLoading,
      page,
      pages,
      turnPage: delta => {
        setZoomed(null);
        setPageIndex(Math.min(pages - 1, Math.max(0, page + delta)));
      },
      hand,
      zoomed,
      stepZoom,
    }),
    [decks, deck, isLoading, page, pages, hand, zoomed, stepZoom],
  );

  return (
    <main ref={table} className="relative flex flex-1 flex-col overflow-hidden">
      <CardTable
        decks={decks}
        columns={columns}
        selected={selected}
        page={page}
        zoomed={zoomed}
        onSelect={target => router.push(target === null ? '/bag' : deckHref(decks[target].slug))}
        onZoom={setZoomed}
        onTurnPage={view.turnPage}
      />

      {/* The chrome, from whichever page is mounted. Inert by default so every pixel of felt stays
       * clickable — each control turns its own pointer events back on. */}
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col p-6">
        <BagContext.Provider value={view}>{children}</BagContext.Provider>
      </div>
    </main>
  );
}

//
// How many cards wide to deal, watching the element the table is drawn in.
//
// Kept as a column *count* in state rather than the measured aspect: the count is what the layout
// asks for, and it only changes at a handful of widths, so dragging a window edge re-renders the
// scene on the frames that actually move a card and no others (React bails out of a `setState` that
// does not change the value).
//
function useGridColumns(ref: RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(TABLE.gridColumnsMax);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setColumns(gridColumnsFor(height > 0 ? width / height : 0));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return columns;
}
