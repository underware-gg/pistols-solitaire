'use client';

import { Html, useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { type ReactNode, useState } from 'react';
import type * as THREE from 'three';
import { CardSlot3D } from '@/engine/CardSlot3D';
import {
  CARD_ART_TINT,
  CARD_ASPECT,
  CARD_EDGE_COLOR,
  CARD_FACE,
  CARD_HEIGHT,
  CARD_PAPER_COLOR,
  cardGeometry,
} from '@/engine/card-geometry';
import type { Pose } from '@/engine/card-pose';
import { HTML_Z_RANGE } from '@/engine/html-layer';
import { usePoseAnimation } from '@/engine/use-pose-animation';
import { cn } from '@/lib/cn';

//
// A stack of face-down cards on the table, with a label and a hit target the size of the whole
// thing — a collection to be picked, a pile to be dealt from.
//
// **A deck moves as a block**, so the *deck* takes the pose and the cards in it are a static local
// stack: one animated group per deck instead of one per card, so a deck of nine costs what a deck of
// one costs. How many cards it draws is the caller's call, because a deck reads as a deck at three
// cards and at nine and never at five hundred.
//
// A deck with nothing left in it draws the **empty slot** instead (`CardSlot3D`), so the table says
// "cards belong here" rather than showing a stack with no cards behind it. `cards` is what decides,
// and it is the pile's business alone — the label's own number is a separate prop, so an open deck can
// still say how much the collection holds while its stack is out on the felt.
//
// **The slot never animates: it is part of the table.** A marking on the felt saying where cards go
// does not slide across it, lift under the cursor, or fly in from the distance — so the slot is a
// plainly *placed* group and only the stack gets the damped one. They are never on screen together,
// and the split is also what keeps a stack that comes back — paging back onto a pile — from flying in
// from the table's centre: it mounts fresh, and `usePoseAnimation` places an object the frame it
// mounts.
//
// The label is the DOM half of the answer to "cards with HTML over them": `<Html>` from drei projects
// a 3D anchor to screen coordinates and positions an ordinary div there, so the text is real DOM —
// Tailwind classes, selectable, crisp at any zoom — that happens to sit over a mesh. Not `transform`:
// a deck label wants to stay flat and legible, not lie down on the felt with the cards.
//
// `notice` is the same mechanism aimed at the deck itself rather than in front of it — a mark the
// table wants *on* this deck, whose meaning the engine never learns. `action` is the third of them and
// the only one that is a *control*: a button the table hangs below the caption, which is what lets an
// offer about one deck stay attached to that deck instead of floating over the middle of the felt.
//

/** How far in front of the deck the label sits, in card heights. */
const LABEL_DROP = 0.66;
/**
 * How far in front of the deck the action hangs, in card heights — clear of the caption, which is two
 * lines centred on `LABEL_DROP`. The action hangs *downward* from its anchor rather than being centred
 * on it, so this is the gap above it and not its middle.
 *
 * What there is to spend is whatever felt the consuming layout leaves in front of its nearest deck —
 * `/decks` reserves ~1.3 card heights (`table-layout.ts`'s `fitHalfExtents`), and measured against a
 * real camera that leaves a `md` button ~26px clear of the window at the tightest deck count and
 * viewport. A table with less room in front of its decks cannot hang a control off them.
 */
const ACTION_DROP = 0.84;

/** The deck's hit handlers, shared by whichever of the two groups is on the table. */
type DeckPointer = {
  onPointerOver: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
};

export function Deck3D({
  label,
  sublabel,
  notice,
  action,
  cards,
  cardPose,
  back,
  aspect = CARD_ASPECT,
  pose,
  hoverPose,
  visible = true,
  onSelect,
}: {
  /** The deck's name, or nothing for an unlabelled pile (a solitaire stock needs no caption). */
  label?: string;
  /**
   * The line under it — a count, "empty", a `Spinner` while the count is still unknown, whatever the
   * caller wants to say. Any node, because "how many cards" is sometimes not yet a number.
   */
  sublabel?: ReactNode;
  /**
   * A mark drawn **over** the deck rather than under it, for a deck the table wants to point at.
   * Anything DOM; it is centred on the deck's own anchor and takes no pointer events, so the deck
   * under it stays one hit target. Goes with the label when the deck is swept off the table.
   */
  notice?: ReactNode;
  /**
   * A control drawn **under** the deck's caption, for something the table is offering about this deck
   * in particular. Anything DOM, and unlike {@link notice} it is meant to be clicked: the layer it
   * sits in is `pointer-events-none`, so each control turns its own back on — the same contract the
   * page chrome over the canvas keeps.
   *
   * It travels and disappears with the deck, which is the whole point of putting it here rather than
   * in the page's own chrome. Goes with the label when the deck is swept off the table.
   */
  action?: ReactNode;
  /** How many cards to draw. **0 draws the empty slot** instead of a stack. */
  cards: number;
  /** The nth card's pose in the deck's own space. The caller owns the stack's shape. */
  cardPose: (index: number) => Pose;
  back?: THREE.Texture;
  aspect?: number;
  pose: Pose;
  /** How the deck acknowledges the cursor. A deck lifts as a block; it does not tilt. */
  hoverPose?: (pose: Pose) => Pose;
  /** Decks swept off the table keep animating but drop their label and stop taking clicks. */
  visible?: boolean;
  /**
   * What a click on this deck does, or nothing if it does nothing — a collection with no cards in
   * it is inert, an emptied pile puts its deck back, a stock deals. That is the table's call, not the
   * deck's, so the presence of this is the whole test: no handler, no cursor and no lift either.
   */
  onSelect?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const selectable = Boolean(onSelect) && visible;
  useCursor(hovered && selectable);

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

  const caption =
    visible && (label || sublabel) ? (
      <Html
        center
        position={[0, 0, CARD_HEIGHT * LABEL_DROP]}
        zIndexRange={HTML_Z_RANGE}
        className="pointer-events-none"
      >
        <div
          className={cn(
            'small-caps whitespace-nowrap text-center font-title leading-tight transition-colors',
            hovered && selectable ? 'text-ps-accent' : 'text-ps-bold',
          )}
        >
          {label && <div className="text-lg">{label}</div>}
          {sublabel && (
            // `flex` centres a mark as readily as it does a line of type — the sublabel is a slot,
            // and a spinner standing in for a count has to sit where the count would.
            <div className="flex justify-center font-mono text-xs opacity-70">{sublabel}</div>
          )}
        </div>
      </Html>
    ) : null;

  //
  // Its own `<Html>` rather than a line in the caption: the caption hangs in front of the deck, and
  // this belongs on it. Same anchor as the deck, so it lands on the stack's base or in the empty slot.
  //
  // **The wrapper is given a definite 1px box and centres the notice inside it, overflowing.** drei's
  // `center` is `translate3d(-50%,-50%,0)` on that wrapper, whose width is otherwise `auto` inside a
  // zero-width host — so the percentages resolve against a *shrink-to-fit* box, i.e. against the
  // notice's own layout. `size-px` makes it definite: `center` becomes an exact half-pixel and the
  // anchor is a point, which is what it always meant.
  //
  // **A notice containing an `<img>` must carry `max-w-none`** (`ui/NotificationBadge` does).
  // Tailwind's preflight ships `img { max-width: 100% }` and 100% is *this* box — so an image inside
  // it is clamped to one pixel, or to nothing at all against the auto-width version. That is a real
  // bug this cost hours: the art loads, paints, and is a sliver you cannot see.
  //
  const mark =
    visible && notice ? (
      <Html
        center
        zIndexRange={HTML_Z_RANGE}
        className="pointer-events-none flex size-px items-center justify-center"
      >
        {notice}
      </Html>
    ) : null;

  //
  // The action, below the caption. **`w-max` with a 1px height is what hangs it downward from its
  // anchor**: drei's `center` is `translate3d(-50%,-50%,0)`, so a definite max-content width centres it
  // horizontally on the deck (the thing to line up with) while half a pixel of height leaves its top
  // edge on the anchor — which is what makes `ACTION_DROP` the gap above the control rather than a
  // guess at its middle. No flex box here for the same reason `notice` needs one: nothing has to be
  // centred *inside* it, so nothing can be shrunk to a pixel by it either.
  //
  const control =
    visible && action ? (
      <Html
        center
        position={[0, 0, CARD_HEIGHT * ACTION_DROP]}
        zIndexRange={HTML_Z_RANGE}
        className="pointer-events-none h-px w-max"
      >
        {action}
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
        <CardSlot3D aspect={aspect} />
        {caption}
        {mark}
        {control}
      </group>
    );
  }

  return (
    <DeckStack
      cards={cards}
      cardPose={cardPose}
      back={back}
      aspect={aspect}
      pose={hovered && selectable && hoverPose ? hoverPose(pose) : pose}
      pointer={pointer}
    >
      {caption}
      {mark}
      {control}
    </DeckStack>
  );
}

/**
 * The face-down stack, and the only part of a deck that travels: **one** damped group for the whole
 * pile, so the cards inside it stay a static local stack. The pose it is handed already carries the
 * hover lift.
 */
function DeckStack({
  cards,
  cardPose,
  back,
  aspect,
  pose,
  pointer,
  children,
}: {
  cards: number;
  cardPose: (index: number) => Pose;
  back?: THREE.Texture;
  aspect: number;
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
        const card = cardPose(index);
        return (
          <mesh
            key={index}
            geometry={cardGeometry(aspect)}
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
              color={CARD_EDGE_COLOR}
              roughness={0.95}
            />
          </mesh>
        );
      })}

      {children}
    </group>
  );
}
