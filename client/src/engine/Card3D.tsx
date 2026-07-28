'use client';

import { useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { type ReactNode, useState } from 'react';
import { AlwaysDepth, LessEqualDepth, type Texture } from 'three';
import { CARD_ART_HEIGHT } from '@/engine/card-art';
import {
  CARD_ART_TINT,
  CARD_ASPECT,
  CARD_EDGE_COLOR,
  CARD_FACE,
  CARD_PAPER_COLOR,
  cardGeometry,
} from '@/engine/card-geometry';
import { faceDownPose, type Pose } from '@/engine/card-pose';
import { useCardArtState } from '@/engine/use-card-art';
import { GRAB_LAMBDA, usePoseAnimation } from '@/engine/use-pose-animation';

//
// One card on a table: the shared procedural mesh, its own front texture, and the damped travel to
// whatever pose the layout currently asks for.
//
// The card owns one thing itself — whether the cursor is on it. Everything else (where it goes, which
// way up, whether it is picked, whether it is being carried) is a prop, so the table stays the single
// place the view is decided. Its art loads on its own and appears on the blank stock when it lands;
// the card is not held back waiting for it, because browsing a collection means reading twenty cards
// at once and dealing a game means putting fifty-two down at speed.
//
// `children` are rendered inside the card's group, i.e. in the card's own space: a `<Html>` there
// travels, tilts and scales with the card, which is how DOM ends up printed on a moving mesh.
//

/** Where a card in the player's hand sits in the transparent pass: after any dimmer, which is at 0. */
const IN_HAND_RENDER_ORDER = 10;

export function Card3D({
  frontUrl,
  back,
  background = CARD_PAPER_COLOR,
  aspect = CARD_ASPECT,
  height = CARD_ART_HEIGHT,
  pixelated = false,
  pin = false,
  pose,
  initial,
  delay = 0,
  faceDown = false,
  revealOnLoad = false,
  inHand = false,
  grabbed = false,
  depth = 0,
  hoverable = true,
  hoverPose,
  hovered = false,
  onHover,
  onClick,
  onDoubleClick,
  onPointerDown,
  children,
}: {
  /** Where the front art comes from — `tokenImageUrl()` or `faceUrl()`. Absent means a blank card. */
  frontUrl?: string;
  /** The card back texture. Every card in one deck uses the same one. */
  back?: Texture;
  /**
   * The card's stock: the collection's own `background_color`, defaulting to cream paper. It is
   * both the blank face before the art lands *and* the colour the art is letterboxed onto once it
   * has, so the two agree and a card does not flash cream then turn dark. The rim is deliberately
   * left as paper — art is printed on stock, and the edge is where the stock shows.
   */
  background?: string;
  /** The card's shape. Must be the aspect its art was rasterized at, or the art is stretched. */
  aspect?: number;
  /**
   * Texels down the front art — the table's VRAM budget, because how big a card is ever drawn is the
   * table's business. `CARD_ART_HEIGHT` (a card brought to the camera) or `DECK_ART_HEIGHT` (a card
   * that stays on the felt); see `card-art.ts`.
   */
  height?: number;
  /** Magnify the front art with hard pixels — for a source drawn at its own pixel grid. */
  pixelated?: boolean;
  /** Never evict this card's art. For a small static deck that is all on the table at once. */
  pin?: boolean;
  /** Target pose, art up. */
  pose: Pose;
  /** Pose to mount at — the top of the pile, so the card enters by being dealt. */
  initial?: Pose;
  /** Seconds before this card starts moving; a per-card stagger is what deals a hand. */
  delay?: number;
  /**
   * Turn the card over in place: same slot, back up. Flipping it animates the turn, because the pose
   * it selects differs from the current one by the tilt alone — which is what lets a game keep
   * `faceUp` in its state and pay nothing to animate it.
   */
  faceDown?: boolean;
  /**
   * Keep the card face down until its own art has landed, then turn it over.
   *
   * For a table that deals art the player is meant to *read* — a page of a collection arrives one
   * texture at a time over a slow endpoint, and twenty blank faces waiting to be filled in read as a
   * broken table, where twenty backs read as a deal. The turn is free: it is the same one-number
   * sweep `faceDown` animates, so each card flips itself the moment its face exists.
   *
   * A card that is never getting art (no `frontUrl`, or a token the indexer 404s) counts as landed
   * and turns over onto its blank stock — the alternative is a card stuck face down forever.
   * Orthogonal to `faceDown`, which always wins: a game's own face-down card stays down.
   */
  revealOnLoad?: boolean;
  /**
   * The card the player is holding: drawn **over any dimmer** rather than depth-tested against
   * it, so it is lit the same on the felt, in the air and at the camera.
   *
   * On `/decks` the dimmer is a black plane between the hand and the table (`ZoomBackdrop`), and it
   * darkens whatever is behind it — including this card while it is still travelling in. The plane
   * travels with the card for that reason, but it cannot be behind *two* cards at once, which is
   * exactly what stepping along the row asks of it: one card is at the camera and the next is still on
   * the felt, on the far side of the plane. So the card in hand is simply **drawn last, over
   * everything**, and that takes all three of these together:
   *
   * - `transparent`, at full opacity — not for blending, but for the bucket. Three renders every
   *   opaque object before any transparent one, and the dimmer is transparent, so an opaque card can
   *   never be ordered after it however high its `renderOrder`.
   * - `renderOrder`, to come after the dimmer *within* that pass.
   * - `depthFunc: Always`, so the buffer cannot reject it on the way past. Note this is **not**
   *   `depthTest: false`: GL disables depth *writes* along with the test, and a card that writes no
   *   depth is painted over by the dimmer at every size and by its own shadow on the felt.
   *
   * Depth writes alone were never enough, which is the trap here: the dimmer sits *nearer* the camera
   * than a card still travelling in, and writing depth only occludes what is behind you.
   *
   * Its own back and rim cannot paint over its face once it ignores depth: they face away and are
   * culled, and the rim that does face the camera is the outer wall, clear of the art.
   */
  inHand?: boolean;
  /**
   * This card is under the pointer, being dragged. Pulls it toward its target at `GRAB_LAMBDA` so it
   * tracks the cursor instead of trailing behind it, and drops the travel arc — a carried card is
   * already off the table and lifting it again would make it swim.
   */
  grabbed?: boolean;
  /**
   * Draw order *within* a carried run, added to `IN_HAND_RENDER_ORDER`.
   *
   * `inHand` defeats the depth buffer, so depth cannot sort a run of overlapping cards against
   * itself — without this a dragged three-card sequence stacks in whatever order three happens to
   * submit it, and the fan looks inverted. Pass the card's index in the run.
   */
  depth?: number;
  hoverable?: boolean;
  /**
   * How the card acknowledges the cursor, as a pose transform — lift, tilt and scale live in the
   * page's layout because they are numbers set by eye. Omitted, hover changes nothing but the cursor.
   */
  hoverPose?: (pose: Pose) => Pose;
  /**
   * Take the hover pose without the pointer being on this card — for a card that has to rise
   * *with* another one. A card is hovered if the cursor is on it **or** this says so, so a table
   * can lift a whole run while the engine still knows nothing about runs: hovering the middle of a
   * fanned column otherwise lifts one card through the cards resting on top of it, because the fan
   * offsets a neighbour by far more than a card's thickness.
   */
  hovered?: boolean;
  /** Told when the pointer arrives on or leaves this card — the other half of `hovered`. */
  onHover?: (hovered: boolean) => void;
  onClick?: () => void;
  onDoubleClick?: () => void;
  /** Raw pointer-down, for starting a drag. Gets the event, because a drag needs the ray. */
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  children?: ReactNode;
}) {
  const { art, settled } = useCardArtState(frontUrl, {
    background,
    aspect,
    height,
    pixelated,
    pin,
  });
  // Whether the cursor is on *this* card, which is all the card decides for itself. `hovered` is the
  // table's answer to the same question, and either one lifts it.
  const [pointerOn, setPointerOn] = useState(false);
  const interactive = Boolean(onClick || onDoubleClick || onPointerDown);
  // The cursor is the pointer's own business: a card lifted by a neighbour is not under it.
  useCursor(pointerOn && interactive);

  const down = faceDown || (revealOnLoad && !settled);
  const resting = down ? faceDownPose(pose) : pose;
  const lifted = (pointerOn || hovered) && hoverable && !grabbed;
  const target = lifted && hoverPose ? hoverPose(resting) : resting;
  const group = usePoseAnimation(target, {
    initial,
    delay,
    // The turn hop needs the card's shape: turning over sideways it hangs below its centre by half its
    // *width*, end over end by half its height.
    aspect,
    // A carried card sets its own height from the drag plane, so the arc would fight it.
    lift: !grabbed,
    moveLambda: grabbed ? GRAB_LAMBDA : undefined,
  });

  const raised = inHand || grabbed;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a <group> is a three.js object, not a DOM element — the accessible control for a card is in the page chrome
    <group
      ref={group}
      onPointerOver={event => {
        event.stopPropagation();
        setPointerOn(true);
        onHover?.(true);
      }}
      onPointerOut={() => {
        setPointerOn(false);
        onHover?.(false);
      }}
      onPointerDown={
        onPointerDown &&
        (event => {
          event.stopPropagation();
          onPointerDown(event);
        })
      }
      onClick={
        onClick &&
        (event => {
          event.stopPropagation();
          onClick();
        })
      }
      onDoubleClick={
        onDoubleClick &&
        (event => {
          event.stopPropagation();
          onDoubleClick();
        })
      }
    >
      {/*
        Cards cast onto the felt but do not receive: they sit nearly coplanar with each other, and
        self-shadowing at that angle is all acne and no shadow.
        Each face is its own material slot — see CARD_FACE in card-geometry.ts. The `key`
        remounts a face's material when its texture arrives, which is cheaper to reason about
        than mutating `map` and remembering `needsUpdate` — and it carries `raised` for the same
        reason: `transparent` is part of three's program cache key, and it does not re-evaluate that
        key on a plain assignment.

        Each key is **prefixed with its own face**, because these three are siblings: a card with
        neither texture yet gave the front and the back the same `blank-false` and React warned about
        a duplicate key on every card of a freshly loaded board.
      */}
      <mesh
        geometry={cardGeometry(aspect)}
        castShadow
        renderOrder={raised ? IN_HAND_RENDER_ORDER + depth : 0}
      >
        <meshStandardMaterial
          key={`front-${art ? 'art' : 'blank'}-${raised}`}
          attach={`material-${CARD_FACE.front}`}
          map={art}
          color={art ? CARD_ART_TINT : background}
          roughness={0.62}
          metalness={0.05}
          transparent={raised}
          depthFunc={raised ? AlwaysDepth : LessEqualDepth}
        />
        <meshStandardMaterial
          key={`back-${back ? 'art' : 'blank'}-${raised}`}
          attach={`material-${CARD_FACE.back}`}
          map={back}
          color={back ? CARD_ART_TINT : CARD_PAPER_COLOR}
          roughness={0.62}
          metalness={0.05}
          transparent={raised}
          depthFunc={raised ? AlwaysDepth : LessEqualDepth}
        />
        <meshStandardMaterial
          key={`edge-${raised}`}
          attach={`material-${CARD_FACE.edge}`}
          color={CARD_EDGE_COLOR}
          roughness={0.95}
          transparent={raised}
          depthFunc={raised ? AlwaysDepth : LessEqualDepth}
        />
      </mesh>
      {children}
    </group>
  );
}
