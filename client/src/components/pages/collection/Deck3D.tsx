'use client';

import { Html, useCursor } from '@react-three/drei';
import { useState } from 'react';
import type * as THREE from 'three';
import { deckCardPose, hoveredDeckPose, TABLE } from '@/components/pages/collection/table-layout';
import { usePoseAnimation } from '@/hooks/use-pose-animation';
import {
  CARD_ART_TINT,
  CARD_FACE,
  CARD_GEOMETRY,
  CARD_HEIGHT,
  CARD_PAPER_COLOR,
} from '@/lib/card-geometry';
import type { Pose } from '@/lib/card-pose';
import { cn } from '@/lib/cn';

//
// A collection as a deck on the table: a face-down stack, a label, and a hit target the size of
// the whole thing. The stack is nine cards however many the collection holds — a deck reads as a
// deck at three cards and at nine, and never at five hundred.
//
// The label is the DOM half of the answer to "cards with HTML over them": `<Html>` from drei
// projects a 3D anchor to screen coordinates and positions an ordinary div there, so the text is
// real DOM — Tailwind classes, selectable, crisp at any zoom — that happens to sit over a mesh.
// Not `transform`: a deck label wants to stay flat and legible, not lie down on the felt with the
// cards. (The zoomed card's caption in `CardTable` is the `transform` case.)
//

export function Deck3D({
  label,
  count,
  back,
  pose,
  visible = true,
  onSelect,
}: {
  label: string;
  /** How many cards the collection really holds — the label's number. */
  count: number;
  back?: THREE.Texture;
  pose: Pose;
  /** Decks swept off the table keep animating but drop their label and stop taking clicks. */
  visible?: boolean;
  onSelect?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const selectable = Boolean(onSelect) && visible && count > 0;
  useCursor(hovered && selectable);

  const group = usePoseAnimation(hovered && selectable ? hoveredDeckPose(pose) : pose);
  const cards = Math.max(1, Math.min(TABLE.deckStack, count));

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a <group> is a three.js object, not a DOM element — the accessible control for a deck is in the page chrome
    <group
      ref={group}
      onPointerOver={event => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={
        selectable
          ? event => {
              event.stopPropagation();
              onSelect?.();
            }
          : undefined
      }
    >
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

      {visible && (
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
      )}
    </group>
  );
}
