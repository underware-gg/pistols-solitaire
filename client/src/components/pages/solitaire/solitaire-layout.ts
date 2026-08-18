import * as THREE from 'three';
import { fitDistance, type HalfExtents } from '@/engine/camera-fit';
import { CARD_THICKNESS, STANDARD_ASPECT, cardHeight, cardWidth } from '@/engine/card-geometry';
import { FACE_DOWN, FACE_UP, type Pose } from '@/engine/card-pose';
import type { Pile, PileSpec } from '@/solitaire/types';

//
// Every position on the solitaire board, as a pure function of the game state.
//
// Same discipline as `/decks`'s `table-layout.ts`: one `BOARD` block holds every number, read at call time
// so a change to it is the whole edit; distances are in **card heights** and nothing is in pixels,
// because `FitCamera` frames whatever this lays out; and **every angle is in degrees**, converted on the
// way into a `Pose` by `radians()` and never used raw.
//
// The board is generic in the variant. Piles are placed from their declared `column`/`row` and fanned by
// their declared `fan`, so Klondike's seven columns and FreeCell's four cells would both be laid out by
// this file without it knowing that either game exists.
//
// The card is the 2:3 painted deck (`STANDARD_ASPECT`), narrower than `/decks`'s token cards — a
// card is fitted inside the default card's box (`card-geometry.ts`), so this one keeps the full
// height and gives up width. `CARD_WIDTH`/`CARD_HEIGHT` are deliberately never used here: every
// dimension goes through `WIDTH` and `HEIGHT` below.
//

/** Degrees to radians, for `BOARD`'s angles on their way into a `Pose`. See the note above. */
const radians = THREE.MathUtils.degToRad;

/** The deck this table is played with. */
export const ASPECT = STANDARD_ASPECT;
/** This deck's card, fitted to its shape — see the note above. */
export const WIDTH = cardWidth(ASPECT);
export const HEIGHT = cardHeight(ASPECT);

/** Which way a drawn card turns over — see `BOARD.drawTurn`. */
export type DrawTurn = 'over' | 'sideways';

export const BOARD = {
  //--------------------------------
  // the grid the piles sit on
  //
  /** Card-to-card spacing across the board, in card widths: 1 is edge to edge. */
  columnGap: 1.14,
  /** Row-to-row spacing, in card heights. Row 0 is the stock and foundations, row 1 the tableau. */
  rowGap: 1.2,

  //--------------------------------
  // how piles fan
  //
  /**
   * How far each successive card is offset down a tableau column, in card heights — **and the two are
   * deliberately different.** A face-down card only has to show that it is there, so packing them tight
   * keeps a long column short; a face-up card has to show its rank and suit, which live in its top-left
   * corner, so it needs enough room to read.
   */
  fanDown: 0.3,
  fanDownFaceDown: 0.14,
  /** How far a fanned waste spreads to the right, in card widths, and how many of it are fanned. */
  fanRight: 0.4,
  fanRightCount: 3,
  /** Cards drawn in a squared-up stock, however many it really holds. */
  stackDepth: 8,

  //--------------------------------
  // the draw
  //
  /**
   * How a card the stock deals turns over on its way out. **Switch this and nothing else.**
   *
   * - `sideways` — about its long axis, the edge nearest the stock lifting and sweeping the way the
   *   card is travelling, as a dealer turns the top card onto a waste lying beside it. It also rises
   *   less (measured: 0.51 against 0.71), because a card standing on its long edge hangs below its own
   *   centre by half its width rather than half its height.
   * - `over` — end over end, standing up and lying back down, its far edge lifting toward the player.
   *   The turn every other card on the board does.
   *
   * Which reads better depends on where the waste *is*, so it is a knob rather than a decision: beside
   * the stock (Klondike's disposition) a sideways turn follows the travel; directly above or below it
   * there is no sideways to speak of and `over` is the only one that means anything — which
   * `drawnFrom` also enforces, falling back on its own when the two piles share a column.
   */
  drawTurn: 'sideways' as DrawTurn,

  //--------------------------------
  // dragging
  //
  /** How high a carried card rides above the felt, in card heights. */
  dragHeight: 0.75,
  /**
   * How close a carried card must come to a pile's drop point to snap to it, in card heights. Generous
   * on purpose — the alternative is raycasting pile geometry, which cannot be hit at all when a pile is
   * empty, and which makes dropping between two columns feel like a miss.
   */
  dropRadius: 0.75,

  //--------------------------------
  // the camera — `/decks`'s, verbatim, so both tables are seen from the same chair
  //
  fov: 34,
  /** A direction from the board's centre, not an angle: ~76° above the felt, so a flat card reads. */
  direction: [0, 6.2, 1.0] as [number, number, number],
  /** Felt left around the board when the camera frames it, in card widths. */
  fitMargin: 0.5,
  /**
   * How long a tableau column is assumed to get, for framing — **as card counts, so it can be reasoned
   * about**: the face-down cards it was dealt plus the face-up run built on them.
   *
   * The board's depth depends on its longest column, which changes on almost every move. Framing the
   * *actual* longest column would zoom the camera in and out continuously while the game is played, so
   * the shot is held steady at a plausible worst case instead — the cost being empty felt below the deal
   * at the start, which is the space the game grows into.
   *
   * These are set to a realistic column rather than the theoretical one: Klondike deals at most 6 cards
   * face down, and a face-up run longer than about 7 is rare. The theoretical maximum (6 down and a full
   * King-to-Ace run) would reserve half the screen for something that almost never happens, and every
   * card on the felt would be smaller for the whole game to pay for it.
   */
  fitFaceDown: 6,
  fitFaceUp: 7,

  //--------------------------------
  // the win cascade
  //
  /** How far off the board a collected card is flung, in card heights. */
  winSpread: 9,
  /** Degrees of spin a flung card picks up. */
  winSpin: 40,

  //--------------------------------
  // the lighting — `/decks`'s numbers, for the same reason as the camera
  //
  lightAmbient: 0.85,
  lightKeyPosition: [0, 7, 3.0] as [number, number, number],
  lightKeyIntensity: 1.5,
  lightFillPosition: [-1, 3, 7] as [number, number, number],
  lightFillIntensity: 0.45,

  //--------------------------------
  // the shadows
  //
  /** Half-width of the key light's shadow box, in cards. Wider than `/decks`'s: the board is wider. */
  shadowExtent: 10,
  shadowNear: 0.5,
  shadowFar: 30,
  /**
   * Twice `/decks`'s, because the same map is spread over a much wider board — at 1024 the shadow edges
   * down a long tableau column visibly stair-step.
   */
  shadowMapSize: 2048,
  shadowBias: -0.0006,
  shadowOpacity: 0.32,

  //--------------------------------
  // hover
  //
  hoverLift: 0.1,
  /** Degrees a hovered card turns toward the player. Gentler than `/decks`'s — these cards overlap. */
  hoverTilt: 6,
  hoverScale: 1.03,
  deckHoverLift: 0.05,
};

//--------------------------------
// The board's own dimensions
//
/**
 * The grid the piles sit on, and how far the whole thing has to be nudged to be centred.
 *
 * Derived from the *declared* piles, so it is constant for the life of a game and worth computing once
 * (the table memoizes it) rather than per card. Every placement below takes it, which is what keeps a
 * pile's position from depending on the order the piles happen to be iterated in.
 */
export type BoardMetrics = { columns: number; rows: number; shiftZ: number };

/**
 * The board is **not** symmetric about its centre and has to be slid to be framed.
 *
 * The tableau fans *downward* from its row, so the board reaches much further toward the player than
 * away from them — with two rows the content runs from about −1.2 to +5 in z. `FitCamera` aims at the
 * origin, so framing that box without moving it means backing off until the deep side fits and leaving
 * a card's height of wasted felt at the top: the board would sit low and cramped. Shifting everything by
 * half the overhang puts the content's own centre on the origin and the margins come out equal.
 *
 * This is exactly the problem `/decks`'s `gridShiftX` solves for its pile, one axis over.
 */
const zExtent = (rows: number) => {
  const rowZ = (row: number) => (row - (rows - 1) / 2) * HEIGHT * BOARD.rowGap;
  // A column the length `BOARD.fitFaceDown`/`fitFaceUp` describes, fanned at each card's own spacing.
  const reach =
    (BOARD.fitFaceDown * BOARD.fanDownFaceDown + BOARD.fitFaceUp * BOARD.fanDown) * HEIGHT;
  return {
    // The top edge of the topmost card.
    near: rowZ(0) - HEIGHT / 2,
    // The bottom edge of the longest column hanging off the last row.
    far: rowZ(rows - 1) + reach + HEIGHT / 2,
  };
};

export const boardMetrics = (piles: (Pile | PileSpec)[]): BoardMetrics => {
  const columns = piles.reduce((widest, pile) => Math.max(widest, pile.column + 1), 1);
  const rows = piles.reduce((deepest, pile) => Math.max(deepest, pile.row + 1), 1);
  const { near, far } = zExtent(rows);
  return { columns, rows, shiftZ: -(near + far) / 2 };
};

/** Where a pile's first card sits, in world space — its grid cell, centred and shifted. */
export const pileAnchor = (pile: Pile | PileSpec, board: BoardMetrics): [number, number] => [
  (pile.column - (board.columns - 1) / 2) * WIDTH * BOARD.columnGap,
  (pile.row - (board.rows - 1) / 2) * HEIGHT * BOARD.rowGap + board.shiftZ,
];

/** Height of the nth card of a pile resting on the felt. */
const stackY = (index: number) => CARD_THICKNESS * (index + 0.5);

/**
 * How far along its fan the nth card of a pile lies, offset from the pile's anchor.
 *
 * A `down` fan is a **running total, not a product**, because face-up and face-down cards are spaced
 * differently — so it has to add up the cards actually above this one.
 */
const fanOffset = (pile: Pile, index: number): [number, number] => {
  switch (pile.fan) {
    case 'down': {
      let z = 0;
      for (let i = 0; i < index; i++) {
        z += pile.cards[i]?.faceUp ? BOARD.fanDown : BOARD.fanDownFaceDown;
      }
      return [0, z * HEIGHT];
    }
    case 'right': {
      //
      // Only the **last** few of a waste are fanned, and the rest stay squared up beneath them. Fanning
      // from the bottom would run a 24-card waste clean off the board; fanning the top few is also what
      // matches the game, where the last cards dealt are the ones on offer.
      //
      // **The fan is anchored at the pile, not at its top card**, which is what the `max(…, 0)` is for:
      // a waste holding fewer than `fanRightCount` starts its first card on the slot marker, so playing
      // one leaves the cards under it exactly where they were. Letting `from` go negative instead makes
      // every remaining card slide a step to the right — a whole waste animating sideways because
      // something was taken off the end of it.
      const from = Math.max(pile.cards.length - BOARD.fanRightCount, 0);
      const step = Math.min(Math.max(index - from, 0), BOARD.fanRightCount - 1);
      return [step * WIDTH * BOARD.fanRight, 0];
    }
    default:
      return [0, 0];
  }
};

/**
 * Where the nth card of a pile lies. **This is the function the whole table is derived from** — every
 * card's resting pose, and therefore every animation on the board, is this plus the damping.
 */
export const cardPose = (pile: Pile, index: number, board: BoardMetrics): Pose => {
  const [x, z] = pileAnchor(pile, board);
  const [dx, dz] = fanOffset(pile, index);
  return {
    position: [x + dx, stackY(index), z + dz],
    // Face-down is a pose, so a card that is turned over animates the turn for free.
    rotation: [pile.cards[index]?.faceUp === false ? FACE_DOWN : FACE_UP, 0, 0],
    scale: 1,
  };
};

/** Where a pile's empty slot is drawn: flat on the felt, art up. */
export const pilePose = (pile: Pile | PileSpec, board: BoardMetrics): Pose => {
  const [x, z] = pileAnchor(pile, board);
  return { position: [x, 0, z], rotation: [FACE_UP, 0, 0], scale: 1 };
};

/**
 * The same cell, for a `Deck3D` — and **with no rotation at all**, which is the whole point of it being
 * a separate function from `pilePose`.
 *
 * A deck is a group whose cards carry their own `FACE_DOWN` (`stockCardPose`), so handing it a pose that
 * is already turned face up composes the two rotations: −90° then +90° is zero, and the stack stands
 * bolt upright facing the camera instead of lying on the felt. `/decks` has the same contract — its
 * `deckPose` is unrotated and its `deckCardPose` supplies the flip.
 */
export const deckPose = (pile: Pile | PileSpec, board: BoardMetrics): Pose => {
  const [x, z] = pileAnchor(pile, board);
  return { position: [x, 0, z], rotation: [0, 0, 0], scale: 1 };
};

/**
 * The point a drop is measured against: **the top of the pile as it currently lies**, not the pile's
 * anchor. A fifteen-card tableau column has its playable end a long way from where it starts, and
 * measuring to the anchor would make the *bottom* of a long column the easiest place to drop onto it.
 */
export const dropPoint = (pile: Pile, board: BoardMetrics): [number, number] => {
  const pose = pile.cards.length
    ? cardPose(pile, pile.cards.length - 1, board)
    : pilePose(pile, board);
  return [pose.position[0], pose.position[2]];
};

/** Where a carried card rides: under the pointer, lifted, with the run below it fanned as usual. */
export const dragPose = (point: [number, number, number], indexInRun: number): Pose => ({
  position: [
    point[0],
    BOARD.dragHeight + indexInRun * CARD_THICKNESS * 3,
    point[2] + indexInRun * BOARD.fanDown * HEIGHT,
  ],
  rotation: [FACE_UP + radians(BOARD.hoverTilt), 0, 0],
  scale: BOARD.hoverScale,
});

/** The nth card of the stock's drawn stack, in the stock's own space. */
export const stockCardPose = (index: number): Pose => ({
  position: [0, stackY(index), 0],
  rotation: [FACE_DOWN, 0, 0],
  scale: 1,
});

/**
 * **The top of the stock as it currently stands**, face down — where a card enters the table from.
 *
 * Two things come out of here, because they are the same thing: every card of a fresh deal (mounting
 * here and travelling to its place, staggered, *is* the deal) and every card the stock deals mid-game
 * (which has no earlier pose to travel from — the stock is drawn as a `Deck3D`, so its cards are not
 * mounted until they leave it).
 *
 * It follows the stock's *drawn* height rather than a full deck's, so a card dealt from a nearly empty
 * stock comes off the top of what is actually lying there. At deal time the stock is deeper than
 * `stackDepth` anyway, so this is the same pose the deal always used.
 */
export const stockTop = (
  stock: Pile | PileSpec | undefined,
  board: BoardMetrics,
): Pose | undefined => {
  if (!stock) return undefined;
  const [x, z] = pileAnchor(stock, board);
  const drawn =
    'cards' in stock ? Math.min(BOARD.stackDepth, stock.cards.length) : BOARD.stackDepth;
  return {
    position: [x, stackY(drawn), z],
    rotation: [FACE_DOWN, 0, 0],
    scale: 1,
  };
};

/**
 * `stockTop`, yawed so that a card turning over between the stock and the pile it is dealt to **rolls
 * the way it is going** — the face-down half of both journeys, and the whole of `drawTurn: 'sideways'`.
 *
 * **A half turn of yaw on the face-down pose is the entire mechanism.** It makes the difference between
 * this pose and the card's face-up one a 180° rotation about the board's z rather than about its x
 * (`Rx(180)·Ry(180) = Rz(180)`), and because `usePoseAnimation` slerps orientations, the card walks
 * exactly that arc: it turns over sideways with its top edge never moving. The yaw itself is invisible,
 * being applied to a pose whose face is *down* — a card back has no top.
 *
 * Two things about the sign, both measured rather than reasoned:
 *
 * - **It is the *opposite* of the direction of travel.** Rolling the way the card is going means the
 *   *trailing* edge lifts, passes over the top and lands leading — so for a waste to the right of the
 *   stock the yaw is negative. Taking the sign of the journey instead rolls the card backwards, like a
 *   wheel spinning the wrong way.
 * - **Both directions want the same sign**, so `awayX` is the *non-stock* end of the journey either
 *   way — the waste slot a card is dealt to, or the one it is coming back from. Reversing a slerp arc
 *   reverses the roll, and the travel is reversed too, so one yaw serves the draw and the return.
 *
 * A waste in the stock's own column has no sideways to roll in, and `Math.sign(0)` makes that `over`.
 */
const rollingStockTop = (
  stock: Pile | PileSpec | undefined,
  board: BoardMetrics,
  awayX: number,
): Pose | undefined => {
  const top = stockTop(stock, board);
  if (!top || BOARD.drawTurn === 'over') return top;
  const roll = -Math.sign(awayX - top.position[0]);
  return {
    ...top,
    rotation: [top.rotation[0], top.rotation[1] + roll * Math.PI, top.rotation[2]],
  };
};

/** Where a card the stock deals *mid-game* enters from, and how it turns over on the way out. */
export const drawnFrom = (
  stock: Pile | PileSpec | undefined,
  board: BoardMetrics,
  target: Pose,
): Pose | undefined => rollingStockTop(stock, board, target.position[0]);

/**
 * Where a card the waste hands *back* to the stock is going, and how it turns over on the way.
 *
 * The other half of `drawnFrom`, for the redeal: those cards rejoin the `Deck3D` block and so unmount,
 * which is a cut unless something keeps them alive to travel — see `RETURN_MS` in the table.
 */
export const returnedTo = (
  stock: Pile | PileSpec | undefined,
  board: BoardMetrics,
  from: Pose,
): Pose | undefined => rollingStockTop(stock, board, from.position[0]);

//--------------------------------
// Feedback
//
/** The same pose, picked up off the felt: how a card acknowledges the cursor. */
export const hoveredCardPose = (pose: Pose): Pose => ({
  position: [pose.position[0], pose.position[1] + BOARD.hoverLift, pose.position[2]],
  rotation: [pose.rotation[0] + radians(BOARD.hoverTilt), pose.rotation[1], pose.rotation[2]],
  scale: pose.scale * BOARD.hoverScale,
});

/** A deck lifts as a block, without tilting — it is a stack of cards, not one card. */
export const hoveredDeckPose = (pose: Pose): Pose => ({
  ...pose,
  position: [pose.position[0], pose.position[1] + BOARD.deckHoverLift, pose.position[2]],
});

/**
 * Where a card goes when the game is won: flung off the board and spinning.
 *
 * Deterministic in the card's index — `Math.random()` would re-throw every card on every frame. The
 * cascade is otherwise free: these are only poses, and the damping does the rest.
 */
export const winPose = (index: number, total: number): Pose => {
  // Spread around a circle rather than randomly, so the pack leaves evenly instead of clumping.
  const angle = (index / Math.max(1, total)) * Math.PI * 2;
  const reach = BOARD.winSpread * (0.6 + 0.4 * Math.abs(Math.sin(index * 12.9898)));
  return {
    position: [Math.cos(angle) * reach, 0.4 + index * CARD_THICKNESS, Math.sin(angle) * reach],
    rotation: [FACE_UP, radians(BOARD.winSpin) * (index % 2 ? 1 : -1), 0],
    scale: 1,
  };
};

//--------------------------------
// Framing
//
/**
 * Half-extents of the board around the origin. Because `boardMetrics` has already centred the content,
 * this is symmetric and the felt splits evenly on all four sides.
 */
export const boardExtents = (board: BoardMetrics): HalfExtents => {
  const margin = WIDTH * BOARD.fitMargin;
  const { near, far } = zExtent(board.rows);
  return {
    width: ((board.columns - 1) / 2) * WIDTH * BOARD.columnGap + WIDTH / 2 + margin,
    height: (far - near) / 2 + margin,
  };
};

/** How far back the camera has to sit for the whole board to fit a viewport of this aspect ratio. */
export const cameraDistance = (board: BoardMetrics, aspect: number): number =>
  fitDistance(boardExtents(board), aspect, BOARD.fov);
