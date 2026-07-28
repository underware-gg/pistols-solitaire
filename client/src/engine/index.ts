//
// The card engine: everything needed to put animated 3D playing cards on a table, and nothing about
// any particular game.
//
// It is a deliberate fourth top-level module alongside `lib/`, `hooks/` and `components/` (which
// `specs/CODING_STYLE.md` otherwise mandates) because these files are one thing: a card's mesh, its
// art, its pose, the frame loop that moves it, the camera that frames it, and the two components that
// draw it. Splitting them across three directories by *kind of file* hid that, and every page that
// deals cards wants all of them together.
//
// The rule for what belongs here: **it must not know what the cards mean.** Suits and ranks are fine
// (`standard-deck.ts` — a deck is not a game); a tableau, a foundation or a token collection is not.
// Numbers a person tunes by eye — grid spacing, hover lift, camera angle — live in the page's own
// `*-layout.ts`, which is why several components take a `hoverPose` or a `cardPose` function instead
// of reading a constant.
//
// Import from `@/engine` for the common surface; deep-import a module when you want one internal
// (`@/engine/card-art`'s `CARD_BACK_URL`, say).
//

export { Card3D } from '@/engine/Card3D';
export { CardSlot3D } from '@/engine/CardSlot3D';
export { Deck3D } from '@/engine/Deck3D';
export { FitCamera } from '@/engine/FitCamera';

export { cameraAt, fitDistance, type HalfExtents, visibleAt } from '@/engine/camera-fit';
export {
  type CardArtOptions,
  CARD_ART_HEIGHT,
  DECK_ART_HEIGHT,
  loadCardArt,
} from '@/engine/card-art';
export {
  CARD_ART_TINT,
  CARD_ASPECT,
  CARD_FACE,
  CARD_GEOMETRY,
  CARD_HEIGHT,
  CARD_PAPER_COLOR,
  CARD_THICKNESS,
  CARD_WIDTH,
  cardCornerRadius,
  cardGeometry,
  cardWidth,
  STANDARD_ASPECT,
  TOKEN_ASPECT,
} from '@/engine/card-geometry';
export {
  applyPose,
  damp,
  FACE_DOWN,
  FACE_UP,
  faceDownPose,
  type Pose,
  POSE_EULER_ORDER,
} from '@/engine/card-pose';
export { cardSlotTexture } from '@/engine/card-slot';
export {
  backUrl,
  type Card,
  CARD_BACKS,
  type CardBack,
  cardId,
  faceUrl,
  freshDeck,
  isRed,
  type Rank,
  RANKS,
  rankValue,
  type Suit,
  SUITS,
} from '@/engine/standard-deck';
export { useCardArt } from '@/engine/use-card-art';
export { type CardDrag, useCardDrag } from '@/engine/use-card-drag';
export { GRAB_LAMBDA, MOVE_LAMBDA, usePoseAnimation } from '@/engine/use-pose-animation';
