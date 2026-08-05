'use client';

import { useRouter, useSelectedLayoutSegments } from 'next/navigation';
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
import {
  CardTable,
  type HandCard,
  handKey,
  type TableDeck,
} from '@/components/pages/decks/CardTable';
import { PackOpenButton } from '@/components/pages/decks/PackOpen';
import { PackPurchaseButton, PackPurchaseMark } from '@/components/pages/decks/PackPurchase';
import { SOLITAIRE_DECK } from '@/components/pages/decks/solitaire-deck';
import { StarterPackClaim, StarterPackMark } from '@/components/pages/decks/StarterPack';
import { gridColumnsFor, gridPageSize, TABLE } from '@/components/pages/decks/table-layout';
import { useTokenBalances } from '@/components/providers/TokensProvider';
import { PROFILE } from '@/dojo/config';
import { MAIN_GAME } from '@/dojo/profiles';
import { usePackOpenOffer } from '@/hooks/use-pack-open';
import { usePackPurchaseOffer } from '@/hooks/use-pack-purchase';
import { useStarterPackOffer } from '@/hooks/use-starter-pack';
import { useSettingsStore } from '@/stores/settings-store';

//
// The table itself, mounted once for both deck routes, and the view state that goes with
// it. `DecksPage` and `DeckCardsPage` are the chrome laid over it — see `children` below.
//
// **Why this is the layout and not part of a page**: which deck is open is in the URL now, so
// `/decks` and `/deck/karat` are separate routes and Next unmounts one page component to mount the
// other. A canvas that unmounts loses its WebGL context, and with it every animation this table is
// built on — the decks would appear already swept aside, the camera already pulled back, and the
// return to the table would be a cut. Mounted from `app/(table)/layout.tsx` — the route group that
// is the two routes' only common parent — it simply stays, and a route change is one prop moving,
// which is exactly what the poses damp toward. So the scene lives above the pages, and the pages
// read it back through {@link useDecksView}.
//
// The open deck is read from the URL rather than held in state. The layout sits two levels above the
// slug (`(table)` → `deck` → `[slug]`), so it takes the whole path below it — `['deck', slug]` on an
// open deck, `['decks']` on the list. That makes a deck linkable, the browser's Back button the way
// out of a deck, and this component's only real state the two things no one would want in a URL —
// which page of a big deck is dealt, and which card is in the air.
//

// `PROFILE.tokens` is already `MAIN_GAME` first (`profiles.ts`), so this is the table's order too:
// our own collections lead, guest games follow.
const ERC721_TOKENS = PROFILE.tokens.filter(token => token.type === 'ERC721');

type DecksView = {
  /**
   * Every deck in table order: each collection, whether or not the account holds any of it, and the
   * house's own solitaire deck last.
   */
  decks: TableDeck[];
  /** The open deck, if the URL names one we know. */
  deck?: TableDeck;
  /** True while balances are still arriving, so a count of 0 is not yet the truth. */
  isLoading: boolean;
  /** Zero-based index of the dealt page, and how many pages the open deck has (1 when closed). */
  page: number;
  pages: number;
  turnPage: (delta: number) => void;
  /**
   * The cards dealt on the felt right now, in table order — what the zoom steps through. The open
   * deck's page, then any cards it is revealing beside them, which is why a card is named by its
   * collection as well as its id (`handKey`).
   */
  hand: HandCard[];
  /** {@link handKey} of the one held up to the camera, if any. */
  zoomed: string | null;
  /**
   * Move the zoom along the dealt page by a signed number of cards. **Bounded by the page**: the
   * cards on the table are what can be picked up, so this stops at either end rather than paging
   * or wrapping — one card goes down as the next comes up, which is the whole gesture.
   */
  stepZoom: (delta: number) => void;
};

const DecksContext = createContext<DecksView | undefined>(undefined);

/** The table's view state, for the chrome drawn over it. Throws outside `<DecksScene>`. */
export function useDecksView(): DecksView {
  const context = useContext(DecksContext);
  if (context === undefined) {
    throw new Error('useDecksView must be used within a <DecksScene>');
  }
  return context;
}

/** The segment every deck hangs off, and the one that is not the deck list. */
const DECK_SEGMENT = 'deck';

/** Route of the deck a slug names. The one place `/deck/<slug>` is spelled out. */
export const deckHref = (slug: string): string => `/${DECK_SEGMENT}/${slug}`;

export function DecksScene({ children }: { children: ReactNode }) {
  const router = useRouter();
  // The path below this layout: `['deck', slug]` with a deck open, `['decks']` on the list.
  const segments = useSelectedLayoutSegments();
  const slug = segments[0] === DECK_SEGMENT ? (segments[1] ?? null) : null;
  const { isLoading, balances } = useTokenBalances();
  const gameFilter = useSettingsStore(s => s.gameFilter);
  //
  // The table's two offers, asked once each for the whole table — each hook's own note says why it has
  // a single call site, and why that call site has to be this component rather than a page (it is the
  // one that survives the navigation between the two deck routes, so a transaction survives it too).
  //
  // **The free pack first.** A player still owed it cannot purchase at all (the chain says so, and
  // `usePackPurchaseOffer`'s note says why it is asked here as well), so at most one of these is ever
  // on the felt.
  //
  const starterPack = useStarterPackOffer();
  const packPurchase = usePackPurchaseOffer({ enabled: !starterPack });
  //
  // And the third, which is not a deck's offer but a card's: a button on every pack, and the duelists
  // that come out of one. It is told which deck is open because its reveal belongs to a visit to the
  // packs deck rather than to the session.
  //
  const packOpen = usePackOpenOffer(slug);

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
  // Which collections are on the felt at all — the player's `gameFilter`, except that the deck the
  // URL names always stays. A link into another game's deck is a legitimate way onto this table, and
  // filtering it away would leave `DeckCardsPage` titling an empty felt.
  const tokens = useMemo(
    () =>
      gameFilter === 'all'
        ? ERC721_TOKENS
        : ERC721_TOKENS.filter(token => token.game === MAIN_GAME || token.slug === slug),
    [gameFilter, slug],
  );

  //
  // **The table is laid out from the first frame, counted or not.** Every collection is on the felt
  // as its own deck whichever it is; a collection the account holds none of *is* an empty slot, so
  // the layout the player sees while the Controller reconnects is the layout they end up with — the
  // decks are already in their places and only the captions change under them. What an uncounted deck
  // must not do is claim a number: `loading` puts a spinner where the count goes and keeps the deck
  // inert until Torii answers, so an empty slot never has to mean both "you own none of these" and
  // "nobody has said yet".
  //
  const decks = useMemo<TableDeck[]>(
    () => [
      ...tokens.map(token => ({
        address: token.address,
        game: token.game,
        slug: token.slug,
        name: token.name,
        cardIds: balances.erc721[token.address] ?? [],
        loading: isLoading,
        //
        // An offer's deck carries its mark and its control, and **the offer is what names the deck** —
        // so moving either to another collection is one line in its hook and nothing here.
        //
        // The mark is drawn in the empty slot, so it is for an empty deck only: the duelists' while a
        // free pack is owed, the `+` on a packs deck the player holds none of. It also gives such a
        // deck the click that goes with it (`CardTable`). The control is offered whether or not the
        // deck is empty — a player with packs can still buy another — and `CardTable` is what decides
        // it is drawn on the open deck alone, i.e. `/deck/<slug>` and not the browsing table.
        //
        notice:
          token.slug === starterPack?.slug ? (
            <StarterPackMark />
          ) : token.slug === packPurchase?.slug && packPurchase.empty ? (
            <PackPurchaseMark />
          ) : undefined,
        action:
          token.slug === starterPack?.slug ? (
            <StarterPackClaim offer={starterPack} />
          ) : token.slug === packPurchase?.slug ? (
            <PackPurchaseButton offer={packPurchase} />
          ) : undefined,
        //
        // The pack open, which is the same idea one level down: an offer about a *card*, so the deck
        // is handed a control to put on each of its own (`CardTable`'s `cardAction`) and the cards it
        // reveals to lay out beside them. Both are the packs deck's, because that is where a pack is
        // and where what came out of it should turn up.
        //
        cardAction:
          token.slug === packOpen?.slug
            ? (packId: string) => <PackOpenButton offer={packOpen} packId={packId} />
            : undefined,
        reveal:
          token.slug === packOpen?.slug && packOpen.revealed.length > 0
            ? { address: packOpen.duelists, cardIds: packOpen.revealed }
            : undefined,
      })),
      // And the house's own deck, last on the felt. It is not a collection and not the account's, so
      // neither the game filter nor the count above touches it: it is there from the first frame with
      // its real count, which is what makes `/deck/solitaire` a link that works with no wallet at all.
      SOLITAIRE_DECK,
    ],
    [balances, isLoading, tokens, starterPack, packPurchase, packOpen],
  );

  //
  // The table lays decks out by position, so it wants an index; the URL names one. An unknown slug
  // resolves to no deck at all, which is the same view as `/decks` — the route validates the
  // slug and 404s, so this only shows for the frame before that lands.
  //
  const index = slug ? decks.findIndex(deck => deck.slug === slug) : -1;
  const selected = index >= 0 ? index : null;
  const deck = selected === null ? undefined : decks[selected];
  // A reveal beside the deck takes its slots out of the same grid, so it takes them out of the page
  // size too — the same call `CardTable` makes, from the same place.
  const size = gridPageSize(columns, deck?.reveal?.cardIds.length ?? 0);
  const pages = deck ? Math.max(1, Math.ceil(deck.cardIds.length / size)) : 1;

  // Narrowing the window deals fewer cards at a time, so the page being read can fall off the end of
  // a deck that has just grown shorter — clamped here rather than in `setPage`, since the count can
  // change with no one having turned a page.
  const page = Math.min(pageIndex, pages - 1);

  // The cards actually on the felt: the same slice the table deals plus the same reveal beside it,
  // in the same order — this is the range the zoom steps along, so it has to be the grid exactly.
  const hand = useMemo<HandCard[]>(() => {
    if (!deck) return [];
    const dealt = deck.cardIds
      .slice(page * size, (page + 1) * size)
      .map(cardId => ({ address: deck.address, cardId }));
    const reveal = deck.reveal;
    return reveal
      ? [...dealt, ...reveal.cardIds.map(cardId => ({ address: reveal.address, cardId }))]
      : dealt;
  }, [deck, page, size]);

  /** The zoom, moved along the dealt page and stopped at its ends. */
  const stepZoom = useCallback(
    (delta: number) =>
      setZoomed(current => {
        const at = current ? hand.findIndex(card => handKey(card) === current) : -1;
        if (at < 0) return current;
        const next = at + delta;
        return next >= 0 && next < hand.length ? handKey(hand[next]) : current;
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
        else if (slug) router.push('/decks');
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

  const view = useMemo<DecksView>(
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
        onSelect={target => router.push(target === null ? '/decks' : deckHref(decks[target].slug))}
        onZoom={setZoomed}
        onTurnPage={view.turnPage}
      />

      {/* The chrome, from whichever page is mounted. Inert by default so every pixel of felt stays
       * clickable — each control turns its own pointer events back on. */}
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col p-6">
        <DecksContext.Provider value={view}>{children}</DecksContext.Provider>
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
