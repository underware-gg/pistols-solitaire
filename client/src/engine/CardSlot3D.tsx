'use client';

import { useMemo } from 'react';
import { CARD_ASPECT, CARD_THICKNESS, cardHeight, cardWidth } from '@/engine/card-geometry';
import { FACE_UP } from '@/engine/card-pose';
import { cardSlotTexture } from '@/engine/card-slot';

//
// The dashed outline that marks a place on the felt where a card belongs: an empty deck, a pile
// dealt out onto the table, a tableau column waiting for a King.
//
// One plane, lying face up just clear of the shadow catcher, unlit (an outline is not printed on
// paper) and not writing depth. It is **part of the table, not a card** — a marking saying where
// cards go does not slide, lift or animate, so this is always plainly placed by its parent and never
// given a damped pose.
//

/** How solid the dashes are — a hair off white, so the slot sits under the cards, not over. */
const SLOT_OPACITY = 0.9;

/**
 * The slot's size as a fraction of a card. Under 1 so that a card in that place **covers it
 * completely** — at exactly 1 the outline is the card's own outline and its dashes graze the edge,
 * which reads as a halo around the card rather than as an empty space behind it.
 */
const SLOT_SCALE = 0.95;

/** How far off the felt it lies: as close as the shadow catcher allows, i.e. under everything. */
const SLOT_HEIGHT = CARD_THICKNESS * 0.25;

export function CardSlot3D({ aspect = CARD_ASPECT }: { aspect?: number }) {
  const texture = useMemo(() => cardSlotTexture(aspect), [aspect]);
  return (
    <mesh position={[0, SLOT_HEIGHT, 0]} rotation={[FACE_UP, 0, 0]}>
      <planeGeometry args={[cardWidth(aspect) * SLOT_SCALE, cardHeight(aspect) * SLOT_SCALE]} />
      <meshBasicMaterial map={texture} transparent opacity={SLOT_OPACITY} depthWrite={false} />
    </mesh>
  );
}
