'use client';

import { useCursor } from '@react-three/drei';
import { type ReactNode, useState } from 'react';
import type * as THREE from 'three';
import { faceDownPose, hoveredCardPose } from '@/components/pages/collection/table-layout';
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

export function Card3D({
  frontUrl,
  back,
  background = CARD_PAPER_COLOR,
  pose,
  initial,
  delay = 0,
  faceDown = false,
  hoverable = true,
  onClick,
  children,
}: {
  /** Where the front art comes from — `tokenImageUrl()` for a token. Absent means a blank card. */
  frontUrl?: string;
  /** The shared card back texture. Every card on the table uses the same one. */
  back?: THREE.Texture;
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
        than mutating `map` and remembering `needsUpdate`.
      */}
      <mesh geometry={CARD_GEOMETRY} castShadow>
        <meshStandardMaterial
          key={art ? 'art' : 'blank'}
          attach={`material-${CARD_FACE.front}`}
          map={art}
          color={art ? CARD_ART_TINT : background}
          roughness={0.62}
          metalness={0.05}
        />
        <meshStandardMaterial
          key={back ? 'back' : 'blank'}
          attach={`material-${CARD_FACE.back}`}
          map={back}
          color={back ? CARD_ART_TINT : CARD_PAPER_COLOR}
          roughness={0.62}
          metalness={0.05}
        />
        <meshStandardMaterial
          attach={`material-${CARD_FACE.edge}`}
          color={CARD_PAPER_COLOR}
          roughness={0.95}
        />
      </mesh>
      {children}
    </group>
  );
}
