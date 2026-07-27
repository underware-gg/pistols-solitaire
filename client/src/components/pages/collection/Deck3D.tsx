'use client';

import { Html, useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { type ReactNode, useMemo, useState } from 'react';
import type * as THREE from 'three';
import { deckCardPose, hoveredDeckPose, TABLE } from '@/components/pages/collection/table-layout';
import { usePoseAnimation } from '@/hooks/use-pose-animation';
import {
  CARD_ART_TINT,
  CARD_FACE,
  CARD_GEOMETRY,
  CARD_HEIGHT,
  CARD_PAPER_COLOR,
  CARD_THICKNESS,
  CARD_WIDTH,
} from '@/lib/card-geometry';
import { cardPlaceholderTexture } from '@/lib/card-placeholder';
import { FACE_UP, type Pose } from '@/lib/card-pose';
import { cn } from '@/lib/cn';

//
// A collection as a deck on the table: a face-down stack, a label, and a hit target the size of
// the whole thing. The stack is nine cards however many the collection holds — a deck reads as a
// deck at three cards and at nine, and never at five hundred.
//
// A deck with nothing left in it — a collection nobody owns, or an open deck whose last page is
// out on the felt — draws the **empty slot** instead: a dashed card-shaped outline, so the table
// says "cards belong here" rather than showing a stack that has no cards behind it. `remaining` is
// what decides, and it is the pile's business alone: `count` stays the collection's real size, so
// an open deck still labels itself with everything it holds.
//
// **The slot never animates: it is part of the table.** A marking on the felt saying where cards
// go does not slide across it, lift under the cursor, or fly in from the distance — so the slot is
// a plainly *placed* group and only the stack (`DeckStack`) gets the damped one. They are never on
// screen together, and the split is also what keeps a stack that comes back — paging back onto a
// pile — from flying in from the table's centre: it mounts fresh, and `usePoseAnimation` places an
// object the frame it mounts.
//
// The label is the DOM half of the answer to "cards with HTML over them": `<Html>` from drei
// projects a 3D anchor to screen coordinates and positions an ordinary div there, so the text is
// real DOM — Tailwind classes, selectable, crisp at any zoom — that happens to sit over a mesh.
// Not `transform`: a deck label wants to stay flat and legible, not lie down on the felt with the
// cards. (The zoomed card's caption in `CardTable` is the `transform` case.)
//

/** How solid the empty slot's dashes are — a hair off white, so it sits under the cards, not over. */
const SLOT_OPACITY = 0.9;

/**
 * The slot's size as a fraction of a card. Under 1 so that a card in that place **covers it
 * completely** — at exactly 1 the outline is the card's own outline and its dashes graze the edge,
 * which reads as a halo around the card rather than as an empty space behind it.
 */
const SLOT_SCALE = 0.95;

/** How far off the felt the slot lies: as close as the shadow catcher allows, i.e. under everything. */
const SLOT_HEIGHT = CARD_THICKNESS * 0.25;

/** The deck's hit handlers, shared by whichever of the two groups is on the table. */
type DeckPointer = {
  onPointerOver: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
};

export function Deck3D({
  label,
  count,
  remaining = count,
  back,
  pose,
  visible = true,
  onSelect,
}: {
  label: string;
  /** How many cards the collection really holds — the label's number. */
  count: number;
  /** How many are still in the pile: 0 draws the empty slot. Defaults to the whole collection. */
  remaining?: number;
  back?: THREE.Texture;
  pose: Pose;
  /** Decks swept off the table keep animating but drop their label and stop taking clicks. */
  visible?: boolean;
  /**
   * What a click on this deck does, or nothing if it does nothing — a collection with no cards in
   * it is inert, an emptied pile puts its deck back. That is the table's call, not the deck's, so
   * the presence of this is the whole test: no handler, no cursor and no lift either.
   */
  onSelect?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const selectable = Boolean(onSelect) && visible;
  useCursor(hovered && selectable);

  const cards = Math.min(TABLE.deckStack, remaining);

  const pointer: DeckPointer = {
    onPointerOver: event => {
      event.stopPropagation();
      setHovered(true);
    },
    onPointerOut: () => setHovered(false),
    onClick: selectable
      ? event => {
          event.stopPropagation();
          onSelect?.();
        }
      : undefined,
  };

  const caption = visible ? (
    <Html center position={[0, 0, CARD_HEIGHT * 0.66]} className="pointer-events-none">
      <div
        className={cn(
          'small-caps whitespace-nowrap text-center font-title leading-tight transition-colors',
          hovered && selectable ? 'text-ps-accent' : 'text-ps-bold',
        )}
      >
        <div className="text-lg">{label}</div>
        <div className="font-mono text-xs opacity-70">{count || 'empty'}</div>
      </div>
    </Html>
  ) : null;

  //
  // Nothing left in the pile: the felt's own marking, placed and left alone. Hover still lights the
  // label — that is colour, not movement — but the slot itself does not budge. A swept deck leaves
  // no marking behind: the deck is off the table, and so is the space its cards go back to.
  //
  if (cards === 0) {
    if (!visible) return null;
    return (
      <group position={pose.position} rotation={pose.rotation} scale={pose.scale} {...pointer}>
        <EmptySlot />
        {caption}
      </group>
    );
  }

  return (
    <DeckStack
      cards={cards}
      back={back}
      pose={hovered && selectable ? hoveredDeckPose(pose) : pose}
      pointer={pointer}
    >
      {caption}
    </DeckStack>
  );
}

/**
 * The face-down stack, and the only part of a deck that travels: **one** damped group for the whole
 * pile, so a deck of nine costs what a deck of one costs and the cards inside it stay a static
 * local stack (`deckCardPose`). The pose it is handed already carries the hover lift.
 */
function DeckStack({
  cards,
  back,
  pose,
  pointer,
  children,
}: {
  cards: number;
  back?: THREE.Texture;
  pose: Pose;
  pointer: DeckPointer;
  children?: ReactNode;
}) {
  const group = usePoseAnimation(pose);

  // A `<group>` is a three.js object, not a DOM element, and the accessible control for a deck is
  // the page chrome — the a11y lint that used to be suppressed here no longer sees these handlers,
  // which arrive as a spread.
  return (
    <group ref={group} {...pointer}>
      {Array.from({ length: cards }, (_, index) => {
        const card = deckCardPose(index);
        return (
          <mesh
            key={index}
            geometry={CARD_GEOMETRY}
            position={card.position}
            rotation={card.rotation}
            castShadow
          >
            {/* Only the back is ever seen, but a deck of one-sided cards looks wrong edge-on. */}
            <meshStandardMaterial
              key={back ? 'back' : 'blank'}
              attach={`material-${CARD_FACE.back}`}
              map={back}
              color={back ? CARD_ART_TINT : CARD_PAPER_COLOR}
              roughness={0.62}
              metalness={0.05}
            />
            <meshStandardMaterial
              attach={`material-${CARD_FACE.front}`}
              color={CARD_PAPER_COLOR}
              roughness={0.9}
            />
            <meshStandardMaterial
              attach={`material-${CARD_FACE.edge}`}
              color={CARD_PAPER_COLOR}
              roughness={0.95}
            />
          </mesh>
        );
      })}

      {children}
    </group>
  );
}

/**
 * The dashed outline a deck leaves on the felt when its cards are elsewhere: one plane, lying face
 * up just clear of the shadow catcher, unlit (an outline is not printed on paper) and not writing
 * depth. Slightly smaller than a card and as low as the table allows, so **any card in that place
 * hides it** — the slot is only ever seen when there is nothing there.
 */
function EmptySlot() {
  const texture = useMemo(cardPlaceholderTexture, []);
  return (
    <mesh position={[0, SLOT_HEIGHT, 0]} rotation={[FACE_UP, 0, 0]}>
      <planeGeometry args={[CARD_WIDTH * SLOT_SCALE, CARD_HEIGHT * SLOT_SCALE]} />
      <meshBasicMaterial map={texture} transparent opacity={SLOT_OPACITY} depthWrite={false} />
    </mesh>
  );
}
