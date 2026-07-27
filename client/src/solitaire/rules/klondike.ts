import { type Card, isRed, rankValue, SUITS } from '@/engine/standard-deck';
import { flipped, flipTop, withPiles } from '@/solitaire/state';
import type { GameOptions, GameState, PileId, PileSpec, SolitaireRules } from '@/solitaire/types';

//
// Klondike — the Windows Solitaire rules.
//
// Seven tableau columns dealt in a triangle with the last card of each turned up; four foundations,
// one per suit, built A→K; the rest face down in the stock, dealt to the waste one or three at a time
// with unlimited passes. Tableau columns build **down in alternating colours**, and only a King may
// start an empty column.
//
// This file is the whole variant. It declares its board and answers the four questions in
// `SolitaireRules`; everything else — moving cards, history, undo, hints, auto-collect, the layout —
// is shared code that never mentions Klondike. Spider or FreeCell is a sibling file, not an edit here.
//

//--------------------------------
// The board
//
// `column`/`row` are grid cells, not distances: the layout decides spacing. The top row carries the
// stock and waste on the left and the four foundations on the right, with column 2 left empty as the
// gap between them — the classic arrangement, and the reason foundations start at column 3.
//
const TABLEAU_COLUMNS = 7;

const piles: PileSpec[] = [
  { id: 'stock', kind: 'stock', fan: 'stack', column: 0, row: 0 },
  { id: 'waste', kind: 'waste', fan: 'right', column: 1, row: 0 },
  ...SUITS.map<PileSpec>((suit, index) => ({
    id: `foundation-${suit}`,
    kind: 'foundation',
    fan: 'stack',
    column: 3 + index,
    row: 0,
    suit,
  })),
  ...Array.from<unknown, PileSpec>({ length: TABLEAU_COLUMNS }, (_, index) => ({
    id: `tableau-${index}`,
    kind: 'tableau',
    fan: 'down',
    column: index,
    row: 1,
  })),
];

const TABLEAU_IDS = Array.from({ length: TABLEAU_COLUMNS }, (_, index) => `tableau-${index}`);

//--------------------------------
// Sequences
//
/** Tableau order: one lower, and the other colour. The only stacking rule Klondike has. */
const stacksOnTableau = (card: Card, onto: Card): boolean =>
  rankValue(card.rank) === rankValue(onto.rank) - 1 && isRed(card.suit) !== isRed(onto.suit);

/** Foundation order: same suit, next rank up. */
const stacksOnFoundation = (card: Card, onto: Card): boolean =>
  card.suit === onto.suit && rankValue(card.rank) === rankValue(onto.rank) + 1;

/** Is this run a valid tableau sequence all the way down? What may be lifted as one unit. */
const isTableauRun = (cards: Card[]): boolean => {
  for (let i = 0; i < cards.length; i++) {
    if (!cards[i].faceUp) return false;
    if (i > 0 && !stacksOnTableau(cards[i], cards[i - 1])) return false;
  }
  return true;
};

/**
 * Whether a lifted run may land on a pile — the standalone that `canDrop` exposes and `autoTarget`
 * reuses. Written as a plain function rather than reached through `this` so that the rules object
 * survives being destructured, which `legalMoves` and the table both do.
 */
const canDropOn = (state: GameState, cards: Card[], to: PileId): boolean => {
  const pile = state.piles[to];
  if (!pile || !cards.length) return false;
  const head = cards[0];
  const top = pile.cards[pile.cards.length - 1];

  switch (pile.kind) {
    case 'foundation':
      // One at a time, matching the foundation's suit, starting at the Ace.
      if (cards.length > 1) return false;
      if (pile.suit && head.suit !== pile.suit) return false;
      return top ? stacksOnFoundation(head, top) : rankValue(head.rank) === 1;
    case 'tableau':
      // An empty column takes a King and nothing else — the rule that makes Klondike hard.
      return top ? stacksOnTableau(head, top) : head.rank === 'K';
    // Nothing is ever put back onto the stock or the waste by hand; a redeal is its own move.
    default:
      return false;
  }
};

export const KLONDIKE: SolitaireRules = {
  id: 'klondike',
  name: 'Klondike',
  piles,
  decks: 1,

  //
  // The triangular deal: column n gets n+1 cards, and the last one is turned face up. Dealt from the
  // top of the shuffled deck, so the stock keeps whatever is left.
  //
  deal(state, deck) {
    const columns: Record<string, Card[]> = {};
    let next = 0;
    for (let column = 0; column < TABLEAU_COLUMNS; column++) {
      const cards = deck.slice(next, next + column + 1);
      next += column + 1;
      columns[TABLEAU_IDS[column]] = cards.map((card, index) =>
        flipped(card, index === cards.length - 1),
      );
    }
    return withPiles(state, {
      ...columns,
      // Reversed so that dealing from the *end* of the array takes the next card off the top — the
      // stock's top card is its last element, like every other pile.
      stock: deck.slice(next).reverse(),
      waste: [],
    });
  },

  //
  // What may be lifted. The waste, the foundations and the stock give up only their top card; a
  // tableau gives up any descending alternating run, which is what makes multi-card drags work.
  //
  canPickUp(state, at) {
    const pile = state.piles[at.pile];
    if (!pile) return false;
    const card = pile.cards[at.index];
    if (!card?.faceUp) return false;
    if (pile.kind === 'tableau') return isTableauRun(pile.cards.slice(at.index));
    // Taking a card back off a foundation is legal in Klondike and occasionally necessary.
    return at.index === pile.cards.length - 1;
  },

  canDrop: canDropOn,

  //
  // Where a double-click sends a card: **its foundation first, then a tableau column**.
  //
  // Collecting is what a double-click is for, so a foundation always wins. The tableau fallback is
  // what makes double-click useful for the rest of the game — and it prefers a column that already
  // has cards over an empty one, because dropping a King into an empty column by double-click when a
  // real move existed elsewhere is rarely what was meant.
  //
  autoTarget(state, at) {
    const pile = state.piles[at.pile];
    if (!pile) return null;
    const run = pile.cards.slice(at.index);
    if (!run.length) return null;

    if (run.length === 1 && pile.kind !== 'foundation') {
      const foundation = state.order.find(
        id => state.piles[id].kind === 'foundation' && canDropOn(state, run, id),
      );
      if (foundation) return foundation;
    }

    const tableau = state.order.filter(
      id => id !== at.pile && state.piles[id].kind === 'tableau' && canDropOn(state, run, id),
    );
    return tableau.find(id => state.piles[id].cards.length > 0) ?? tableau[0] ?? null;
  },

  //
  // The stock: deal while it has cards, turn the waste back when it does not. **Unlimited passes** —
  // capping them would be one comparison against `state.redeals` here and nowhere else.
  //
  onStockClick(state) {
    const stock = state.piles.stock;
    const waste = state.piles.waste;
    if (stock?.cards.length) return { type: 'draw' };
    if (waste?.cards.length) return { type: 'redeal' };
    return null;
  },

  /** Turn up whatever a move exposed. Only the tableau hides cards, so only it needs checking. */
  settle(state) {
    return TABLEAU_IDS.reduce(flipTop, state);
  },

  isWon(state) {
    return state.order
      .filter(id => state.piles[id].kind === 'foundation')
      .every(id => state.piles[id].cards.length === 13);
  },
};

/** Klondike's own options, and the classic defaults: draw three, unlimited passes. */
export const KLONDIKE_DEFAULTS: GameOptions = { drawCount: 3 };
