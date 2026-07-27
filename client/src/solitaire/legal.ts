import { applyMove, everyCardAt, runFrom } from '@/solitaire/state';
import type {
  CardAt,
  GameOptions,
  GameState,
  Move,
  PileId,
  SolitaireRules,
} from '@/solitaire/types';

//
// What can be done right now — hints, auto-collect, and the "is this stuck" question.
//
// All of it is **derived from the rules interface alone**, so every variant gets these for free and
// none of them contains a line of Klondike. A new game implements `canPickUp`/`canDrop`/`autoTarget`
// and inherits hinting and auto-collect as a consequence.
//

/** A move the rules allow, with the card it starts from — enough for a hint to point at something. */
export type LegalMove = { move: Move; at: CardAt };

/**
 * Every legal card move on the board. Not the stock's draw: that is always available and never a
 * useful hint, so it is `stockMove` below instead.
 *
 * O(cards × piles), which for 52 cards and 13 piles is a few hundred predicate calls — small enough to
 * run on demand rather than cache, and the reason hints need no bookkeeping.
 */
export const legalMoves = (state: GameState, rules: SolitaireRules): LegalMove[] => {
  if (state.won) return [];
  const moves: LegalMove[] = [];
  for (const at of everyCardAt(state)) {
    if (!rules.canPickUp(state, at)) continue;
    const cards = runFrom(state, at);
    const count = cards.length;
    for (const to of state.order) {
      if (to === at.pile) continue;
      if (!rules.canDrop(state, cards, to)) continue;
      moves.push({ move: { type: 'move', from: at.pile, to, count }, at });
    }
  }
  return moves;
};

/** What clicking the stock would do, if anything. */
export const stockMove = (
  state: GameState,
  rules: SolitaireRules,
  options: GameOptions,
): Move | null => (state.won ? null : rules.onStockClick(state, options));

/**
 * A move worth suggesting, or null.
 *
 * Ranked so a hint is *useful* rather than merely legal: collecting to a foundation first, then a move
 * that uncovers a face-down card (the only moves that reveal information), then anything else. A hint
 * that suggested shuffling a King between two empty columns would be technically correct and useless.
 */
export const hint = (state: GameState, rules: SolitaireRules): LegalMove | null => {
  const moves = legalMoves(state, rules);
  if (!moves.length) return null;

  const score = ({ move, at }: LegalMove): number => {
    if (move.type !== 'move') return 0;
    if (state.piles[move.to].kind === 'foundation') return 3;
    // Lifting the whole face-up run off a pile exposes whatever is under it.
    const below = state.piles[at.pile].cards[at.index - 1];
    if (below && !below.faceUp) return 2;
    // Emptying a column is worth something in most variants; emptying a pile that was already empty
    // of face-up cards is not a move at all.
    if (at.index === 0 && state.piles[at.pile].kind === 'tableau') return 1;
    return 0;
  };

  return moves.reduce((best, move) => (score(move) > score(best) ? move : best), moves[0]);
};

/**
 * Send everything that can go to a foundation, in as many passes as it takes.
 *
 * Returns the moves rather than a state, because the store records moves — and because the table can
 * then play them one at a time on a timer, which is what makes auto-collect *look* like collecting
 * instead of teleporting the board into its finished position.
 *
 * Iterating to a fixed point matters: collecting a 4 may make a 5 collectable, and so on up.
 */
export const autoCollect = (
  state: GameState,
  rules: SolitaireRules,
  options: GameOptions,
): Move[] => {
  const collected: Move[] = [];
  let current = state;

  // Bounded by the number of cards in play: each pass either collects one or stops.
  for (let guard = 0; guard < 200; guard++) {
    const move = collectOne(current, rules);
    if (!move) break;
    const next = applyMove(current, move, rules, options);
    if (next === current) break; // refused — nothing more to do, and never loop on it
    collected.push(move);
    current = next;
  }
  return collected;
};

/** The next single card that can be collected, top of a pile only — you cannot collect from under. */
const collectOne = (state: GameState, rules: SolitaireRules): Move | null => {
  for (const pile of state.order) {
    const cards = state.piles[pile].cards;
    if (!cards.length || state.piles[pile].kind === 'foundation') continue;
    const at: CardAt = { pile, index: cards.length - 1 };
    if (!cards[at.index].faceUp || !rules.canPickUp(state, at)) continue;
    const to = rules.autoTarget(state, at);
    if (to && state.piles[to]?.kind === 'foundation') {
      return { type: 'move', from: pile, to, count: 1 };
    }
  }
  return null;
};

/** Where a double-click sends a card, as a move. Null when it has nowhere to go. */
export const collectMove = (state: GameState, rules: SolitaireRules, at: CardAt): Move | null => {
  if (state.won || !rules.canPickUp(state, at)) return null;
  const to = rules.autoTarget(state, at);
  if (!to) return null;
  return { type: 'move', from: at.pile, to, count: runFrom(state, at).length };
};

/** True when there is nothing left to do but start again — no card move and no stock click. */
export const isStuck = (state: GameState, rules: SolitaireRules, options: GameOptions): boolean =>
  !state.won && !stockMove(state, rules, options) && legalMoves(state, rules).length === 0;

/**
 * Which pile a drop at `to` would be allowed to land on, for the run being carried from `at`.
 * The table asks this per candidate while a drag is in the air, so the highlight and the drop can
 * never disagree about what is legal.
 */
export const canDropRun = (
  state: GameState,
  rules: SolitaireRules,
  at: CardAt,
  to: PileId,
): boolean => to !== at.pile && rules.canDrop(state, runFrom(state, at), to);
