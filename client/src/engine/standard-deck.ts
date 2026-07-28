//
// The standard 52-card deck — the French deck every solitaire is played with.
//
// Pure data and url builders: no three.js, no React, nothing that needs a browser. The rules engine
// (`src/solitaire/`) reasons about `Suit`/`Rank`/`Card` and never touches a texture; the table turns
// the same cards into meshes. Keeping the deck here rather than inside the rules is what lets a card
// be *rendered* by any page — a hand of cards in a duel is the same 52 faces.
//
// The art is `public/deck/<suit>/<rank>.jpg` plus `public/deck/backs/<colour>.jpg`: painted JPEGs,
// every one **1024×1536**, i.e. `STANDARD_ASPECT` exactly. Because the source is already the card's
// shape, nothing is letterboxed and the stock colour behind it is never seen — and because it is far
// larger than a card is ever drawn, it is rasterized down to `DECK_ART_HEIGHT` (`card-art.ts`) rather
// than magnified.
//

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export type Suit = (typeof SUITS)[number];

/** Ascending, so the index **is** the rank's value: `A` low, `K` high. See `rankValue`. */
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export type Rank = (typeof RANKS)[number];

/** A card, as the rules see it. `id` is stable and JSON-safe, so game state persists as-is. */
export type Card = {
  id: string;
  suit: Suit;
  rank: Rank;
  /** Which way up it lies. The flip is one number in a pose, so this animates for free. */
  faceUp: boolean;
};

export const isRed = (suit: Suit): boolean => suit === 'hearts' || suit === 'diamonds';

/** `A` → 1 … `K` → 13. The one place rank ordering is defined. */
export const rankValue = (rank: Rank): number => RANKS.indexOf(rank) + 1;

/**
 * A card's identity. Carries the deck number because Spider and its kin play with two decks, and two
 * black Kings of spades in one game have to be distinguishable — React keys, drag targets and the
 * persisted move list all lean on this being unique.
 */
export const cardId = (suit: Suit, rank: Rank, deck = 0): string => `${deck}:${suit}:${rank}`;

/** Every card of `decks` decks, face down, in suit-then-rank order. Shuffling is the caller's job. */
export const freshDeck = (decks = 1): Card[] => {
  const cards: Card[] = [];
  for (let deck = 0; deck < decks; deck++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: cardId(suit, rank, deck), suit, rank, faceUp: false });
      }
    }
  }
  return cards;
};

//--------------------------------
// Art
//
/** The card's own face, from `public/deck/`. */
export const faceUrl = (suit: Suit, rank: Rank): string => `/deck/${suit}/${rank}.jpg`;

/**
 * The backs on offer, **in the order they are offered** — the first is what a new player gets, and
 * the solitaire chrome renders the tuple as a segmented control. Adding one is the whole change
 * needed to offer it, because the url is derived from the name.
 *
 * `public/deck/backs/` also holds `joker.jpg`, which is deliberately **not** here: it is a joker
 * *face*, filed with the backs because it is the one card the 52-card deck has no place for.
 */
export const CARD_BACKS = ['black', 'blue', 'red'] as const;
export type CardBack = (typeof CARD_BACKS)[number];

export const backUrl = (back: CardBack): string => `/deck/backs/${back}.jpg`;
