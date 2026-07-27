import type { Card } from '@/engine/standard-deck';

//
// A shuffle you can reproduce.
//
// This is what makes the whole persistence design work: a game is stored as a **seed plus a list of
// moves** rather than as a board, so undo is "drop the last move and replay" and a saved game can
// never disagree with its own history. Replaying requires the deal to come out identical every time,
// which `Math.random()` cannot promise — hence a seeded generator.
//
// It also means a deal can be shared or reported as a number, which is how the win cascade gets
// tested without playing a game out.
//

/**
 * mulberry32 — small, fast, and good enough that a shuffled deck looks shuffled. Not cryptographic,
 * and it does not need to be: nothing here is adversarial.
 */
export const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A seed for a new game. The one place randomness enters — everything downstream is a function of it. */
export const randomSeed = (): number => Math.floor(Math.random() * 0xffffffff);

/**
 * Fisher–Yates, on a copy. Unbiased and, given the same seed, always the same order — the two
 * properties this has to have.
 */
export const shuffle = <T>(items: T[], seed: number): T[] => {
  const random = seededRandom(seed);
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/** Every card face down — the state a deck is in before it is dealt. */
export const faceDown = (cards: Card[]): Card[] => cards.map(card => ({ ...card, faceUp: false }));
