# The deck browser (`/decks`, `/deck/<slug>`)

Every ERC-721 collection is a face-down deck on the felt; opening one deals a page of its cards face up, and picking a card brings it to the camera instead of opening a modal. A deck is a contract plus a list of token ids, so **a collection nobody owns is the same code fed a different list**.

Components in `client/src/components/pages/decks/`. This is a table, so `ENGINE.md` governs everything that renders a card and `ENGINE.md` §6 is the recipe for another one. Where the tokens and the collection metadata come from is `CHAIN.md`.

## 1. The canvas is mounted by the *layout*, because the open deck is the URL

`/decks` and `/deck/<slug>` are separate routes, and a `<Canvas>` that unmounts loses its WebGL context and every animation this table is built on. So `app/(table)/layout.tsx` mounts `DecksScene` (the canvas and the view state) and the two pages are **only chrome over it**, reading it back through `useDecksView()`.

- **`(table)` is a route group and that is the only reason this works** — a plural list and a singular deck share no path segment to hang a layout from. Keep both routes inside it.
- The scene reads the slug with **`useSelectedLayoutSegments()`** (plural: it sits two levels above `[slug]`, so the singular one would only see `deck`). `onSelect` is a `router.push`, which is why Escape and the browser's Back button are the same gesture.
- Page and zoom stay **out** of the URL, and reset on a `slug` change rather than in the click handler, so Back and Forward reset them too.
- `deck/[slug]/page.tsx` `notFound()`s an unknown slug and prerenders every known one via `generateStaticParams`.

## 2. Layout and camera (`table-layout.ts`)

**`TABLE` is the only place this table is dimensioned and lit** (`ENGINE.md` §3). To fit more cards, raise the grid counts and/or take `cardScale` below 1 — the camera re-frames itself either way.

- The dealt view is off-centre because the pile parks off the grid's left edge, so `gridReach` measures both sides and `gridShiftX` slides grid and pile back to the middle. The browsing layout is already symmetric, so `deckPose`/`deckTopPose` are deliberately not shifted. General trap: `ENGINE.md` § `camera-fit.ts`.
- **`gridTilt` is 0**: cards are lit and shadowed, so leaning one toward a steep camera reads as a *bent* card, not a raised one. Hover is the only thing that raises a card.
- The zoom is framed around the card **and** its caption on both axes (`zoomFill`, `zoomCaption*`, `CAPTION_SCALE`). Those estimate a DOM box — keep them generous.

**How wide the deal is follows the window**: `gridColumnsFor(aspect)`, between `gridColumnsMax` and `gridColumnsMin`. The camera is held back by the layout's *height*, so dropping a column beats shrinking every card. **`DecksScene` decides it, not the canvas** (a `ResizeObserver` on its own `<main>`), because the chrome and the felt have to agree on one number. `page` is clamped against `pages` on read, since narrowing can strand it past the end.

## 3. The open deck is a pile you deal from

- **Big decks are paged**: `gridPageSize(columns)` on the felt at a time, the deck parked beside the grid as the pile and drawn as `TABLE.deckStack` cards whatever the real count.
- Clicking deals the next page; **clicked when empty it closes the deck**, since it is the space the cards came out of. A collection with no cards is inert unless it carries a `notice`. `Deck3D` decides on `remaining` (the pile), never the collection count, and `CardTable` is what hands it a handler or none.
- **Cards return to their deck's drawn stack** (`deckTopPose`), not to the parked pile — the deck is already sliding home when they set off. `dealt` outlives `selected` by `RETURN_MS`, keeping a deck under them the whole way.

## 4. Faces, backs and colour

- **The letterbox is the collection's own colour** — `Card3D`'s `background`, from `useContractMeta(address)?.backgroundColor` else `contracts.json`'s `bgColor`, defaulting to `CARD_PAPER_COLOR`. Per-token `background_color` exists in token metadata and would win, but nothing fetches token metadata yet. Why a colour is so often absent: `CHAIN.md` § `ContractsProvider`.
- **Browsing deals face down and turns each card over as its own art lands** (`Card3D`'s `revealOnLoad`). Torii serves an image in its own time and often needs a second ask, so dealing art-up fills the felt with blank faces; the same wait spent on card backs reads as a deal. A card whose art never comes still turns over — `settled`, not "has a texture", is what it waits on.
- **Two card backs, picked by `game`** (`cardBackUrl`): `pistols`' own collections vs every guest game. Both are pinned once by `CardTable`, not per deck — a back arriving late would flash blank stock across a whole table. A per-collection back wants a `contracts.json` field instead.

## 5. `/deck/solitaire` — a deck that is not a collection

The standard 53 from `public/deck/`, a `TableDeck` like any other whose only difference is `TableDeck.art` (`face`, `aspect`, `label`). A second such deck needs only another `art`.

- The **back is deliberately not in `art`**: it is the player's own from `solitaire-store`, requested at `STANDARD_ASPECT` + `DECK_ART_HEIGHT` so both pages share one pinned texture.
- It is on the table before any wallet is — neither `isLoading` nor the game filter touches the house's deck. Its slug is added to `SLUGS` by hand, and **`contracts.json` must never mint a `solitaire` slug**.
- Its cards are rasterized at `CARD_ART_HEIGHT` and not pinned; 53 faces plus the pinned backs sit just under `CACHE_LIMIT`, the number to watch if the deck grows.

## 6. The free starter pack

A mark on the empty *Duelists* deck, **and the deck is the button** (`hooks/use-starter-pack.ts`, `pages/decks/StarterPack.tsx`). The mark is a `Deck3D` `notice` (a `NotificationBadge`) and `CardTable` gives an otherwise-inert empty deck a click when it carries one, so opening the deck is the whole gesture; the claim is the one `accent` button on that deck's page.

- **The duelists deck, not the Packs deck, and that is the whole shape of this feature.** The duelists are the eligibility test *and* what the claim produces, so one deck carries the mark, the claim and the arrival — the player is pointed at the felt the cards appear in, and a landed claim navigates nowhere because they are already looking at it. The offer names its own deck (`StarterPackOffer.slug`), so moving the mark to another collection is one line in the hook and nothing in the scene or the page.
- **The offer outlives its own transaction; duelists end it.** `phase` is `ready` → `claiming` → `indexing`, and `indexing` is a state worth naming: the receipt has landed and the felt is still empty, so a button that went back to `Claim Starter Pack` would invite a second claim and one that merely stopped spinning would look finished with nothing to show. The wait ends when `TokensProvider`'s subscription publishes the mint — the same `duelists.length === 0` that opened the offer closes it, so nothing polls, nothing is invalidated, and the button is replaced by the cards it was promising.
- **Cheapest question first, and the chain is asked once per address per session.** Torii already knows whether the player holds a duelist, so `can_claim_starter_pack` is only spent on an empty hand — then latched in a module `Map`, because `useReadContract` takes no `staleTime` and the answer cannot change on its own. A landed claim *drops* the latched answer rather than assuming it, so the read asks once more and settles on `false`; that is what makes the latch self-healing for a player who leaves mid-claim.
- **One call site, `DecksScene`**, serving both pages through `useDecksView().starterPack` — a second caller would ask again and hold its own idea of how far along a claim is.

## 7. Zoom

- **← / → step the zoom along the dealt page** (`stepZoom`), bounded by the page rather than wrapping or paging, and the keys are taken only while a card is zoomed.
- **The zoom dimmer is a plane in the scene**, not a div over the canvas: it has to sit *between* the zoomed card and the table. It stays mounted with a damped opacity and takes handlers only while active — R3F leaves handler-less objects out of hit testing, so a faded-out plane can't swallow hovers.
  - **Blocking the pointer takes a handler per event, each calling `stopPropagation()`** — R3F walks *every* object under the cursor and only that call ends the walk. `onPointerOver`/`Move`/`Down` as well as `onClick`, or the felt behind it stays live.
  - **It travels with the card**, `zoomBackdropGap` behind it, damped at `MOVE_LAMBDA` — the rate the cards themselves move at, so it can never overtake one. Parked at the card's final depth instead, it dims the card for the whole flight in and releases it on arrival.
  - **Stepping needs `Card3D`'s `inHand`**: ← / → put two cards in play on opposite sides of one plane, and no plane can be behind both. `inHand` draws the held card over everything; its traps are in `ENGINE.md` § `Card3D`.
