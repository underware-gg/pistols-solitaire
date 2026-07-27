import type { Card, Suit } from '@/engine/standard-deck';

//
// The vocabulary every solitaire is described in.
//
// The split that makes this worth having: **the engine owns piles, moves and history; a variant owns
// only what is legal.** Klondike, Spider, FreeCell and Yukon all shuffle a deck into named piles and
// move runs of cards between them — they differ in which runs may be lifted, where they may land, and
// when the game is over. So those three questions are the interface (`SolitaireRules`) and everything
// else is shared code that no variant may reach into.
//
// The other load-bearing idea is that **`piles` is both the state's shape and the board's layout**.
// A variant declares its piles once, as data, and the engine builds state from that list while the
// table places them from the same list — so adding FreeCell means adding four `kind: 'cell'` piles and
// the layout draws them without knowing what a cell is. Nothing has to be taught twice.
//

/** Which variants exist. A new one is a file in `rules/` plus a member here. */
export type GameId = 'klondike';

/**
 * What a pile is *for*. The engine treats them all the same; the rules and the layout are what give
 * a kind meaning, so this union is a label rather than behaviour.
 *
 * - `stock` — the undealt remainder, face down; clicking it deals.
 * - `waste` — what the stock has dealt, face up.
 * - `foundation` — where cards are collected. Filling these is winning.
 * - `tableau` — the working columns.
 * - `cell` — a single-card holding spot (FreeCell). Nothing uses it yet; the layout already can.
 */
export type PileKind = 'stock' | 'waste' | 'foundation' | 'tableau' | 'cell';

/**
 * How a pile spreads on the felt, and therefore how much of each card can be seen and clicked.
 *
 * - `stack` — squared up, only the top card visible (stock, foundations).
 * - `down` — fanned toward the player, every card's rank legible (tableau columns).
 * - `right` — fanned sideways (a draw-three waste).
 */
export type Fan = 'stack' | 'down' | 'right';

export type PileId = string;

/**
 * One pile, as declared by a variant. `column`/`row` are **grid cells, not distances** — the layout
 * turns them into positions using its own spacing, so a variant never states a measurement.
 */
export type PileSpec = {
  id: PileId;
  kind: PileKind;
  fan: Fan;
  /** Which grid cell the pile sits in. Column 0 is the leftmost, row 0 the top. */
  column: number;
  row: number;
  /** For a foundation that only takes one suit. Absent means the rules decide per move. */
  suit?: Suit;
};

/** A pile and what is in it. Bottom card first, so the last element is the top of the pile. */
export type Pile = PileSpec & { cards: Card[] };

/**
 * Everything that can change the game, and the **only** things that are persisted.
 *
 * State is not saved — it is replayed from the seed and this list (see `stores/solitaire-store.ts`),
 * which is what makes undo a truncation and makes it impossible for a saved game and its history to
 * disagree. Every field here must therefore be plain JSON and fully determine its own effect.
 */
export type Move =
  /** Carry `count` cards off the top of `from` onto `to`. */
  | { type: 'move'; from: PileId; to: PileId; count: number }
  /** Turn cards from the stock onto the waste. */
  | { type: 'draw' }
  /** Put the waste back under the stock, to go through it again. */
  | { type: 'redeal' };

export type GameState = {
  gameId: GameId;
  /** What the deck was shuffled with. With `Move[]`, this is the whole game. */
  seed: number;
  piles: Record<PileId, Pile>;
  /** Pile ids in declaration order — `Record` has no order worth relying on. */
  order: PileId[];
  /** How many times the stock has been turned over. Some variants cap it. */
  redeals: number;
  won: boolean;
};

/** Per-game knobs the player can set. Passed to the rules rather than baked into them. */
export type GameOptions = {
  /** Cards the stock deals at a time. Klondike's classic choice. */
  drawCount: 1 | 3;
};

/**
 * A single card, addressed by where it lies. This is what a drag carries and what a double-click
 * asks about: the pile it is in and how deep, counted from the bottom (so it indexes `Pile.cards`).
 */
export type CardAt = { pile: PileId; index: number };

/**
 * One variant's rules: the questions the shared engine cannot answer.
 *
 * Every method is **pure** — given a state it returns an answer or a new state, and never mutates its
 * argument. That is what lets the engine replay a whole game from a seed to implement undo, and what
 * keeps `legalMoves` able to speculate freely.
 */
export type SolitaireRules = {
  id: GameId;
  name: string;
  /** The board. Drives both the state's piles and the table's layout — see the note at the top. */
  piles: PileSpec[];
  /** How many 52-card decks are shuffled together. */
  decks: number;

  /** Lay out a freshly shuffled deck. Gets an empty state with every declared pile already present. */
  deal(state: GameState, deck: Card[], options: GameOptions): GameState;

  /**
   * May the run starting at `at` be lifted off its pile? Answers for the whole run below the card,
   * so in Klondike this is where "descending, alternating colours" is enforced on the way *up*.
   */
  canPickUp(state: GameState, at: CardAt): boolean;

  /** May `cards` — a run already lifted, in order — be put down on `to`? */
  canDrop(state: GameState, cards: Card[], to: PileId): boolean;

  /**
   * Where a double-click should send the run at `at`, or null if nowhere. "Collecting" a card is
   * exactly this, so a variant decides its own preference order (foundations before tableau).
   */
  autoTarget(state: GameState, at: CardAt): PileId | null;

  /** What clicking the stock does now: deal, turn the waste back, or nothing. */
  onStockClick(state: GameState, options: GameOptions): Move | null;

  /**
   * Tidy up after any move — in Klondike, turn over a tableau card the move exposed. Called by
   * `applyMove` on every move, so a rule here can never be forgotten at a call site.
   */
  settle(state: GameState): GameState;

  isWon(state: GameState): boolean;
};
