import * as THREE from 'three';
import { CARD_HEIGHT, CARD_THICKNESS, CARD_WIDTH } from '@/lib/card-geometry';
import { FACE_DOWN, FACE_UP, type Pose } from '@/lib/card-pose';

//
// Every position on the table, as pure functions of the view.
//
// The whole animation is a consequence of this file: a card's pose is derived from what the player
// is looking at (decks, a dealt grid, one zoomed card), and `usePoseAnimation` damps the difference.
// Nothing here knows about time, hover, or React — so a layout change is a number in `TABLE`, and
// the movement follows on its own.
//
// The table is the XZ plane, y is up, and the camera looks down at it from above and in front.
// Distances are in cards: `CARD_HEIGHT` is 1 world unit, so a gap of `1.1` is a tenth of a card of
// felt. Nothing is in pixels and nothing is absolute — the camera frames whatever `TABLE` lays out,
// so the numbers below are free to move.
//
// **Angles are in degrees**, everywhere in `TABLE` — see `radians()`.
//

/**
 * Degrees to radians, for `TABLE`'s angles on their way into a `Pose`.
 *
 * **Every angle in `TABLE` is in degrees**, and that is a rule for anything added to it: these are
 * numbers a person sets by eye, and `6` reads as an angle where `0.105` reads as nothing. Radians
 * live on the other side of this function — `Pose.rotation`, `FACE_UP`/`FACE_DOWN` and everything
 * three.js takes are radians as usual, so a `TABLE` angle is never used raw.
 */
const radians = THREE.MathUtils.degToRad;

/**
 * The table's dimensions, all of them, in one editable block. Every function in this file reads it
 * at call time, so changing a number here (or from the console, in dev) is the whole edit.
 *
 * Distances are in cards, angles are in **degrees**, and nothing is in pixels.
 *
 * **To fit more cards on the felt**: raise `gridColumns` / `gridRows`, then take the gaps down
 * toward 1 (edge to edge) and `cardScale` down from 1. The camera re-frames itself either way, so
 * more cards means smaller cards — the two knobs differ in *how* they get smaller: the grid counts
 * pack more cards into the same felt, while `cardScale` shrinks the cards and leaves the felt
 * showing between them.
 */
export const TABLE = {
  //--------------------------------
  // the dealt grid
  //
  /** Cards dealt per page. `gridColumns * gridRows` is the page size. */
  gridColumns: 5,
  gridRows: 4,
  /** Card-to-card spacing, in cards: 1 is edge to edge, 1.14 leaves a seventh of a card of felt. */
  gridGapX: 1.14,
  gridGapZ: 1.04,
  /** How big a dealt card is drawn. Below 1 the cards shrink inside the same grid. */
  cardScale: 1,
  /**
   * Degrees a dealt card leans back toward the camera. **0 lays the cards flat on the felt**, which
   * is what they do; the camera is steep enough (`direction`) that the art still reads. Anything
   * above 0 stands them up a little, and because they are lit and shadowed the lean looks like a
   * bent card rather than a raised one. `gridPose` lifts a leaning card back out of the felt on its
   * own, so this is safe to turn back up.
   */
  gridTilt: 0,

  //--------------------------------
  // the decks
  //
  deckColumns: 5,
  deckGapX: 1.55,
  deckGapZ: 1.5,
  /** Cards drawn in a stack, however many the collection actually holds. */
  deckStack: 12,
  deckScale: 1,

  //--------------------------------
  // the camera
  //
  /** Vertical field of view, in degrees — three.js takes it in degrees too, so it passes straight. */
  fov: 34,
  /**
   * Where the table is seen from: a **direction** from its centre, not an angle, because the
   * distance along it is fitted per view (`cameraDistance`). Steeper means more top-down — this one
   * is ~76° above the felt, which is why a flat card still reads.
   */
  direction: [0, 6.2, 1.5] as [number, number, number],
  /** Felt left around the layout when the camera frames it, in cards. */
  fitMargin: 0.6,

  //--------------------------------
  // the zoomed card
  //
  zoomDistance: 2,
  /**
   * Fraction of the frame the zoomed card **and its caption together** are allowed to fill. Both
   * axes are fitted, so this holds on a portrait window as well as a wide one.
   */
  zoomFill: 0.9,
  /**
   * The caption printed under the zoomed card, in card units: how far below the card's centre it
   * hangs (`CardTable` positions the `<Html>` from this, so the two cannot drift), and the box it
   * needs. The zoom is framed around card *plus* caption, so these numbers are what keep the
   * caption on screen.
   *
   * They describe a DOM box, so they are **measured, not guessed** — the caption as `CardTable`
   * writes it, with the real fonts loaded, is 49px tall and 164–370px wide across our collection
   * names (`Duels` to a 26-character name), i.e. 0.123 tall and 0.41–0.93 wide at `CAPTION_SCALE`.
   * Re-measure when the caption's type or padding changes, and keep a little headroom.
   */
  zoomCaptionDrop: 0.6,
  zoomCaptionHeight: 0.15,
  zoomCaptionWidth: 1,
  /** How far behind the zoomed card the dimmer sits. */
  zoomBackdropGap: 0.45,

  //--------------------------------
  // hover
  //
  /** How far a hovered card comes off the felt, in cards. */
  hoverLift: 0.12,
  /** Degrees a hovered card turns toward the player as it lifts. */
  hoverTilt: 6,
  hoverScale: 1.05,
  deckHoverLift: 0.06,
};

/** How far the swept decks slide into the distance. They pass under the dealt grid on the way. */
const SWEEP_Z = -14;

/** Cards dealt per page — the slice of a deck that is on the table at once. */
export const gridPageSize = (): number => TABLE.gridColumns * TABLE.gridRows;

const gridGap = () => ({ x: CARD_WIDTH * TABLE.gridGapX, z: CARD_HEIGHT * TABLE.gridGapZ });
const deckGap = () => ({ x: CARD_WIDTH * TABLE.deckGapX, z: CARD_HEIGHT * TABLE.deckGapZ });

/** Where the open deck waits while its cards are dealt: clear of the grid, out to the left. */
const pileX = () => -(((TABLE.gridColumns - 1) / 2) * gridGap().x + CARD_WIDTH * 1.2);
const pileZ = () => gridGap().z * 0.6;

/** Height of the nth card in a stack resting on the felt. */
const stackY = (index: number) => CARD_THICKNESS * (index + 0.5);

/** Degrees a card in a stack is off square, at most — enough to read as shuffled, not as crooked. */
const STACK_JITTER = 1.2;

/**
 * A hair of spin per card so a stack looks shuffled rather than machined. Deterministic in the
 * card's position — `Math.random()` would re-jitter the deck on every render.
 */
const spinJitter = (seed: number) => radians(Math.sin(seed * 12.9898) * STACK_JITTER);

/** Row/column of a deck in the browsing layout, with a short last row centred on its own. */
const deckCell = (index: number, total: number) => {
  const columns = Math.min(TABLE.deckColumns, total);
  const rows = Math.ceil(total / columns);
  const row = Math.floor(index / columns);
  const column = index % columns;
  const inRow = Math.min(columns, total - row * columns);
  return {
    x: (column - (inRow - 1) / 2) * deckGap().x,
    z: (row - (rows - 1) / 2) * deckGap().z,
  };
};

//
// A deck moves as a block, so the *deck* takes the pose and the cards in it are a static local
// stack: one animated group per deck instead of one per card, and a deck of nine costs a deck of
// one. `deckCardPose` is in the deck's own space; everything else is world space.
//
/** A deck at rest on the table, waiting to be picked. */
export const deckPose = (index: number, total: number): Pose => {
  const { x, z } = deckCell(index, total);
  return { position: [x, 0, z], rotation: [0, 0, 0], scale: TABLE.deckScale };
};

/** The decks nobody picked, sliding off into the distance while another deck is open. */
export const deckSweptPose = (index: number, total: number): Pose => {
  const pose = deckPose(index, total);
  pose.position[2] += SWEEP_Z;
  return pose;
};

/** The open deck, parked clear of the grid — the pile its cards are dealt from and return to. */
export const deckParkedPose = (): Pose => ({
  position: [pileX(), 0, pileZ()],
  rotation: [0, 0, 0],
  scale: TABLE.deckScale,
});

/** The nth card of a stack, in its deck's own space: face down, barely shuffled. */
export const deckCardPose = (stackIndex: number): Pose => ({
  position: [0, stackY(stackIndex), 0],
  rotation: [FACE_DOWN, spinJitter(stackIndex * 31), 0],
  scale: 1,
});

/** Top of the parked pile, in world space: where a dealt card comes from. */
export const pilePose = (): Pose => ({
  position: [pileX(), stackY(TABLE.deckStack), pileZ()],
  rotation: [FACE_DOWN, 0, 0],
  scale: TABLE.cardScale,
});

/**
 * Top of a deck resting in the browsing layout — where a dealt card goes *home* to.
 *
 * Not `pilePose`: a closing deck is on its way back to its cell in the grid of decks, so cards that
 * fly to the parked spot instead are flying to where the deck no longer is, and then vanish beside
 * it. Aiming them here lands them on the deck they came out of, wherever it has got to.
 *
 * `stack` is how many cards that deck is *drawing* — a three-card deck is three cards tall, and a
 * card returning to the nominal twelve would settle a visible hair above it.
 */
export const deckTopPose = (index: number, total: number, stack = TABLE.deckStack): Pose => {
  const { x, z } = deckCell(index, total);
  return {
    position: [x, stackY(stack), z],
    rotation: [FACE_DOWN, 0, 0],
    scale: TABLE.deckScale,
  };
};

/** A card's slot in the dealt grid, art up, by its index within the page. */
export const gridPose = (index: number): Pose => {
  const gap = gridGap();
  const column = index % TABLE.gridColumns;
  const row = Math.floor(index / TABLE.gridColumns);
  return {
    position: [
      (column - (TABLE.gridColumns - 1) / 2) * gap.x,
      // Leaning on its own centre digs a card's bottom edge into the felt; this lifts it back out.
      (CARD_HEIGHT / 2) * TABLE.cardScale * Math.sin(radians(TABLE.gridTilt)) + CARD_THICKNESS,
      (row - (TABLE.gridRows - 1) / 2) * gap.z,
    ],
    rotation: [FACE_UP + radians(TABLE.gridTilt), 0, 0],
    scale: TABLE.cardScale,
  };
};

/**
 * The same place, turned over: back up, everything else untouched.
 *
 * **This is the flip**, and it is one number — the tilt. Sweeping it from `FACE_DOWN` to `FACE_UP`
 * passes through upright, so the card stands up, turns to the player and lies back down, and because
 * poses are damped toward, handing a card this pose instead of its face-up one *is* the animation.
 * Browsing does not use it (a collection is dealt art up, all at once, to be read); it is here for
 * the game — a hand dealt face down, cards turned over one at a time — via `Card3D`'s `faceDown`.
 */
export const faceDownPose = (pose: Pose): Pose => ({
  ...pose,
  rotation: [FACE_DOWN, pose.rotation[1], pose.rotation[2]],
});

/**
 * Where the camera is when it has finished framing `view`, and which way it looks: along
 * `TABLE.direction`, at `cameraDistance`, aimed at the table's centre. Poses in front of the camera
 * are derived from *this* rather than from the live camera, so they are already correct while the
 * camera is still damping between two views.
 */
const cameraAt = (distance: number) => {
  const position = new THREE.Vector3(...TABLE.direction).normalize().multiplyScalar(distance);
  return { position, view: position.clone().normalize().negate() };
};

/**
 * Which way is up on screen, in world space: world up with its component along the view removed.
 * The camera looks down at the table, so "up on screen" is mostly *away* — nudging a zoomed card up
 * in the frame means moving it into the distance, not lifting it.
 */
const screenUp = (view: THREE.Vector3) =>
  new THREE.Vector3(0, 1, 0).addScaledVector(view, -view.y).normalize();

/** How much of the frame a zoomed card takes: not the card, the card and the caption hanging off it. */
const visibleAt = (fov: number, depth: number, aspect: number) => {
  const height = 2 * Math.tan(radians(fov) / 2) * depth;
  return { height, width: height * aspect };
};

/**
 * The zoomed card and its caption as one box, in card units, measured from the card's own centre.
 * It is taller below than above (the caption hangs under the card), so `offset` is how far the card
 * has to ride above the box's centre for the pair to be centred in the frame.
 */
const zoomBlock = () => {
  const above = CARD_HEIGHT / 2;
  const below = Math.max(CARD_HEIGHT / 2, TABLE.zoomCaptionDrop + TABLE.zoomCaptionHeight / 2);
  return {
    width: Math.max(CARD_WIDTH, TABLE.zoomCaptionWidth),
    height: above + below,
    offset: (below - above) / 2,
  };
};

/**
 * A card held up in front of the camera, filling the view — the "modal", except it is the same mesh
 * that was on the felt a moment ago, so it arrives by moving rather than by appearing.
 *
 * Fitted on **both** axes and around the caption as well as the card, which is what keeps the
 * assembly inside the canvas: filling a fraction of the height alone overflows a narrow window
 * sideways, and ignoring the caption hangs it off the bottom edge.
 *
 * The card turns to face the camera with tilt alone, which holds as long as the camera has no yaw
 * (ours sits on the z axis, by `TABLE.direction`).
 */
export const zoomPose = (fov: number, distance: number, aspect: number): Pose => {
  const camera = cameraAt(distance);
  const visible = visibleAt(fov, TABLE.zoomDistance, aspect);
  const block = zoomBlock();
  const scale =
    TABLE.zoomFill * Math.min(visible.height / block.height, visible.width / block.width);
  const position = camera.position
    .addScaledVector(camera.view, TABLE.zoomDistance)
    .addScaledVector(screenUp(camera.view), block.offset * scale);
  return {
    position: [position.x, position.y, position.z],
    rotation: [Math.atan2(camera.view.y, -camera.view.z), 0, 0],
    scale,
  };
};

/**
 * The dimmer that sits between a zoomed card and the rest of the table: a plane facing the camera,
 * just behind the card, sized to fill the frustum at that depth.
 */
export const zoomBackdropPlane = (fov: number, distance: number, aspect: number) => {
  const camera = cameraAt(distance);
  const depth = TABLE.zoomDistance + TABLE.zoomBackdropGap;
  const position = camera.position.addScaledVector(camera.view, depth);
  const visible = visibleAt(fov, depth, aspect);
  return {
    position: [position.x, position.y, position.z] as [number, number, number],
    rotation: [Math.atan2(camera.view.y, -camera.view.z), 0, 0] as [number, number, number],
    width: visible.width,
    height: visible.height,
  };
};

/** The same pose, picked up off the felt: how a card acknowledges the cursor. */
export const hoveredCardPose = (pose: Pose): Pose => ({
  position: [pose.position[0], pose.position[1] + TABLE.hoverLift, pose.position[2]],
  rotation: [pose.rotation[0] + radians(TABLE.hoverTilt), pose.rotation[1], pose.rotation[2]],
  scale: pose.scale * TABLE.hoverScale,
});

/** A deck lifts as a block, without tilting — it is a stack of cards, not one card. */
export const hoveredDeckPose = (pose: Pose): Pose => ({
  ...pose,
  position: [pose.position[0], pose.position[1] + TABLE.deckHoverLift, pose.position[2]],
});

//
// Framing. Half-extents of what has to stay on screen, around the table's centre. The camera keeps
// its angle and backs off until that box fits, which is what lets every number above move freely.
// The depth extent is used as a screen height, which over-reserves by exactly the foreshortening —
// the safe direction. Each view is framed on its own, so browsing decks does not have to leave room
// for a grid that is not dealt: `FitCamera` damps between the two distances, and the pull-back is
// itself part of opening a deck.
//
const fitHalfExtents = (view: TableView, deckCount: number) => {
  const margin = CARD_WIDTH * TABLE.fitMargin;
  if (view === 'decks') {
    const gap = deckGap();
    const columns = Math.min(TABLE.deckColumns, Math.max(1, deckCount));
    const rows = Math.ceil(Math.max(1, deckCount) / columns);
    return {
      width: ((columns - 1) / 2) * gap.x + (CARD_WIDTH / 2) * TABLE.deckScale + margin,
      // The label sits in front of its deck, in DOM, outside the 3D box — leave it room.
      height: ((rows - 1) / 2) * gap.z + CARD_HEIGHT * 0.9 + margin,
    };
  }
  const gap = gridGap();
  return {
    width:
      Math.max(
        ((TABLE.gridColumns - 1) / 2) * gap.x + (CARD_WIDTH / 2) * TABLE.cardScale,
        -pileX(),
      ) + margin,
    height: ((TABLE.gridRows - 1) / 2) * gap.z + (CARD_HEIGHT / 2) * TABLE.cardScale + margin,
  };
};

/** Which layout the table is showing: decks to browse, or one deck dealt into a grid. */
export type TableView = 'decks' | 'grid';

/** How far back the camera has to sit for `view` to fit a viewport of this aspect ratio. */
export const cameraDistance = (aspect: number, view: TableView, deckCount: number): number => {
  const fit = fitHalfExtents(view, deckCount);
  const halfFov = Math.tan(radians(TABLE.fov) / 2);
  return Math.max(fit.width / (halfFov * aspect), fit.height / halfFov);
};
