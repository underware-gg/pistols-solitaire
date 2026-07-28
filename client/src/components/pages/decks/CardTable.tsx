'use client';

import { Html } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import {
  cameraDistance,
  deckCardPose,
  deckParkedPose,
  deckPose,
  deckSweptPose,
  deckTopPose,
  gridPageSize,
  gridPose,
  hoveredCardPose,
  hoveredDeckPose,
  pilePose,
  TABLE,
  zoomBackdropDepth,
  zoomBackdropPlane,
  zoomPose,
} from '@/components/pages/decks/table-layout';
import { useContractMeta } from '@/components/providers/ContractsProvider';
import { tokenImageUrl } from '@/dojo/torii';
import {
  backUrl,
  Card3D,
  damp,
  Deck3D,
  DECK_ART_HEIGHT,
  FitCamera,
  MOVE_LAMBDA,
  STANDARD_ASPECT,
  useCardArt,
} from '@/engine';
import { CARD_BACK_ALT_URL, CARD_BACK_URL, cardBackUrl } from '@/engine/card-art';
import { cn } from '@/lib/cn';
import { useSolitaireStore } from '@/stores/solitaire-store';

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
// in as props, so the DOM chrome in `DecksPage` and the scene can never disagree about the
// view. Poses come from `table-layout.ts`, the travel from `usePoseAnimation`.
//

export type TableDeck = {
  /** Torii contract address — the deck's identity, and where its card art comes from. */
  address: string;
  game: string;
  /** `contracts.json`'s slug: how this deck is named in the URL. */
  slug: string;
  name: string;
  /**
   * Every card in the deck, in the order it is dealt. For a collection these are the token ids the
   * account holds, ascending; for a deck that is not a collection they are whatever {@link art}
   * knows how to draw. Only a page of them is ever on the felt.
   */
  cardIds: string[];
  /** Set only for a deck that is not a collection — see {@link DeckArt}. */
  art?: DeckArt;
};

/**
 * A deck whose cards are files rather than tokens: `/deck/solitaire`, the standard deck. Absent —
 * i.e. for every collection — a card's art comes from Torii's image endpoint, it is the token shape,
 * and its caption is its token number.
 *
 * The **back is deliberately not here**: it is the player's own, chosen on `/solitaire`, so the
 * table resolves it the same way it picks between the two token backs. Everything in here is a
 * property of the deck's *art*, which is the whole reason the table needs to be told any of it.
 */
export type DeckArt = {
  /** Where the face of this card is. Nothing back means blank stock, as with a token that 404s. */
  face: (cardId: string) => string | undefined;
  /** The shape every card in the deck is drawn at. Must be the aspect its art was painted at. */
  aspect: number;
  /** What the zoomed card's caption says, in place of a token number. */
  label: (cardId: string) => string | undefined;
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
/** Approach rate for the dimmer, in reciprocal seconds. The camera's own is in `FitCamera`. */
const BACKDROP_LAMBDA = 7;

export function CardTable({
  decks,
  columns,
  selected,
  page,
  zoomed,
  onSelect,
  onZoom,
  onTurnPage,
  className,
}: {
  decks: TableDeck[];
  /** How many cards wide to deal — `gridColumnsFor`, decided by the scene from its own box. */
  columns: number;
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
          columns={columns}
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
  columns,
  selected,
  page,
  zoomed,
  onSelect,
  onZoom,
  onTurnPage,
}: {
  decks: TableDeck[];
  columns: number;
  selected: number | null;
  page: number;
  zoomed: string | null;
  onSelect: (index: number | null) => void;
  onZoom: (tokenId: string | null) => void;
  onTurnPage: (delta: number) => void;
}) {
  const viewport = useThree(state => state.size);

  //
  // The card backs, all loaded and pinned for the life of the table: pistols' own collections are
  // printed on one and every other game on the other (`cardBackUrl`), and the deck that is not a
  // collection carries its own. Loaded up front rather than per deck because there are only three of
  // them and every deck on the felt wants one already — a hook cannot be called per deck anyway, and
  // a back arriving late would flash blank stock across a whole table of face-down cards.
  //
  // The house deck's back is **the one the player chose on `/solitaire`**: it is the same deck, so it
  // is the same back. Asked for at `DECK_ART_HEIGHT` and `STANDARD_ASPECT`, which is exactly what
  // `SolitaireTable` asks for — same cache key, so the two tables share the one texture rather than
  // pinning a second copy of it. The budget is right here too: a back is only ever seen in a stack on
  // the felt, because a card held up to the camera is showing its face.
  //
  const cardBack = useSolitaireStore(s => s.cardBack);
  const homeBack = useCardArt(CARD_BACK_URL, { pin: true });
  const guestBack = useCardArt(CARD_BACK_ALT_URL, { pin: true });
  const houseBack = useCardArt(backUrl(cardBack), {
    aspect: STANDARD_ASPECT,
    height: DECK_ART_HEIGHT,
    pin: true,
  });
  const backFor = (deck: TableDeck) =>
    deck.art ? houseBack : cardBackUrl(deck.game) === CARD_BACK_URL ? homeBack : guestBack;

  //
  // Each view is framed on its own, and every pose in front of the camera is derived from where the
  // camera *will be* — so a card zooms to the right place even while the camera is still travelling.
  //
  const aspect = viewport.width / viewport.height;
  const distance = cameraDistance(
    aspect,
    selected === null ? 'decks' : 'grid',
    decks.length,
    columns,
  );
  const pile = pilePose(columns);
  const zoom = zoomPose(TABLE.fov, distance, aspect);

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

  const size = gridPageSize(columns);
  const hand = dealt ? dealt.cardIds.slice(page * size, (page + 1) * size) : [];

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
      : deckTopPose(dealtIndex, decks.length, Math.min(TABLE.deckStack, dealt.cardIds.length));

  // The open collection's own stock. Undefined lets Card3D fall back to cream paper — which is also
  // what a deck that is not a collection gets, and all it needs: its art is already the card's shape,
  // so the stock behind it is never seen.
  const meta = useContractMeta(dealt?.address);
  const background = meta?.backgroundColor;

  /** Where the open deck's cards come from, and what to call one: its own art, or Torii's. */
  const art = dealt?.art;

  return (
    <>
      <FitCamera distance={distance} direction={TABLE.direction} fov={TABLE.fov} />

      {/* Light enough to read the art, angled enough that a card turning over catches it — every
       * number is in `TABLE`'s lighting block. */}
      <ambientLight intensity={TABLE.lightAmbient} />
      <directionalLight
        position={TABLE.lightKeyPosition}
        intensity={TABLE.lightKeyIntensity}
        castShadow
        shadow-mapSize={[TABLE.shadowMapSize, TABLE.shadowMapSize]}
        shadow-camera-left={-TABLE.shadowExtent}
        shadow-camera-right={TABLE.shadowExtent}
        shadow-camera-top={TABLE.shadowExtent}
        shadow-camera-bottom={-TABLE.shadowExtent}
        shadow-camera-near={TABLE.shadowNear}
        shadow-camera-far={TABLE.shadowFar}
        shadow-bias={TABLE.shadowBias}
      />
      <directionalLight position={TABLE.lightFillPosition} intensity={TABLE.lightFillIntensity} />

      {/* The felt is CSS, so the table's only geometry is this shadow catcher: `shadowMaterial`
       * draws the shadow and nothing else, and the page shows through everywhere else. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial transparent opacity={TABLE.shadowOpacity} />
      </mesh>

      {decks.map((deck, index) => {
        // The dealt page is out on the felt, so it is out of the pile too — and a deck whose last
        // page is dealt has nothing left to draw, which is what the empty slot says.
        const remaining =
          index === selected
            ? Math.max(0, deck.cardIds.length - (page + 1) * size)
            : deck.cardIds.length;
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
            sublabel={String(deck.cardIds.length || 'empty')}
            cards={Math.min(TABLE.deckStack, remaining)}
            cardPose={deckCardPose}
            hoverPose={hoveredDeckPose}
            back={backFor(deck)}
            aspect={deck.art?.aspect}
            pose={
              selected === null
                ? deckPose(index, decks.length)
                : index === selected
                  ? deckParkedPose(columns)
                  : deckSweptPose(index, decks.length)
            }
            visible={selected === null || index === selected}
            onSelect={click}
          />
        );
      })}

      {dealt &&
        hand.map((cardId, index) => {
          const isZoomed = zoomed === cardId;
          return (
            <Card3D
              key={`${dealt.address}-${cardId}`}
              frontUrl={art ? art.face(cardId) : tokenImageUrl(dealt.address, cardId)}
              back={backFor(dealt)}
              aspect={art?.aspect}
              background={background}
              pose={open ? (isZoomed ? zoom : gridPose(index, columns)) : home}
              initial={pile}
              delay={open ? DEAL_DELAY + index * DEAL_STAGGER : 0}
              //
              // Dealt face down, turned over as each card's art lands. Torii serves a token image in
              // its own time (and often needs a second ask — `card-art.ts`), so dealing art up meant
              // a page of blank cream faces filling in one by one; dealt down, the same wait reads as
              // a deal and every card turns over onto its own picture.
              //
              revealOnLoad
              inHand={isZoomed}
              hoverable={!isZoomed}
              hoverPose={hoveredCardPose}
              onClick={() => onZoom(isZoomed ? null : cardId)}
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
                    {/* A collection numbers its cards; a deck of playing cards names them. */}
                    <span className="ml-3 font-mono text-lg text-ps-text">
                      {art ? art.label(cardId) : `#${BigInt(cardId).toString()}`}
                    </span>
                  </div>
                </Html>
              )}
            </Card3D>
          );
        })}

      <ZoomBackdrop
        active={Boolean(zoomed)}
        depth={zoomBackdropDepth(Boolean(zoomed), distance, columns)}
        plane={depth => zoomBackdropPlane(TABLE.fov, distance, aspect, depth)}
        onDismiss={() => onZoom(null)}
      />
    </>
  );
}

//
// The dimmer behind a zoomed card. It is a plane in the scene rather than a div over the canvas,
// because it has to sit *between* the card and the rest of the table — a DOM overlay can only be
// in front of the whole canvas or behind all of it.
//
// It **travels with the card**, `zoomBackdropGap` behind it, rather than waiting at the card's final
// depth: a card flying in from the felt is behind a parked dimmer and gets drawn *through* it, so it
// would darken for the whole flight and brighten the moment it crossed the plane. `zoomBackdropDepth`
// gives it a target on either side of the trip and this damps toward it at `MOVE_LAMBDA` — the rate
// the card itself moves at, which is what keeps the dimmer from overtaking it.
//
// That covers a card on its own. Stepping along the row puts *two* cards in play on opposite sides
// of the plane, which no single plane can be behind — so `Card3D`'s `inHand` is what keeps the card
// being picked up out of the dimmer, and this travel is what keeps the card being put back down out
// of it (it loses `inHand` the moment it is dropped, and would otherwise cross a parked plane within
// a frame of setting off, while the dimmer is still at full strength).
//
// The mesh is a unit plane and the frame sets its scale, so following the card costs no geometry.
//
function ZoomBackdrop({
  active,
  depth,
  plane,
  onDismiss,
}: {
  active: boolean;
  /** Where the dimmer belongs right now, in front of the camera — `zoomBackdropDepth`. */
  depth: number;
  /** The plane that fills the frame at a given depth, as the dimmer passes through it. */
  plane: (depth: number) => ReturnType<typeof zoomBackdropPlane>;
  onDismiss: () => void;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const current = useRef(depth);

  useFrame((_, rawDelta) => {
    if (!material.current || !mesh.current) return;
    const delta = Math.min(rawDelta, 1 / 30);

    material.current.opacity = damp(
      material.current.opacity,
      active ? BACKDROP_OPACITY : 0,
      BACKDROP_LAMBDA,
      delta,
    );
    mesh.current.visible = material.current.opacity > 0.004;

    // Faded out it is not on the table at all, so it parks rather than travels — the next card to be
    // picked up finds the dimmer already waiting behind it, whichever way the last one went.
    current.current = mesh.current.visible
      ? damp(current.current, depth, MOVE_LAMBDA, delta)
      : depth;

    const at = plane(current.current);
    mesh.current.position.set(...at.position);
    mesh.current.rotation.set(...at.rotation);
    mesh.current.scale.set(at.width, at.height, 1);
  });

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a <mesh> is a three.js object, not a DOM element — Escape dismisses the zoom for the keyboard
    <mesh
      ref={mesh}
      visible={false}
      //
      // While a card is up the dimmer is the table's lid: clicking it puts the card back, and every
      // other pointer event stops here too. Each handler has to say so itself — R3F walks *all* the
      // objects under the cursor in depth order and only `stopPropagation()` ends the walk, so an
      // `onClick` on its own left the felt behind it live: cards lit up on hover and a click landed
      // on the dimmer and the card under it at once.
      //
      // With no handlers at all R3F leaves the plane out of hit testing entirely, which is exactly
      // what a faded-out dimmer wants — hence every one of these is gated on `active`.
      //
      onPointerOver={active ? event => event.stopPropagation() : undefined}
      onPointerMove={active ? event => event.stopPropagation() : undefined}
      onPointerDown={active ? event => event.stopPropagation() : undefined}
      onClick={
        active
          ? event => {
              event.stopPropagation();
              onDismiss();
            }
          : undefined
      }
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial ref={material} color="black" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
