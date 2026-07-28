# Solitaire (`client/src/solitaire/` + `components/pages/solitaire/`)

`/solitaire` is classic Windows Klondike on the 3D card table: it deals itself on arrival, cards are dragged or double-clicked, everything is animated, and the whole game survives a refresh. Undo, hints, auto-collect and a win cascade are in. **There is deliberately no timer and no score** — the move *count* is shown, nothing more.

Binding for all code under `client/src/solitaire/` and `components/pages/solitaire/`. Read [`ENGINE.md`](./ENGINE.md) first — the rendering half is all there, and this document only covers the rules layer and how it plugs in.

---

## 1. The split that makes this worth having

> **The engine owns piles, moves and history. A variant owns only what is legal.**

Klondike, Spider, FreeCell and Yukon all shuffle a deck into named piles and move runs of cards between them. They differ in three questions: which runs may be lifted, where they may land, and when the game is over. So **those are the interface** and everything else is shared code that no variant may reach into.

```
src/solitaire/
  types.ts          Card, Pile, PileSpec, GameState, Move, GameOptions, CardAt, SolitaireRules
  shuffle.ts        seeded mulberry32 + Fisher–Yates
  state.ts          immutable pile machine — emptyState, dealGame, applyMove, replay
  legal.ts          generic scans — legalMoves, hint, autoCollect, collectMove, isStuck
  rules/
    klondike.ts     the whole variant, ~150 lines
    index.ts        GAMES / GAME_DEFAULTS / DEFAULT_GAME registry
```

Nothing in `state.ts` or `legal.ts` contains a line of Klondike. That is the invariant to preserve.

### `rules.piles` is both the state's shape *and* the board's layout

This is the trick that keeps a variant to one file. A variant declares its piles once, as data:

```ts
type PileSpec = {
  id: PileId;
  kind: 'stock' | 'waste' | 'foundation' | 'tableau' | 'cell';
  fan: 'stack' | 'down' | 'right';
  column: number;   // grid cells, NOT distances — the layout owns spacing
  row: number;
  suit?: Suit;      // for a foundation that takes only one suit
};
```

- `emptyState` builds the game's piles from that list.
- `solitaire-layout.ts` places them from **the same list**, using `column`/`row` as grid cells and `fan` to decide how a pile spreads.

So FreeCell adds four `kind: 'cell'` piles and the layout draws them **without knowing what a cell is**. Nothing has to be taught twice. `PileKind` is a label for the rules and the layout to interpret, not behaviour — the engine treats every pile identically.

---

## 2. The rules interface

Every method is **pure**: given a state it returns an answer or a new state, and never mutates its argument. That is what lets the engine replay a whole game from a seed to implement undo, and what lets `legalMoves` speculate freely without defensive cloning.

```ts
type SolitaireRules = {
  id: GameId;
  name: string;
  piles: PileSpec[];
  decks: number;

  deal(state, deck, options): GameState;              // lay out a shuffled deck
  canPickUp(state, at: CardAt): boolean;              // may this run be lifted?
  canDrop(state, cards: Card[], to: PileId): boolean; // may this run land here?
  autoTarget(state, at: CardAt): PileId | null;       // the double-click destination
  onStockClick(state, options): Move | null;          // deal, redeal, or nothing
  settle(state): GameState;                           // tidy after any move
  isWon(state): boolean;
};
```

- **`canPickUp` answers for the whole run below the card**, not just the card. Klondike's "descending, alternating colours" is enforced here, on the way *up*.
- **`settle` is called by `applyMove` on every move**, so a rule there can never be forgotten at a call site. Klondike's is "turn up whatever the move exposed" (`TABLEAU_IDS.reduce(flipTop, state)`).
- **`onStockClick` states *whether* a stock move is available, not how to perform it.** The stock's two moves are the ones that are not card-for-card equivalent — a draw turns cards over as it moves them, a redeal reverses the waste back under the stock — so the engine performs them the one way they work.
- **Write predicates as standalone functions, not `this` methods.** `klondike.ts` has `canDropOn(state, cards, to)` and `canDrop: canDropOn`, because `legalMoves` and the table both destructure the rules object and a `this` reference would break.

---

## 3. `Move` is the unit of everything

```ts
type Move =
  | { type: 'move'; from: PileId; to: PileId; count: number }
  | { type: 'draw' }      // stock → waste
  | { type: 'redeal' };   // waste → stock
```

**These are the only things that change a game, and the only things persisted.** Every field must be plain JSON and must fully determine its own effect. A new mechanic is a new `Move` variant, never a mutation performed elsewhere.

### `applyMove` is the only mutator

Validate (`isLegal`) → move cards immutably → `rules.settle` → re-check `isWon`. A caller that could move cards around it would be a caller that could forget to flip the card it uncovered.

> **An illegal move returns the *same state object*.** `if (next === state) return;` in the store is how a rejected drag records nothing, and because poses are derived from state, the cards animate home by themselves. This identity check is load-bearing — see `ENGINE.md` §2.

### The draw must reverse the cards it takes

Cards come off the top of the stock **one at a time**, so the deepest of the three is dealt last and ends up on top of the waste. Hence `stockCards.slice(-count).reverse()`.

This is not cosmetic and was a real bug caught only by the node harness:

- The top of the waste is the **only card of the three that can be played**, so without the reverse a draw-three offers the wrong card.
- A redeal reverses the waste back under the stock, so reverse-of-a-reverse is what makes the stock reconstruct exactly and **a second pass deal the same sequence again**.

---

## 4. Persistence: a seed plus a move list, never a board

`stores/solitaire-store.ts` persists `{ gameId, seed, moves, drawCount, cardBack }` and **`partialize` drops the derived `state`**.

| | |
|---|---|
| **Undo** | Drop the last move and replay from the seed. No inverse-move code, and a board cannot drift from its history — the board *is* the history, evaluated. |
| **Size** | A `GameState` is ~4KB of JSON, so a few hundred would be most of a ~5MB localStorage budget. 400 `Move`s is ~8KB. |
| **Testability** | A winnable seed can be found by a solver and the browser loaded straight into a nearly-won game. There is no other way to reach the win path. |
| **Cost** | The deal and every rule must be **deterministic** — hence `shuffle.ts`'s seeded mulberry32, never `Math.random()`. |

`settings-store` persists everything because everything in it is a setting; `solitaire-store` uses `partialize` for the opposite reason — storing the board too would let a saved board contradict the moves it is supposed to be the result of.

### Rehydration gates the deal

1. Both stores use `skipHydration` (reading storage during the first client render would mismatch the prerendered HTML).
2. `SettingsProvider` calls `persist.rehydrate()` for **every** persisted store on mount.
3. `solitaire-store`'s `onRehydrateStorage` calls `resume()`, which replays the stored moves and sets `hydrated`.
4. `SolitaireScene` has exactly one effect: **`if (hydrated && !state) newGame()`**.

That single line is *both* "starts automatically" and "resume on refresh". **Dealing before `hydrated`** would show a returning player a fresh game and then replace it with their real one.

`fresh` distinguishes the two for the animation: a new deal gives every card `initial = stockTop(...)` plus a stagger so it flies out of the stock; a resumed game passes no `initial`, so each card mounts at its resting pose and the board is simply already there.

### Store API

`newGame(seed?)` · `play(move)` · `collect(at)` · `drawFromStock()` · `collectAll()` · `undo()` · `showHint()` / `clearHint()` · `setDrawCount(1|3)` · `setCardBack(back)` · `resume()`

- **Read one field at a time** (`useSolitaireStore(s => s.state)`); a whole-store selector re-renders on every unrelated change.
- `setDrawCount` **starts a new deal**, because the same deal is not equally solvable at 1 and 3 and keeping the board would silently change the rules mid-game. `setCardBack` is the opposite and keeps the board: the back is a texture the table reads, so switching it mid-game costs nothing and changes no rule.
- `collectAll` applies its whole batch as **one** state change, so every card that can go home sets off at once and the damped poses fan them out on their own — which is what the cascade looks like.
- `HISTORY_LIMIT` (400) caps the move list.

---

## 5. What every variant inherits free

`legal.ts` is built on the rules interface alone, so a new game gets all of this without writing any of it:

| Function | Notes |
|---|---|
| `legalMoves(state, rules)` | Every legal card move. O(cards × piles) ≈ a few hundred predicate calls — small enough to run on demand, which is why hints need no bookkeeping. |
| `hint(state, rules)` | **Ranked so it is useful, not merely legal**: a foundation first (3), then a move that uncovers a face-down card (2) — the only moves that reveal information — then anything else. A hint that suggested shuffling a King between two empty columns would be technically correct and useless. |
| `autoCollect(state, rules, options)` | Iterates **to a fixed point**, because collecting a 4 may make a 5 collectable. Returns moves, not a state, so the store can record them. |
| `collectMove(state, rules, at)` | What a double-click does. |
| `stockMove` / `isStuck` / `canDropRun` | |

---

## 6. The page

```
components/pages/solitaire/
  SolitairePage.tsx      the chrome: back · move count · hint · undo · collect-all · new game · draw/back settings · win banner
  SolitaireScene.tsx     the <Canvas>, the keyboard, and the deal-on-arrival effect
  SolitaireTable.tsx     inside the Canvas: FitCamera, lights, shadow catcher, slots, every card
  solitaire-layout.ts    BOARD + every pose as a pure function
```

Same shape as `/decks`: the scene owns state, the chrome is `pointer-events-none` DOM over a transparent canvas with each control turning its own events back on, and poses are pure functions of state. The chrome owns **no** game state — everything comes from the store, which the keyboard also drives, so the two cannot disagree.

- **The foot of the table holds the two settings**: `Draw 1|3` as a button that toggles (it restarts the game, so it is one decision with two values) and the card back as a `SegmentedControl`, because there are three and picking one directly beats cycling up to two steps to reach it. Its options are **derived from `CARD_BACKS`**, so a fourth back appears with no edit here.
- **The icon row's labels are one shared line under it, not a popover per button.** The row is a `Action[]` table (`tip`, icon, handler, disabled) and the tip is also each button's `aria-label`, so the two can't drift. The line is always mounted at a fixed height and fades, because a tip appearing on hover would otherwise shove the icons up and down as the pointer crosses the row; the column around both stays `pointer-events-none` so the empty line never covers felt. The **row** clears the tip as well as each button — a browser dispatches no pointer events from a *disabled* control, so undoing the last move disables the button under the cursor and its own `onPointerLeave` never arrives (and hovering an already-disabled one shows no tip at all, for the same reason).

**The canvas is mounted by the page, not a layout** — the opposite of the deck table, and the comment in `app/solitaire/page.tsx` says why: `/decks` and `/deck/<slug>` are separate routes that would unmount the canvas, so they share a layout through the `(table)` route group; `/solitaire` has no children. **If game selection ever becomes `/solitaire/<game>`, that is the moment to move `SolitaireScene` into a `layout.tsx`.**

Keyboard (in the scene, because these are global): `Ctrl`/`⌘`+`Z` undo · `N` new game · `H` hint · `Space` draw from the stock (the one move with no card to click on). Modifier and form-field guards are already there.

### `BOARD` — the less obvious knobs

- **`fanDown` and `fanDownFaceDown` differ on purpose.** A face-down card only has to show that it is there, so packing them tight keeps a long column short; a face-up card has to show the rank and suit in its top-left corner. Which means a column's offset is a **running total, not a product** — `fanOffset` must add up the cards actually above the one being placed.
- **A `right` fan spreads only the *last* `fanRightCount` cards.** Fanning from the bottom would run a 24-card waste clean off the board, and the last cards dealt are the ones on offer anyway.
- **`fitFaceDown` / `fitFaceUp` reserve room for a column that has not grown yet.** The board's depth depends on its longest column, which changes almost every move, and framing the actual longest one would zoom the camera continuously while the game is played — so the shot is held at a plausible worst case. They are card **counts** so they can be reasoned about, and they are set to a realistic column (6 down, 7 up) rather than the theoretical maximum: reserving for a full King-to-Ace run would shrink every card on the felt for the whole game to pay for something that almost never happens.
- **`pilePose` vs `deckPose`** — face-up for the slot plane, **rotation-free** for a `Deck3D`. Conflating them stands the stock bolt upright; see `ENGINE.md` § `Deck3D`.
- **`boardMetrics().shiftZ`** centres the board on the origin. The tableau fans toward the player, so the content is not symmetric; see `ENGINE.md` § `camera-fit.ts`.
- **`winPose(index, total)` is deterministic in the index.** `Math.random()` would re-throw every card on every frame.

### Table decisions worth keeping

- **The stock's cards are drawn by `Deck3D`, not individually** — a squared-up block whose members are never addressed, so 24 damped groups for a pile nobody can see into is work for nothing.
- **Every other card is an individual `Card3D` keyed by card id, mounted for the life of the game.** That is what makes moves, flips, undo and the win cascade all the same one mechanism.
  - **It takes one flat list to be true, and a list per pile is a real bug.** `piles.map(pile => pile.cards.map(…))` reads better, but React wraps each inner array in a fragment keyed `null` — matched by slot *index* — and keys are only compared with siblings inside it. A card whose id moves from the waste's array to a tableau's array is a different child: it unmounts, remounts, and `usePoseAnimation` puts it straight on its new pose, so **every move between piles is a cut instead of a move**. Flat, all the ids are siblings.
  - **They render in card-id order, not board order.** Board order changes on almost every move, so React would emit child *moves* — and R3F's `insertBefore` splices an instance in at its new index without unlinking it from the old one, leaving it listed twice in the parent's `children`. The scene graph and the transforms survive that (`applyProps` only writes props that are present, and `children` is reserved), so it is a latent hazard rather than a known cause of anything — but card-id order never changes, so no reorder ever happens. Nothing else depends on it: cards are opaque and placed by pose, so depth sorts them.
  - **A `<group key={state.seed}>` around them is what still lets a new deal deal.** The 52 ids repeat game to game, so without it a new game slides the cards from the old board to the new one instead of dealing them out of the stock.
  - **A card that remounts anyway enters from where it last was** (`wasAt`, last render's poses). `initial` is mount-only and defaults to the card's *target*, so any unforeseen remount plays the move as a cut — a silent failure, and the shape of two bugs already found here. The net turns the worst case into a move that starts from a slightly wrong point. Absent from the map means genuinely new: dealt by the stock, or the first render of a resumed board.
  - **A card the stock deals is the one card with no earlier pose**, because the stock is that `Deck3D` block — the draw is genuinely its mount. It gets `drawnFrom` as an entrance and `DRAW_STAGGER × its place in the draw` as a delay, so a draw-three turns three cards over one after another instead of three appearing already drawn. Which cards those are is *"in the stock last render"*, held in a ref: "the last few cards of the waste" agrees only immediately after a draw and would fly an undone card out of a stock it was never in.
  - **Which way a card turns over between the stock and the waste is `BOARD.drawTurn`, and it is one word to switch.** `sideways` (the default) turns it about its long axis, the way a dealer turns the stock's top card onto a waste beside it; `over` is the end-over-end turn every other card on the board does. The whole mechanism is **a half turn of yaw on the face-down pose** — that makes its difference from the face-up one 180° about z instead of x, and `usePoseAnimation` slerps, so the card walks that arc (see `ENGINE.md`). The yaw is invisible, being applied to a pose whose face is down. Measured, `sideways` also rises less: 0.51 against 0.71 for `over`, since a card standing on its long edge hangs below its centre by half its width rather than half its height.
    - **The yaw's sign is the *opposite* of the direction of travel** (`rollingStockTop`). Rolling the way the card is going means the *trailing* edge lifts, crosses over the top and lands leading, so a waste to the right of the stock takes a negative yaw. Taking the sign of the journey rolls the card backwards, like a wheel spinning the wrong way — measured, not reasoned, and it was wrong in the first cut.
    - **The draw and the return share that one sign**, so `drawnFrom` and `returnedTo` both measure to the *non-stock* end of the journey. Reversing a slerp arc reverses the roll, and their travel is reversed too, so a single yaw has the card rolling right on its way out and left on its way home. Verified: both peak at ~0.55, never cut into the pile, and land exactly on their target.
  - **A redeal has to keep its cards alive to animate at all** (`RETURN_MS`, `Returning`). Turning the waste back into the stock hands those cards to the `Deck3D` block, so they leave the mounted board in the same render — the mirror of the draw, with no *later* pose to travel to instead of no earlier one. They are rendered from their own list for `RETURN_MS` after the game has stopped counting them, entering at `from` (where they last lay, out of `wasAt`) and travelling to `returnedTo`. Two things fall out: a card joining that list *is* a remount, which is exactly what gives it its entrance; and the list carries no handlers, so a card in flight cannot swallow a click meant for the deck under it. **A fresh deal is excluded explicitly** — it fills the stock with cards that were on the board a render ago, i.e. the previous game's, which is indistinguishable from a redeal by this test.
  - **A batch out of the stock spreads over `BATCH_SPREAD` at most** (`batchGap`). `DRAW_STAGGER` is a per-card gap tuned for three, and undoing a redeal deals the whole waste back out — twenty-four cards at 0.09 each would trickle for over two seconds. A draw of three is well inside the budget and keeps its full gap.
- **Slots are drawn for every pile unconditionally**, under everything. A slot beneath a full column is simply covered by it, which costs one unlit plane and means an emptying column reveals its slot with **no state change at all**.
- **The drop highlight is drawn at the drop point, not the pile's slot.** On a fanned column those are far apart — the slot is at the top and cards land at the bottom — so highlighting the slot lights up a spot the carried card is nowhere near and reads as the wrong column.
- **Only a card `rules.canPickUp` allows gets a `hoverPose`.** A hover lift on a buried card promises a move that is not there.
- **The 52 faces are not pinned in the art cache; only the back is.** See `ENGINE.md` § `card-art.ts` — pinning them would starve `/decks`.
- **Every card is rasterized at `DECK_ART_HEIGHT`, not the default.** The deck's art is 1024×1536 and a card on this board is a couple of hundred pixels tall, so `/decks`'s zoom budget would cost twice the VRAM for detail this camera cannot reach. Pass it to `Card3D` *and* to the `useCardArt` call that loads the back — they are separate call sites and a mismatch just means two cache entries.

---

## 7. Recipe: adding a variant

Klondike is the reference. A new game is **one file plus three lines**, and touches no engine code.

1. **`rules/<game>.ts`** — export a `SolitaireRules`:
   - Declare `piles: PileSpec[]` with `column`/`row` grid cells. Leave a gap column if the classic layout has one (Klondike leaves column 2 between the waste and the foundations).
   - `decks: 2` for Spider and its kin; `cardId` already carries a deck number.
   - Write the sequence predicates as small standalone functions (`stacksOnTableau`, `isTableauRun`, …), then a standalone `canDropOn` that `canDrop` aliases.
   - `deal` receives an empty state with every declared pile present, plus the shuffled deck. Remember a pile's **last array element is its top**.
   - `settle` with `flipTop` over whatever piles hide cards.
   - Export a `<GAME>_DEFAULTS: GameOptions`.
2. **`types.ts`** — add the id to the `GameId` union.
3. **`rules/index.ts`** — add it to `GAMES` and `GAME_DEFAULTS`.
4. **Nothing else.** The store, the scene, the layout, hints, undo, auto-collect and the win cascade all work on it, because none of them names a variant. Add a game picker to the chrome if you want one (and see the note about `/solitaire/<game>` becoming a route).
5. **New option?** Add a field to `GameOptions`, thread it through `GAME_DEFAULTS`, and persist it on the store if the player sets it. Options reach the rules as an argument; they are never baked into a variant.
6. **New pile shape?** Add a `PileKind` and/or a `Fan`, then teach `solitaire-layout.ts`'s `fanOffset` the new fan. A new *kind* usually needs no layout change at all.

Things that would be a mistake: reaching into `state.piles` to move cards outside `applyMove`; adding a variant check to `legal.ts` or `state.ts`; putting a tuned distance in a rules file; making a rules method impure.

---

## 8. Testing

**The rules engine is pure and has no DOM dependency, so exercise it in node.** There is no test runner in the repo; bundle a scratch entry with esbuild (`--tsconfig=client/tsconfig.json` resolves the `@/` aliases, `--alias:three=<abs path>` if the entry lives outside the project) and run it.

What the existing harness checks, and what a new variant should copy:

- **The deal**: card count, uniqueness, pile count, the variant's own shape (triangular tableau, one card up per column, the up card is the last one), stock/waste/foundation starting sizes, face-down-ness.
- **Determinism**: same seed → identical deal; different seed → different deal.
- **The stock**: draw size, face-up-ness, exhaustion, redeal refill/emptying/turn-down, **and that a second pass deals the same order as the first** (this is what caught the reverse bug).
- **Stacking predicates, exhaustively** — including every rejection: wrong colour, wrong rank, wrong direction, a Queen on an empty column, a 2 starting a foundation, a multi-card run onto a foundation, anything onto the stock or waste.
- **Picking up runs**: a top card, a valid run, a face-down card, and a same-colour pair that must *not* be liftable.
- **`applyMove`**: the move lands, `settle` flipped the exposed card, and **an illegal move returns the same object** (the snap-back contract).
- **Win + auto-collect**: not won one card short, auto-collect finds the rest, won after, no legal moves once won.
- **Replay fidelity**: play a long game, `replay(seed, moves)` reproduces it exactly; undo-then-redo returns to the same state; an empty replay is the deal.
- **Invariants over many seeds** — card conservation, uniqueness and replay fidelity across 300 seeds, playing each greedily. Cheap and catches whole classes of bug.

For the browser half, see `ENGINE.md` §7 — and two solitaire-specific tricks:

- **To drive a specific board**, write the persisted store before loading: `localStorage['ps-solitaire'] = { state: { gameId, seed, moves, drawCount, cardBack }, version: 0 }`, then reload. Seed-plus-moves *is* a board.
- **To reach the win path**, run a greedy best-first search with a visited set over board keys (a plain greedy player loops forever shuffling a card back and forth), plant `moves.slice(0, -1)`, and finish it in the browser with the collect-all button. Seed 1 is winnable in 108 moves.
- **To drive a specific card**, compute its screen position with the real layout functions and a real `PerspectiveCamera` — three runs fine in node — rather than guessing pixels.
