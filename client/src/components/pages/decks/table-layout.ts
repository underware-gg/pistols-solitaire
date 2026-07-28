import * as THREE from 'three';
import { cameraAt as cameraAtDistance, fitDistance, visibleAt as visibleFrustum } from '@/engine';
import { CARD_HEIGHT, CARD_THICKNESS, CARD_WIDTH } from '@/engine/card-geometry';
import { FACE_DOWN, FACE_UP, type Pose } from '@/engine/card-pose';

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
 * The table's dimensions and its lighting, all of them, in one editable block. Every function in
 * this file reads it at call time, so changing a number here (or from the console, in dev) is the
 * whole edit; the lighting block is read straight by `CardTable`, which is the only consumer with
 * no function in between.
 *
 * Distances are in cards, angles are in **degrees**, and nothing is in pixels.
 *
 * **To fit more cards on the felt**: raise `gridColumnsMax` / `gridRows`, then take the gaps down
 * toward 1 (edge to edge) and `cardScale` down from 1. The camera re-frames itself either way, so
 * more cards means smaller cards — the two knobs differ in *how* they get smaller: the grid counts
 * pack more cards into the same felt, while `cardScale` shrinks the cards and leaves the felt
 * showing between them.
 */
export const TABLE = {
  //--------------------------------
  // the dealt grid
  //
  /**
   * How many cards wide the deal is, as a **range**: `gridColumnsFor` picks a count in it from the
   * shape of the viewport, and `columns * gridRows` is the page size that follows. Narrowing the
   * window drops a column at a time — the cards stay the size the height allows and the page holds
   * fewer of them, which reads far better than the same twenty-four cards shrinking. Only once the
   * deal is down to `gridColumnsMin` does the camera start backing off.
   */
  gridColumnsMax: 8,
  gridColumnsMin: 2,
  gridRows: 4,
  /** Card-to-card spacing, in cards: 1 is edge to edge, 1.14 leaves a seventh of a card of felt. */
  gridGapX: 1.2,
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
  direction: [0, 6.2, 1.0] as [number, number, number],
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
  // the lighting
  //
  // Positions are directions as much as places — a directional light shines from where it is put
  // toward the origin, so what these set is the angle the felt is lit from, not a distance.
  //
  /** Flat light over everything: most of what makes a card's art readable. */
  lightAmbient: 0.85,
  /** The key, high and to the right — angled enough that a card turning over catches it. */
  lightKeyPosition: [0, 7, 3.0] as [number, number, number],
  lightKeyIntensity: 1.5,
  /** Fill from the player's side, so a card held up to the camera is not lit only from behind. */
  lightFillPosition: [-1, 3, 7] as [number, number, number],
  lightFillIntensity: 0.45,

  //--------------------------------
  // the shadows
  //
  /** Half-width of the key light's shadow box, in cards: anything outside it casts nothing. */
  shadowExtent: 6,
  shadowNear: 0.5,
  shadowFar: 30,
  shadowMapSize: 1024,
  /** Nudges the shadow off its caster. Cards lie nearly on the felt, so without it they self-shadow. */
  shadowBias: -0.0006,
  /** How dark the felt goes under a card — the shadow catcher's own opacity. */
  shadowOpacity: 0.32,

  //--------------------------------
  // hover
  //
  /** How far a hovered card comes off the felt, in cards. */
  hoverLift: 0.12,
  /** Degrees a hovered card turns toward the player as it lifts. */
  hoverTilt: 10,
  hoverScale: 1.05,
  deckHoverLift: 0.06,
};

/** How far the swept decks slide into the distance. They pass under the dealt grid on the way. */
const SWEEP_Z = -14;

/** Cards dealt per page — the slice of a deck that is on the table at once. */
export const gridPageSize = (columns: number): number => columns * TABLE.gridRows;

const gridGap = () => ({ x: CARD_WIDTH * TABLE.gridGapX, z: CARD_HEIGHT * TABLE.gridGapZ });
const deckGap = () => ({ x: CARD_WIDTH * TABLE.deckGapX, z: CARD_HEIGHT * TABLE.deckGapZ });

/** Where the open deck waits while its cards are dealt: clear of the grid, out to the left. */
const pileBaseX = (columns: number) => -(((columns - 1) / 2) * gridGap().x + CARD_WIDTH * 1.2);
const pileZ = () => gridGap().z * 0.6;

/**
 * How far the dealt view reaches either side of the table's centre — **the deck's outer edge, not
 * its centre**. A deck is a card wide, and leaving that half card out is what let the pile sit on
 * the viewport edge with no felt around it.
 */
const gridReach = (columns: number) => ({
  left: -pileBaseX(columns) + (CARD_WIDTH / 2) * TABLE.deckScale,
  right: ((columns - 1) / 2) * gridGap().x + (CARD_WIDTH / 2) * TABLE.cardScale,
});

/**
 * How far the whole dealt view is nudged right, so that it is *centred* in the viewport.
 *
 * The deal is not symmetric — the grid is centred on the table but the pile is parked off its left
 * edge, so the layout reaches further left than right. `FitCamera` aims at the table's centre, so
 * framing that box means backing off until its *widest* side fits and padding the other with the
 * difference: a deck's width of felt on the right and none at all on the left. Sliding the grid and
 * the pile together by half the overhang puts the content's own centre on the table's centre, and
 * the margins come out equal.
 *
 * Only the dealt view moves. The browsing layout of decks is symmetric already, so `deckPose` and
 * `deckTopPose` — where a closing deck goes home to — are deliberately left alone.
 */
const gridShiftX = (columns: number) => {
  const reach = gridReach(columns);
  return (reach.left - reach.right) / 2;
};

const pileX = (columns: number) => pileBaseX(columns) + gridShiftX(columns);

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
export const deckParkedPose = (columns: number): Pose => ({
  position: [pileX(columns), 0, pileZ()],
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
export const pilePose = (columns: number): Pose => ({
  position: [pileX(columns), stackY(TABLE.deckStack), pileZ()],
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
export const gridPose = (index: number, columns: number): Pose => {
  const gap = gridGap();
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    position: [
      (column - (columns - 1) / 2) * gap.x + gridShiftX(columns),
      // Leaning on its own centre digs a card's bottom edge into the felt; this lifts it back out.
      (CARD_HEIGHT / 2) * TABLE.cardScale * Math.sin(radians(TABLE.gridTilt)) + CARD_THICKNESS,
      (row - (TABLE.gridRows - 1) / 2) * gap.z,
    ],
    rotation: [FACE_UP + radians(TABLE.gridTilt), 0, 0],
    scale: TABLE.cardScale,
  };
};

/**
 * Where the camera is when it has finished framing `view`, and which way it looks: along
 * `TABLE.direction`, at `cameraDistance`, aimed at the table's centre. Poses in front of the camera
 * are derived from *this* rather than from the live camera, so they are already correct while the
 * camera is still damping between two views.
 */
const cameraAt = (distance: number) => cameraAtDistance(distance, TABLE.direction);

/**
 * Which way is up on screen, in world space: world up with its component along the view removed.
 * The camera looks down at the table, so "up on screen" is mostly *away* — nudging a zoomed card up
 * in the frame means moving it into the distance, not lifting it.
 */
const screenUp = (view: THREE.Vector3) =>
  new THREE.Vector3(0, 1, 0).addScaledVector(view, -view.y).normalize();

/** How much of the frame a zoomed card takes: not the card, the card and the caption hanging off it. */
const visibleAt = visibleFrustum;

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

/** How far in front of the camera a point on the table sits, measured along the view. */
const cameraDepth = (distance: number, point: [number, number, number]) => {
  const camera = cameraAt(distance);
  return new THREE.Vector3(...point).sub(camera.position).dot(camera.view);
};

/**
 * How far in front of the camera the dimmer belongs — **and it moves**, which is the whole reason
 * this is a function of `active` rather than a constant.
 *
 * The dimmer is opaque-ish black with a depth test, so anything *behind* it is drawn through it. Sat
 * at the zoomed card's final depth it would therefore darken the card for the whole flight in from
 * the felt and only let it up at the instant it crossed the plane — a card that dims on the way and
 * brightens on arrival. So the dimmer waits **behind the deepest dealt card** and travels forward
 * with the card it is dimming for, staying `zoomBackdropGap` behind it the whole way.
 *
 * That it *stays* behind is arithmetic, not luck: `ZoomBackdrop` damps this depth at the same rate
 * `usePoseAnimation` damps a card's position, and a card's depth is a linear function of that
 * position — so both sides are the same exponential and their difference decays from the head start
 * to the gap without ever changing sign. Damp the dimmer faster and it would overtake the card.
 */
export const zoomBackdropDepth = (active: boolean, distance: number, columns: number): number =>
  TABLE.zoomBackdropGap +
  // The back row of the grid: same depth for every card in it, and no dealt card is deeper.
  (active ? TABLE.zoomDistance : cameraDepth(distance, gridPose(0, columns).position));

/**
 * The dimmer that sits between a zoomed card and the rest of the table: a plane facing the camera
 * at `depth`, sized to fill the frustum there — so it covers the frame wherever it has got to.
 */
export const zoomBackdropPlane = (fov: number, distance: number, aspect: number, depth: number) => {
  const camera = cameraAt(distance);
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
const fitHalfExtents = (view: TableView, deckCount: number, columns: number) => {
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
  const reach = gridReach(columns);
  return {
    // Half the span from the deck's outer edge to the far side of the grid: `gridShiftX` has already
    // centred that span on the table, so the box is symmetric again and the felt splits evenly.
    width: (reach.left + reach.right) / 2 + margin,
    height: ((TABLE.gridRows - 1) / 2) * gap.z + (CARD_HEIGHT / 2) * TABLE.cardScale + margin,
  };
};

/** Which layout the table is showing: decks to browse, or one deck dealt into a grid. */
export type TableView = 'decks' | 'grid';

/**
 * How many cards wide to deal at this viewport shape: **the widest deal the height can still pay
 * for**, between `gridColumnsMax` and `gridColumnsMin`.
 *
 * Cards are at their biggest while the camera is held back by the layout's *height*, which no number
 * of columns changes — the moment the layout is too wide for the window instead, the camera backs
 * off and every card on the felt shrinks. So narrowing the window drops a column rather than the
 * card size, and only a window too narrow for `gridColumnsMin` starts costing size.
 *
 * A pure function of the aspect ratio, like everything else here — the caller measures, this decides.
 */
export const gridColumnsFor = (aspect: number): number => {
  // Before the first measurement there is no shape to answer for; the widest deal is the safe guess,
  // since nothing is dealt until the account's hand is known anyway.
  if (!(aspect > 0)) return TABLE.gridColumnsMax;
  for (let columns = TABLE.gridColumnsMax; columns > TABLE.gridColumnsMin; columns--) {
    const fit = fitHalfExtents('grid', 0, columns);
    if (fit.width / aspect <= fit.height) return columns;
  }
  return TABLE.gridColumnsMin;
};

/** How far back the camera has to sit for `view` to fit a viewport of this aspect ratio. */
export const cameraDistance = (
  aspect: number,
  view: TableView,
  deckCount: number,
  columns: number,
): number => fitDistance(fitHalfExtents(view, deckCount, columns), aspect, TABLE.fov);
