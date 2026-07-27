import { type Card, freshDeck } from '@/engine/standard-deck';
import { faceDown, shuffle } from '@/solitaire/shuffle';
import type {
  CardAt,
  GameOptions,
  GameState,
  Move,
  Pile,
  PileId,
  SolitaireRules,
} from '@/solitaire/types';

//
// The pile machine: how a game starts, and the one function that advances it.
//
// Everything is **immutable**. A move returns a new state and leaves its argument untouched, which
// buys three things at once: `legalMoves` can try a move without cloning defensively, undo is a replay
// from the seed rather than an inverse-move implementation, and React re-renders because identity
// changed rather than because something told it to.
//
// `applyMove` is the only way state changes — validation, the move itself, the variant's `settle` and
// the win check all live inside it. A caller that could move cards without going through it would be a
// caller that could skip flipping the card it exposed.
//

/** An empty board: every pile the variant declares, in declaration order, with no cards in it. */
export const emptyState = (rules: SolitaireRules, seed: number): GameState => {
  const piles: Record<PileId, Pile> = {};
  for (const spec of rules.piles) piles[spec.id] = { ...spec, cards: [] };
  return {
    gameId: rules.id,
    seed,
    piles,
    order: rules.piles.map(spec => spec.id),
    redeals: 0,
    won: false,
  };
};

/**
 * A new game: shuffle `rules.decks` decks with `seed` and hand them to the variant to lay out.
 *
 * Deterministic in `(rules, seed, options)` — that is the contract the store's replay depends on.
 */
export const dealGame = (rules: SolitaireRules, seed: number, options: GameOptions): GameState => {
  const deck = faceDown(shuffle(freshDeck(rules.decks), seed));
  const dealt = rules.deal(emptyState(rules, seed), deck, options);
  return { ...dealt, won: rules.isWon(dealt) };
};

//--------------------------------
// Reading
//
export const pileOf = (state: GameState, id: PileId): Pile | undefined => state.piles[id];

/** The top card of a pile — the one a player can act on. */
export const topCard = (state: GameState, id: PileId): Card | undefined => {
  const cards = state.piles[id]?.cards;
  return cards?.length ? cards[cards.length - 1] : undefined;
};

/** The card at a position, if there is one. */
export const cardAt = (state: GameState, at: CardAt): Card | undefined =>
  state.piles[at.pile]?.cards[at.index];

/** The run from `at` to the top of its pile — what a drag from that card would carry. */
export const runFrom = (state: GameState, at: CardAt): Card[] =>
  state.piles[at.pile]?.cards.slice(at.index) ?? [];

/** Every position in the game that holds a card, in board order. What `legalMoves` iterates. */
export const everyCardAt = (state: GameState): CardAt[] =>
  state.order.flatMap(pile => state.piles[pile].cards.map((_, index) => ({ pile, index })));

//--------------------------------
// Writing
//
/** A state with one pile replaced. The primitive every mutation below is built from. */
const withPile = (state: GameState, id: PileId, cards: Card[]): GameState => ({
  ...state,
  piles: { ...state.piles, [id]: { ...state.piles[id], cards } },
});

/** A state with several piles replaced at once, so a multi-pile move is still a single new state. */
export const withPiles = (state: GameState, changes: Record<PileId, Card[]>): GameState => {
  const piles = { ...state.piles };
  for (const [id, cards] of Object.entries(changes)) piles[id] = { ...piles[id], cards };
  return { ...state, piles };
};

/** The same card, turned over. */
export const flipped = (card: Card, faceUp: boolean): Card =>
  card.faceUp === faceUp ? card : { ...card, faceUp };

/**
 * Turn the top card of a pile face up if it is not already — what `settle` needs in most variants,
 * so it lives here rather than being written out in each of them.
 */
export const flipTop = (state: GameState, id: PileId): GameState => {
  const cards = state.piles[id]?.cards;
  if (!cards?.length) return state;
  const top = cards[cards.length - 1];
  if (top.faceUp) return state;
  return withPile(state, id, [...cards.slice(0, -1), flipped(top, true)]);
};

//--------------------------------
// Moving
//
/** Whether a move is one the rules allow right now. `applyMove` refuses anything this rejects. */
export const isLegal = (
  state: GameState,
  move: Move,
  rules: SolitaireRules,
  options: GameOptions,
): boolean => {
  if (state.won) return false;
  switch (move.type) {
    case 'move': {
      const from = state.piles[move.from];
      const to = state.piles[move.to];
      if (!from || !to || move.from === move.to) return false;
      if (move.count < 1 || move.count > from.cards.length) return false;
      const at: CardAt = { pile: move.from, index: from.cards.length - move.count };
      return (
        rules.canPickUp(state, at) && rules.canDrop(state, from.cards.slice(at.index), move.to)
      );
    }
    // The stock's two moves are the rules' own suggestion, so the test is that they still suggest it.
    case 'draw':
    case 'redeal':
      return rules.onStockClick(state, options)?.type === move.type;
    default:
      return false;
  }
};

/**
 * Advance the game by one move, or return the state unchanged if the move is not legal.
 *
 * **The only mutator.** Returning the same state on an illegal move is deliberate and is what makes
 * an illegal drag snap back for free: the table derives poses from state, so a rejected drop leaves
 * every pose exactly as it was and the damped animation walks the cards home.
 */
export const applyMove = (
  state: GameState,
  move: Move,
  rules: SolitaireRules,
  options: GameOptions,
): GameState => {
  if (!isLegal(state, move, rules, options)) return state;

  let next: GameState;
  switch (move.type) {
    case 'move': {
      const from = state.piles[move.from].cards;
      const to = state.piles[move.to].cards;
      const carried = from.slice(from.length - move.count);
      next = withPiles(state, {
        [move.from]: from.slice(0, from.length - move.count),
        // A card arriving on a pile is always face up: it has been looked at.
        [move.to]: [...to, ...carried.map(card => flipped(card, true))],
      });
      break;
    }
    case 'draw':
    case 'redeal':
      next = applyStock(state, move, options);
      break;
  }

  const settled = rules.settle(next);
  return { ...settled, won: rules.isWon(settled) };
};

/**
 * The stock's moves. They are the two that are not card-for-card equivalent — a draw turns cards over
 * as it moves them, and a redeal reverses the waste back under the stock — so the variant states
 * *whether* they are available (`onStockClick`) and the engine performs them the one way they work.
 */
const applyStock = (state: GameState, move: Move, options: GameOptions): GameState => {
  const stock = state.order.find(id => state.piles[id].kind === 'stock');
  const waste = state.order.find(id => state.piles[id].kind === 'waste');
  if (!stock || !waste) return state;

  const stockCards = state.piles[stock].cards;
  const wasteCards = state.piles[waste].cards;

  if (move.type === 'redeal') {
    // Back under the stock in the order they were dealt, face down: reversing the waste is what makes
    // a second pass deal the same sequence again rather than backwards.
    return {
      ...withPiles(state, {
        [stock]: [...wasteCards].reverse().map(card => flipped(card, false)),
        [waste]: [],
      }),
      redeals: state.redeals + 1,
    };
  }

  const count = Math.min(options.drawCount, stockCards.length);
  if (count === 0) return state;
  //
  // Cards are taken **off the top of the stock, one at a time**, so the deepest of the three is dealt
  // last and ends up on top of the waste — which is why the slice is reversed. That is not cosmetic:
  // the top of the waste is the only card of the three that can be played, so without the reverse a
  // draw-three offers the wrong card. It is also what makes a redeal reconstruct the original stock
  // exactly (reverse of a reverse), and so what makes a second pass deal the same sequence again.
  //
  const taken = stockCards.slice(stockCards.length - count).reverse();
  return withPiles(state, {
    [stock]: stockCards.slice(0, stockCards.length - count),
    [waste]: [...wasteCards, ...taken.map(card => flipped(card, true))],
  });
};

/**
 * Replay a whole game from its seed. **This is how the game is loaded and how undo works** — see
 * `stores/solitaire-store.ts`. Moves that have become illegal are skipped rather than throwing, so a
 * stored game from an older rules version degrades instead of breaking the page.
 */
export const replay = (
  rules: SolitaireRules,
  seed: number,
  moves: Move[],
  options: GameOptions,
): GameState =>
  moves.reduce(
    (state, move) => applyMove(state, move, rules, options),
    dealGame(rules, seed, options),
  );
