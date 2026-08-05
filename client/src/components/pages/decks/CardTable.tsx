'use client';

import { Html } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import {
  cameraDistance,
  cardActionAnchor,
  deckCardPose,
  deckParkedPose,
  deckPose,
  deckSweptPose,
  deckSweptTopPose,
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
import { Spinner } from '@/components/ui/Spinner';
import { tokenImageUrl } from '@/dojo/torii';
import {
  backUrl,
  Card3D,
  damp,
  Deck3D,
  DECK_ART_HEIGHT,
  FitCamera,
  HTML_Z_RANGE,
  MOVE_LAMBDA,
  type Pose,
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
  /**
   * True while this deck's cards are still being counted, i.e. `cardIds` is empty because nobody has
   * answered yet rather than because the account holds none. The deck is on the felt either way — an
   * empty slot is what a collection looks like before and after the answer, so the table is laid out
   * once and only its captions change — but it says so with a spinner in place of the count, and
   * stays inert until the count lands.
   *
   * **Per deck, not per table**: the house's solitaire deck is not the account's and is known from
   * the first frame, so it shows its real count while every collection is still waiting.
   */
  loading?: boolean;
  /**
   * A mark to put over this deck while the decks are laid out for browsing — the free starter pack's
   * on the empty Duelists deck (`StarterPackMark`), the `+` on an empty Packs deck. It also makes such
   * a deck **worth clicking**: a collection with no cards is inert, unless the table has something to
   * say about it, in which case opening it is how the player acts on it.
   */
  notice?: ReactNode;
  /**
   * A control to hang under this deck — the claim on the deck a free pack lands in, the purchase on
   * the packs deck. **Drawn only while this deck is the open one**, which is the other half of
   * `notice`: the mark invites the player in from the browsing table and the control is what is
   * waiting under the deck when they arrive.
   */
  action?: ReactNode;
  /**
   * A control to draw on **each** of this deck's dealt cards — the Open button on every pack
   * (`pages/decks/PackOpen.tsx`). The third of the deck's DOM slots and the only one that is about a
   * card: `action` is one offer about the whole collection, this is the same offer asked of one card
   * at a time, and only the card can say which.
   *
   * Drawn on the felt only. A card held up to the camera is showing its caption instead, and while
   * *any* card is up they all go — the dimmer is a mesh and these are DOM over the whole canvas, so a
   * page of buttons would float above a table that is supposed to be under a lid.
   */
  cardAction?: (cardId: string) => ReactNode;
  /**
   * Cards from **another** collection to deal beside this deck's page — the duelists a pack just
   * revealed, on the felt next to the packs that are left. Drawn only while this deck is the open one,
   * and they take their slots from the same grid, so `gridPageSize` deals this deck fewer cards to
   * make room rather than letting them spill out of the shot.
   */
  reveal?: TableReveal;
};

/**
 * A handful of cards belonging to a collection other than the open deck, laid on its felt.
 *
 * **The collection has to be a deck on this same table**, because that deck is where they come from
 * and where they go: they fly in from it as it lies swept into the distance, and back to it when the
 * reveal is over (`deckSweptTopPose`). It is also where their art, their stock and their name are read
 * from, so a reveal carries none of that itself.
 */
export type TableReveal = {
  /** Torii contract address of that collection — its identity on this table. */
  address: string;
  cardIds: string[];
};

/**
 * A card on the felt in front of the open deck, from whichever collection — the deck's own page, or a
 * `reveal` beside it. Two collections in one grid is why the zoom names a card by **both**: token ids
 * restart at 1 per contract, so pack #1 and duelist #1 would otherwise be the same card.
 */
export type HandCard = { address: string; cardId: string };

/** What the zoom calls a card on the felt. Unique across the collections in play; see {@link HandCard}. */
export const handKey = ({ address, cardId }: HandCard): string => `${address}-${cardId}`;

/**
 * One card laid out on the felt, with everything about it already resolved from whichever collection
 * it belongs to: art, stock, back, where it is going and what it says when it is picked up. The
 * table's card loop reads only this, which is what lets one flat list hold two collections.
 */
type FeltCard = HandCard & {
  /** {@link handKey} — the React key, and what the zoom is held as. */
  key: string;
  frontUrl?: string;
  back?: THREE.Texture;
  background?: string;
  aspect?: number;
  /** Where it lies. The zoom overrides it for the one card in the player's hands. */
  pose: Pose;
  initial: Pose;
  delay: number;
  /** Its collection's name, printed under it at the camera. */
  name: string;
  /** What that caption calls this one — a number for a token, a name for a playing card. */
  label?: string;
  /** A control drawn on it while it lies on the felt (`TableDeck.cardAction`). */
  action?: ReactNode;
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
  /** {@link handKey} of the card held up in front of the camera, if any. */
  zoomed: string | null;
  onSelect: (index: number | null) => void;
  onZoom: (card: string | null) => void;
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

  const open = selected === null ? undefined : decks[selected];
  //
  // Whether the dealt grid has to leave felt under every card for a control. It changes the row
  // pitch and the height the camera frames, so it is read before either — and off `open` rather than
  // the lingering `dealt` below, because a closing deck is already being framed as the deck view and
  // its cards are on their way to a deck rather than to a grid slot.
  //
  const actions = Boolean(open?.cardAction);

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
    actions,
  );
  const pile = pilePose(columns);
  const zoom = zoomPose(TABLE.fov, distance, aspect);

  //
  // The open deck's cards stay mounted for a moment after it closes so they can fly back to the
  // pile instead of blinking out. `dealt` is therefore the deck being *shown*, which lags
  // `selected` on the way down and matches it on the way up.
  //
  const [dealt, setDealt] = useState<TableDeck>();
  useEffect(() => {
    if (open) {
      setDealt(open);
      return;
    }
    const timer = setTimeout(() => setDealt(undefined), RETURN_MS);
    return () => clearTimeout(timer);
  }, [open]);

  //
  // Cards from another collection, dealt beside the open deck's page — and they linger exactly as the
  // hand does, so the reveal being over is something they can be seen to leave. What replaces one is
  // never drawn over it: opening a second pack clears the reveal first, and the seconds the write
  // takes are far longer than the flight home.
  //
  const reveal = open?.reveal;
  const [showing, setShowing] = useState<TableReveal>();
  useEffect(() => {
    if (reveal && reveal.cardIds.length > 0) {
      setShowing(reveal);
      return;
    }
    const timer = setTimeout(() => setShowing(undefined), RETURN_MS);
    return () => clearTimeout(timer);
  }, [reveal]);

  // The reveal takes its slots from the same grid, so the deck deals into what is left. Read off the
  // live `reveal` rather than `showing`, which is what re-spreads the deck's own cards as the reveal
  // flies away — and what keeps this the same number `DecksScene` computes for the page and the zoom.
  const size = gridPageSize(columns, reveal?.cardIds.length ?? 0);
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

  //
  // The revealed cards' own deck, which is where everything about them comes from: their art, their
  // stock, the back they are dealt face down on, the name their caption reads — and the place they
  // travel to and from. It is one of the decks swept into the distance while this one is open, so
  // that top *is* off screen, and the same expression serves the entrance and the exit because they
  // are the same place.
  //
  const revealIndex = showing ? decks.findIndex(deck => deck.address === showing.address) : -1;
  const revealDeck = revealIndex < 0 ? undefined : decks[revealIndex];
  const revealMeta = useContractMeta(showing?.address);
  const revealHome = revealDeck
    ? (selected === null ? deckTopPose : deckSweptTopPose)(
        revealIndex,
        decks.length,
        Math.min(TABLE.deckStack, revealDeck.cardIds.length),
      )
    : pile;

  /** Where the open deck's cards come from, and what to call one: its own art, or Torii's. */
  const art = dealt?.art;

  //
  // Which card a control on the felt is standing on, so the card under it stays lifted while the
  // pointer is on the button. Without it the two fight: the cursor crosses the card, the card rises
  // and takes its button up with it, the button is now under the cursor and the card is not — so it
  // drops back onto the pointer, and the pair flickers. `Card3D`'s `hovered` exists for exactly this
  // (hover from the outside), and a `<Html>` is DOM, so `pointerover` is what reports it.
  //
  const [actionHover, setActionHover] = useState<string | null>(null);

  //
  // Everything on the felt in front of the open deck, in **one flat list**: the deck's own dealt page,
  // then whatever it is revealing beside it. Two sibling maps would look equivalent and are not —
  // React keys an inner array by its own slot (`ENGINE.md` §6) — and building it here is also what
  // keeps the card loop below blind to which collection a card came out of.
  //
  const felt: FeltCard[] = dealt
    ? [
        ...hand.map((cardId, index) => ({
          key: handKey({ address: dealt.address, cardId }),
          address: dealt.address,
          cardId,
          frontUrl: art ? art.face(cardId) : tokenImageUrl(dealt.address, cardId),
          back: backFor(dealt),
          background,
          aspect: art?.aspect,
          pose: open ? gridPose(index, columns, actions) : home,
          initial: pile,
          delay: open ? DEAL_DELAY + index * DEAL_STAGGER : 0,
          name: dealt.name,
          label: art ? art.label(cardId) : `#${BigInt(cardId).toString()}`,
          // Never on a card at the camera, never while any card is (see `TableDeck.cardAction`), and
          // never on the cards flying home behind a closing deck — `dealt` outlives `open`.
          action: zoomed || !open ? undefined : dealt.cardAction?.(cardId),
        })),
        ...(showing && revealDeck
          ? showing.cardIds.map((cardId, index) => ({
              key: handKey({ address: showing.address, cardId }),
              address: showing.address,
              cardId,
              frontUrl: tokenImageUrl(showing.address, cardId),
              back: backFor(revealDeck),
              background: revealMeta?.backgroundColor,
              // The slots the deal left over, taken up from where its last card lies so a short page
              // leaves no gap in the middle of the grid.
              pose: reveal ? gridPose(hand.length + index, columns, actions) : revealHome,
              initial: revealHome,
              // Staggered like a deal, because that is what it is: they came out of a pack.
              delay: index * DEAL_STAGGER,
              name: revealDeck.name,
              label: `#${BigInt(cardId).toString()}`,
            }))
          : []),
      ]
    : [];

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
        // **Unless it carries a notice**, which is the one thing an empty deck can be worth opening
        // for — the free starter pack is claimed on the deck's own page, so the mark over the deck
        // and the deck itself are one target and one gesture.
        //
        // A deck still being counted is not inert-because-empty, it is **not yet answered**, so it
        // takes no click at all: opening it would deal a page of nothing and closing it again is a
        // gesture the player did not ask for. It becomes clickable the frame its count lands.
        const isOpen = index === selected;
        const click = deck.loading
          ? undefined
          : isOpen
            ? remaining > 0
              ? () => onTurnPage(1)
              : () => onSelect(null)
            : remaining > 0 || deck.notice
              ? () => onSelect(index)
              : undefined;
        return (
          <Deck3D
            key={deck.address}
            label={deck.name}
            // The count, or the mark that says there isn't one yet. `empty` is the *answer* "none",
            // which is why it can't also be what a deck shows while the answer is outstanding.
            sublabel={
              deck.loading ? (
                <Spinner size="sm" label={`Counting ${deck.name}`} />
              ) : (
                String(deck.cardIds.length || 'empty')
              )
            }
            // **The mark is for browsing, the control is for the open deck**, and between them that
            // is the whole gesture: the table points at a deck, opening it is how the player acts on
            // the mark, and what they came to do is waiting under the deck when they get there. Which
            // is also why neither is ever drawn twice — a browsing table full of decks stays a table
            // of decks, with one mark on it.
            notice={selected === null ? deck.notice : undefined}
            action={index === selected ? deck.action : undefined}
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

      {felt.map(card => {
        const isZoomed = zoomed === card.key;
        return (
          <Card3D
            key={card.key}
            frontUrl={card.frontUrl}
            back={card.back}
            aspect={card.aspect}
            background={card.background}
            pose={isZoomed ? zoom : card.pose}
            initial={card.initial}
            delay={card.delay}
            //
            // Dealt face down, turned over as each card's art lands. Torii serves a token image in
            // its own time (and often needs a second ask — `card-art.ts`), so dealing art up meant
            // a page of blank cream faces filling in one by one; dealt down, the same wait reads as
            // a deal and every card turns over onto its own picture.
            //
            revealOnLoad
            inHand={isZoomed}
            hoverable={!isZoomed}
            // Lifted by the pointer being on its own control, not only by the pointer being on it.
            hovered={actionHover === card.key}
            hoverPose={hoveredCardPose}
            onClick={() => onZoom(isZoomed ? null : card.key)}
          >
            {isZoomed ? (
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
                zIndexRange={HTML_Z_RANGE}
              >
                <div className="whitespace-nowrap rounded-md border border-ps-line bg-ps-panel/90 px-4 py-2">
                  <span className="small-caps font-title text-xl text-ps-text">{card.name}</span>
                  {/* A collection numbers its cards; a deck of playing cards names them. */}
                  <span className="ml-3 font-mono text-lg text-ps-text">{card.label}</span>
                </div>
              </Html>
            ) : (
              card.action && (
                //
                // The plain `<Html>`, not `transform`: a control has to stay flat, legible and the
                // size a button is, where the caption above is meant to look printed on the card.
                // `h-px w-max` is `Deck3D`'s trick for the same job — drei's `center` resolves its
                // percentages against this box, so a definite max-content width centres the control
                // on the card and half a pixel of height leaves its top edge on the anchor, which is
                // what makes `cardActionAnchor` a distance and not a guess at a button's middle.
                //
                // It hangs on the felt **below** the card, which is what the row spacing is for: the
                // control belongs to the card without covering its art, and the same two numbers say
                // where it goes and how much room the grid left it (`table-layout.ts`).
                //
                <Html
                  center
                  position={[0, -cardActionAnchor(), 0.02]}
                  zIndexRange={HTML_Z_RANGE}
                  className="pointer-events-none h-px w-max"
                >
                  {/* Not a control itself: it reports the pointer reaching the one inside it.
                      `pointerover` bubbles, so it arrives here whatever this box's own
                      `pointer-events` say — which is the only reason a wrapper can do this job. */}
                  <div
                    onPointerOver={() => setActionHover(card.key)}
                    onPointerOut={() => setActionHover(null)}
                  >
                    {card.action}
                  </div>
                </Html>
              )
            )}
          </Card3D>
        );
      })}

      <ZoomBackdrop
        active={Boolean(zoomed)}
        depth={zoomBackdropDepth(Boolean(zoomed), distance, columns, actions)}
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
