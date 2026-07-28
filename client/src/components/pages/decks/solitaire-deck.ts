import type { TableDeck } from '@/components/pages/decks/CardTable';
import { STANDARD_ASPECT } from '@/engine/card-geometry';
import { cardId, faceUrl, JOKER_URL, RANKS, SUITS } from '@/engine/standard-deck';

//
// The one deck on the felt that is not a collection: the 52-card French deck `/solitaire` is played
// with, in deck order, plus the joker the game has no place for.
//
// It is a `TableDeck` like any other, so it browses, deals, pages and zooms with no help from the
// table — the only thing it needs is somewhere to say that its cards are files in `public/deck/`
// rather than tokens in Torii, which is what `TableDeck.art` is. Everything that follows from that
// (the 2:3 shape, the caption saying "Q of Hearts" instead of `#4211`) comes out of the same object.
//
// **It is on the table whether or not an account is connected**, and before balances arrive: it is
// the house's deck, not the player's holdings, so `/deck/solitaire` is a link that always works. The
// game filter leaves it alone for the same reason.
//

/** The deck's place in the URL — `/deck/solitaire`. Also its identity in the table's deck list. */
export const SOLITAIRE_SLUG = 'solitaire';

const JOKER_ID = 'joker';

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

type DeckCard = {
  /** `cardId()`, so a card here is the same card the rules engine deals. The joker is its own. */
  id: string;
  face: string;
  label: string;
};

/** Every card, in the deck's own order: suit by suit, ace to king, joker last. */
const CARDS: DeckCard[] = [
  ...SUITS.flatMap(suit =>
    RANKS.map(rank => ({
      id: cardId(suit, rank),
      face: faceUrl(suit, rank),
      label: `${rank} of ${capitalize(suit)}`,
    })),
  ),
  { id: JOKER_ID, face: JOKER_URL, label: 'Joker' },
];

const BY_ID = new Map(CARDS.map(card => [card.id, card]));

export const SOLITAIRE_DECK: TableDeck = {
  // No contract, so the slug stands in as the deck's identity — it is what `decks` is keyed and
  // searched by, and `useContractMeta` simply finds nothing under it, which is the right answer.
  address: SOLITAIRE_SLUG,
  game: 'solitaire',
  slug: SOLITAIRE_SLUG,
  name: 'Solitaire Deck',
  cardIds: CARDS.map(card => card.id),
  art: {
    aspect: STANDARD_ASPECT,
    face: id => BY_ID.get(id)?.face,
    label: id => BY_ID.get(id)?.label,
  },
};
