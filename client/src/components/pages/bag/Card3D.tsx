'use client';

import { useCursor } from '@react-three/drei';
import { type ReactNode, useState } from 'react';
import { AlwaysDepth, LessEqualDepth, type Texture } from 'three';
import { faceDownPose, hoveredCardPose } from '@/components/pages/bag/table-layout';
import { useCardArt } from '@/hooks/use-card-art';
import { usePoseAnimation } from '@/hooks/use-pose-animation';
import { CARD_ART_TINT, CARD_FACE, CARD_GEOMETRY, CARD_PAPER_COLOR } from '@/lib/card-geometry';
import type { Pose } from '@/lib/card-pose';

//
// One card on the table: the shared procedural mesh, its own front texture, and the damped
// travel to whatever pose the layout currently asks for.
//
// The card owns one thing itself — whether the cursor is on it. Everything else (where it goes,
// which way up, whether it is picked) is a prop, so the table stays the single place the view is
// decided. Its art loads on its own and appears on the blank stock when it lands; the card is not
// held back waiting for it, because browsing a collection means reading twenty cards at once.
//
// `children` are rendered inside the card's group, i.e. in the card's own space: a `<Html>` there
// travels, tilts and scales with the card, which is how DOM ends up printed on a moving mesh.
//

/** Where the card in hand sits in the transparent pass: after the zoom dimmer, which is at 0. */
const IN_HAND_RENDER_ORDER = 10;

export function Card3D({
  frontUrl,
  back,
  background = CARD_PAPER_COLOR,
  pose,
  initial,
  delay = 0,
  faceDown = false,
  inHand = false,
  hoverable = true,
  onClick,
  children,
}: {
  /** Where the front art comes from — `tokenImageUrl()` for a token. Absent means a blank card. */
  frontUrl?: string;
  /** The shared card back texture. Every card on the table uses the same one. */
  back?: Texture;
  /**
   * The card's stock: the collection's own `background_color`, defaulting to cream paper. It is
   * both the blank face before the art lands *and* the colour the art is letterboxed onto once it
   * has, so the two agree and a card does not flash cream then turn dark. The rim is deliberately
   * left as paper — art is printed on stock, and the edge is where the stock shows.
   */
  background?: string;
  /** Target pose, art up. */
  pose: Pose;
  /** Pose to mount at — the top of the pile, so the card enters by being dealt. */
  initial?: Pose;
  /** Seconds before this card starts moving; a per-card stagger is what deals a hand. */
  delay?: number;
  /**
   * Turn the card over in place: same slot, back up. Browsing deals art up, so this is off — it is
   * here for the game, where a hand is dealt face down and cards are turned over one at a time (and
   * for a reveal on load, `faceDown={!loaded}`). Flipping it animates the turn, because the pose it
   * selects differs from the current one by the tilt alone.
   */
  faceDown?: boolean;
  /**
   * The card the player is holding: drawn **over the zoom dimmer** rather than depth-tested against
   * it, so it is lit the same on the felt, in the air and at the camera.
   *
   * The dimmer is a black plane between the hand and the table (`ZoomBackdrop`), and it darkens
   * whatever is behind it — including this card while it is still travelling in. The plane travels
   * with the card for that reason, but it cannot be behind *two* cards at once, which is exactly
   * what stepping along the row asks of it: one card is at the camera and the next is still on the
   * felt, on the far side of the plane. So the card in hand is simply **drawn last, over everything**,
   * and that takes all three of these together:
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
  hoverable?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const art = useCardArt(frontUrl, { background });
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && Boolean(onClick));

  const resting = faceDown ? faceDownPose(pose) : pose;
  const target = hovered && hoverable ? hoveredCardPose(resting) : resting;
  const group = usePoseAnimation(target, { initial, delay, lift: true });

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a <group> is a three.js object, not a DOM element — the accessible control for a card is in the page chrome
    <group
      ref={group}
      onPointerOver={event => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={
        onClick &&
        (event => {
          event.stopPropagation();
          onClick();
        })
      }
    >
      {/*
        Cards cast onto the felt but do not receive: they sit nearly coplanar with each other, and
        self-shadowing at that angle is all acne and no shadow.
        Each face is its own material slot — see CARD_FACE in lib/card-geometry.ts. The `key`
        remounts a face's material when its texture arrives, which is cheaper to reason about
        than mutating `map` and remembering `needsUpdate` — and it carries `inHand` for the same
        reason: `transparent` is part of three's program cache key, and it does not re-evaluate that
        key on a plain assignment.
      */}
      <mesh geometry={CARD_GEOMETRY} castShadow renderOrder={inHand ? IN_HAND_RENDER_ORDER : 0}>
        <meshStandardMaterial
          key={`${art ? 'art' : 'blank'}-${inHand}`}
          attach={`material-${CARD_FACE.front}`}
          map={art}
          color={art ? CARD_ART_TINT : background}
          roughness={0.62}
          metalness={0.05}
          transparent={inHand}
          depthFunc={inHand ? AlwaysDepth : LessEqualDepth}
        />
        <meshStandardMaterial
          key={`${back ? 'back' : 'blank'}-${inHand}`}
          attach={`material-${CARD_FACE.back}`}
          map={back}
          color={back ? CARD_ART_TINT : CARD_PAPER_COLOR}
          roughness={0.62}
          metalness={0.05}
          transparent={inHand}
          depthFunc={inHand ? AlwaysDepth : LessEqualDepth}
        />
        <meshStandardMaterial
          key={`edge-${inHand}`}
          attach={`material-${CARD_FACE.edge}`}
          color={CARD_PAPER_COLOR}
          roughness={0.95}
          transparent={inHand}
          depthFunc={inHand ? AlwaysDepth : LessEqualDepth}
        />
      </mesh>
      {children}
    </group>
  );
}
