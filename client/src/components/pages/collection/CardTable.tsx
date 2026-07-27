'use client';

import { Html } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Card3D } from '@/components/pages/collection/Card3D';
import { Deck3D } from '@/components/pages/collection/Deck3D';
import {
  cameraDistance,
  deckParkedPose,
  deckPose,
  deckSweptPose,
  deckTopPose,
  gridPageSize,
  gridPose,
  pilePose,
  TABLE,
  zoomBackdropPlane,
  zoomPose,
} from '@/components/pages/collection/table-layout';
import { useContractMeta } from '@/components/providers/ContractsProvider';
import { tokenImageUrl } from '@/dojo/torii';
import { useCardArt } from '@/hooks/use-card-art';
import { CARD_BACK_URL } from '@/lib/card-art';
import { damp } from '@/lib/card-pose';
import { cn } from '@/lib/cn';

//
// The 3D table: decks on the felt, one deck dealt into a grid, one card held up to the light.
//
// The canvas is transparent and paints nothing of its own — the felt, the logo stamp and the
// vignette underneath it are the CSS surface from `styles/main.css`, and the only thing the
// renderer puts on the table besides cards is their shadows (a `shadowMaterial` plane, which
// darkens whatever the page is showing through). So switching the table colour in the burger menu
// re-tints the felt under a live 3D scene without the scene knowing a colour exists.
//
// The component is fully controlled: which deck is open, which page, which card is zoomed all come
// in as props, so the DOM chrome in `CollectionPage` and the scene can never disagree about the
// view. Poses come from `table-layout.ts`, the travel from `usePoseAnimation`.
//

export type TableDeck = {
  /** Torii contract address — the deck's identity, and where its card art comes from. */
  address: string;
  game: string;
  /** `contracts.json`'s slug: how this deck is named in the URL. */
  slug: string;
  name: string;
  /** Every token id owned in this collection, ascending. Only a page of them is ever dealt. */
  tokenIds: string[];
};

/** Beat before the first card leaves the pile, so the deck has arrived where it is dealing from. */
const DEAL_DELAY = 0.22;
/** Gap between consecutive cards — the whole difference between dealing and appearing. */
const DEAL_STAGGER = 0.055;
/** How long dealt cards keep flying home after a deck closes, before they are unmounted. */
const RETURN_MS = 900;

/**
 * Card units per CSS pixel of the zoomed card's caption. `<Html transform>` maps one pixel to
 * `scale * 10/400` units of its parent's space (drei's default `distanceFactor`), so this is what
 * relates the caption's Tailwind sizes to `TABLE.zoomCaption*` — measured, the caption below is
 * 190 × 49px for "Duelists", i.e. 0.48 × 0.12 card units, inside the box the zoom reserves for it.
 */
const CAPTION_SCALE = 0.1;

const BACKDROP_OPACITY = 0.55;
/** Approach rates for the camera and the dimmer, in reciprocal seconds. */
const CAMERA_LAMBDA = 5;
const BACKDROP_LAMBDA = 7;

export function CardTable({
  decks,
  selected,
  page,
  zoomed,
  onSelect,
  onZoom,
  onTurnPage,
  className,
}: {
  decks: TableDeck[];
  /** Index of the open deck in `decks`, or null while the decks are laid out for browsing. */
  selected: number | null;
  /** Which page of the open deck is dealt. */
  page: number;
  /** Token id of the card held up in front of the camera, if any. */
  zoomed: string | null;
  onSelect: (index: number | null) => void;
  onZoom: (tokenId: string | null) => void;
  /** Pages the open deck, by a signed number of pages — the same call the page chrome makes. */
  onTurnPage: (delta: number) => void;
  className?: string;
}) {
  return (
    <div className={cn('absolute inset-0', className)}>
      {/* `flat` keeps three's tone mapping off the card art — the tokens ship the colours their
       * artist chose, and ACES would quietly desaturate all of them. */}
      <Canvas
        flat
        shadows
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        camera={{ fov: TABLE.fov, near: 0.1, far: 60 }}
      >
        <Table
          decks={decks}
          selected={selected}
          page={page}
          zoomed={zoomed}
          onSelect={onSelect}
          onZoom={onZoom}
          onTurnPage={onTurnPage}
        />
      </Canvas>
    </div>
  );
}

function Table({
  decks,
  selected,
  page,
  zoomed,
  onSelect,
  onZoom,
  onTurnPage,
}: {
  decks: TableDeck[];
  selected: number | null;
  page: number;
  zoomed: string | null;
  onSelect: (index: number | null) => void;
  onZoom: (tokenId: string | null) => void;
  onTurnPage: (delta: number) => void;
}) {
  const viewport = useThree(state => state.size);
  const back = useCardArt(CARD_BACK_URL, { pin: true });

  //
  // Each view is framed on its own, and every pose in front of the camera is derived from where the
  // camera *will be* — so a card zooms to the right place even while the camera is still travelling.
  //
  const aspect = viewport.width / viewport.height;
  const distance = cameraDistance(aspect, selected === null ? 'decks' : 'grid', decks.length);
  const pile = pilePose();
  const zoom = zoomPose(TABLE.fov, distance, aspect);
  const backdrop = zoomBackdropPlane(TABLE.fov, distance, aspect);

  //
  // The open deck's cards stay mounted for a moment after it closes so they can fly back to the
  // pile instead of blinking out. `dealt` is therefore the deck being *shown*, which lags
  // `selected` on the way down and matches it on the way up.
  //
  const open = selected === null ? undefined : decks[selected];
  const [dealt, setDealt] = useState<TableDeck>();
  useEffect(() => {
    if (open) {
      setDealt(open);
      return;
    }
    const timer = setTimeout(() => setDealt(undefined), RETURN_MS);
    return () => clearTimeout(timer);
  }, [open]);

  const size = gridPageSize();
  const hand = dealt ? dealt.tokenIds.slice(page * size, (page + 1) * size) : [];

  //
  // Where the hand goes when the deck closes: the top of that deck, back in the browsing layout.
  // Not the parked pile — by the time the cards arrive the deck has slid home, so they would land
  // beside it and blink out. The deck being shown is `dealt`, which outlives `selected` by exactly
  // the return, so the cards have somewhere to aim for the whole way.
  //
  const dealtIndex = dealt ? decks.findIndex(deck => deck.address === dealt.address) : -1;
  const home =
    dealtIndex < 0 || !dealt
      ? pile
      : deckTopPose(dealtIndex, decks.length, Math.min(TABLE.deckStack, dealt.tokenIds.length));

  // The open collection's own stock. Undefined lets Card3D fall back to cream paper.
  const meta = useContractMeta(dealt?.address);
  const background = meta?.backgroundColor;

  return (
    <>
      <FitCamera distance={distance} />

      {/* Light enough to read the art, angled enough that a card turning over catches it. */}
      <ambientLight intensity={0.85} />
      <directionalLight
        position={[3.4, 7, 4.2]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-bias={-0.0006}
      />
      {/* Fill from the player's side, so a card held up to the camera is not lit only from behind. */}
      <directionalLight position={[-1, 3, 7]} intensity={0.45} />

      {/* The felt is CSS, so the table's only geometry is this shadow catcher: `shadowMaterial`
       * draws the shadow and nothing else, and the page shows through everywhere else. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial transparent opacity={0.32} />
      </mesh>

      {decks.map((deck, index) => {
        // The dealt page is out on the felt, so it is out of the pile too — and a deck whose last
        // page is dealt has nothing left to draw, which is what the empty slot says.
        const remaining =
          index === selected
            ? Math.max(0, deck.tokenIds.length - (page + 1) * size)
            : deck.tokenIds.length;
        //
        // What a click does, and only the table can say — the open deck is a pile you deal from:
        // with cards left in it, clicking deals the next page; emptied, clicking is the space the
        // cards came out of, so it puts them back (the same close as Escape or Back, animation and
        // all). A deck that is not open opens, and a collection with no cards at all is inert:
        // `Deck3D` takes no handler rather than being told it is disabled.
        //
        const isOpen = index === selected;
        const click = isOpen
          ? remaining > 0
            ? () => onTurnPage(1)
            : () => onSelect(null)
          : remaining > 0
            ? () => onSelect(index)
            : undefined;
        return (
          <Deck3D
            key={deck.address}
            label={deck.name}
            count={deck.tokenIds.length}
            remaining={remaining}
            back={back}
            pose={
              selected === null
                ? deckPose(index, decks.length)
                : index === selected
                  ? deckParkedPose()
                  : deckSweptPose(index, decks.length)
            }
            visible={selected === null || index === selected}
            onSelect={click}
          />
        );
      })}

      {dealt &&
        hand.map((tokenId, index) => {
          const isZoomed = zoomed === tokenId;
          return (
            <Card3D
              key={`${dealt.address}-${tokenId}`}
              frontUrl={tokenImageUrl(dealt.address, tokenId)}
              back={back}
              background={background}
              pose={open ? (isZoomed ? zoom : gridPose(index)) : home}
              initial={pile}
              delay={open ? DEAL_DELAY + index * DEAL_STAGGER : 0}
              hoverable={!isZoomed}
              onClick={() => onZoom(isZoomed ? null : tokenId)}
            >
              {isZoomed && (
                //
                // The other half of "HTML over the cards": `transform` renders this div *in* the
                // scene, so it inherits the card's tilt, travel and scale and reads as printed on
                // the card. It is the expensive mode — one DOM subtree per instance, no depth
                // sorting against meshes — so it is for the one card in the player's hands, while
                // the twenty on the felt stay pure texture.
                //
                // How far it hangs is `TABLE.zoomCaptionDrop`, because that is also the number
                // `zoomPose` frames around — read one, and the caption cannot end up off screen.
                //
                <Html
                  transform
                  center
                  position={[0, -TABLE.zoomCaptionDrop, 0.02]}
                  scale={CAPTION_SCALE}
                >
                  <div className="whitespace-nowrap rounded-md border border-ps-line bg-ps-panel/90 px-4 py-2">
                    <span className="small-caps font-title text-xl text-ps-text">{dealt.name}</span>
                    <span className="ml-3 font-mono text-lg text-ps-text">
                      #{BigInt(tokenId).toString()}
                    </span>
                  </div>
                </Html>
              )}
            </Card3D>
          );
        })}

      <ZoomBackdrop active={Boolean(zoomed)} plane={backdrop} onDismiss={() => onZoom(null)} />
    </>
  );
}

//
// Frames the table: the camera keeps the angle `TABLE.direction` gives it and backs off until the
// current layout fits, so nothing is cropped on a narrow window and no felt is wasted on a wide
// one. The distance is damped rather than set, which makes the pull-back part of opening a deck —
// the decks are framed tightly on their own, and the table widens to take the dealt grid.
//
function FitCamera({ distance }: { distance: number }) {
  const camera = useThree(state => state.camera) as THREE.PerspectiveCamera;
  const direction = useMemo(() => new THREE.Vector3(...TABLE.direction).normalize(), []);
  const current = useRef(0);

  const place = (at: number) => {
    current.current = at;
    camera.position.copy(direction).multiplyScalar(at);
    camera.lookAt(0, 0, 0);
  };

  // The first frame is already framed — only later changes are worth animating.
  useLayoutEffect(() => {
    camera.fov = TABLE.fov;
    camera.updateProjectionMatrix();
    place(distance);
  }, [camera]);

  useFrame((_, delta) => {
    if (Math.abs(current.current - distance) < 0.001) return;
    place(damp(current.current, distance, CAMERA_LAMBDA, Math.min(delta, 1 / 30)));
  });

  return null;
}

//
// The dimmer behind a zoomed card. It is a plane in the scene rather than a div over the canvas,
// because it has to sit *between* the card and the rest of the table — a DOM overlay can only be
// in front of the whole canvas or behind all of it.
//
function ZoomBackdrop({
  active,
  plane,
  onDismiss,
}: {
  active: boolean;
  plane: ReturnType<typeof zoomBackdropPlane>;
  onDismiss: () => void;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((_, delta) => {
    if (!material.current || !mesh.current) return;
    material.current.opacity = damp(
      material.current.opacity,
      active ? BACKDROP_OPACITY : 0,
      BACKDROP_LAMBDA,
      Math.min(delta, 1 / 30),
    );
    mesh.current.visible = material.current.opacity > 0.004;
  });

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a <mesh> is a three.js object, not a DOM element — Escape dismisses the zoom for the keyboard
    <mesh
      ref={mesh}
      position={plane.position}
      rotation={plane.rotation}
      visible={false}
      // Without a handler R3F leaves the plane out of hit testing entirely, so an inert backdrop
      // cannot swallow a hover on the cards behind it.
      onClick={active ? onDismiss : undefined}
    >
      <planeGeometry args={[plane.width, plane.height]} />
      <meshBasicMaterial ref={material} color="black" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
