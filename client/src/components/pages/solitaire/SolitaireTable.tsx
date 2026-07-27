'use client';

import { useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ASPECT,
  BOARD,
  boardMetrics,
  cameraDistance,
  cardPose,
  deckPose,
  dragPose,
  drawnFrom,
  dropPoint,
  hoveredCardPose,
  hoveredDeckPose,
  pilePose,
  returnedTo,
  stockCardPose,
  stockTop,
  winPose,
} from '@/components/pages/solitaire/solitaire-layout';
import { Card3D, CardSlot3D, Deck3D, FitCamera, useCardArt, useCardDrag } from '@/engine';
import type { Pose } from '@/engine/card-pose';
import { backUrl, type Card, type CardBack, faceUrl } from '@/engine/standard-deck';
import { canDropRun } from '@/solitaire/legal';
import { rulesFor } from '@/solitaire/rules';
import type { CardAt, GameState, Move, PileId } from '@/solitaire/types';

//
// The board in 3D: every card of the game, placed by `solitaire-layout` and moved by the damping.
//
// The canvas is transparent and paints nothing of its own — the felt, the logo stamp and the vignette are
// the CSS surface from `styles/main.css`, so switching the table colour in the burger menu re-tints the
// felt under a live 3D scene and the scene never learns a colour exists. The only non-card geometry is the
// pile slots and a `shadowMaterial` plane that draws the cards' shadows onto whatever shows through.
//
// **Every card is mounted for the life of the game, keyed by its own id — in one flat list, which is what
// makes that true** (see the list below; a list per pile silently remounts a card that changes pile).
// That is what makes the whole thing animate: a card does not move because something animated it, it
// moves because the pose derived from the new game state is somewhere else and `usePoseAnimation` is
// already damping toward it. A move, an undo, a flip, a snapped-back drag and the win cascade are all
// that one mechanism. A card the *stock* deals is the one card with no earlier pose, so it is given an
// entrance instead — the other half of the same idea.
//

/** Beat before the first card of a fresh deal leaves the stock. */
const DEAL_DELAY = 0.15;
/** Gap between consecutive cards in a deal — the difference between dealing and appearing. */
const DEAL_STAGGER = 0.028;
/**
 * Gap between the cards of one draw. Far wider than the deal's: three cards turning over one after
 * another is the whole point of the draw, where fifty-two are a single sweep across the felt.
 */
const DRAW_STAGGER = 0.09;
/**
 * Longest a whole batch in or out of the stock may take to leave, however many cards it is — so a
 * *redeal* (or an undone one, which deals the whole waste back out) sweeps instead of trickling for two
 * seconds at `DRAW_STAGGER`. A draw of three is well inside the budget and keeps its full gap.
 */
const BATCH_SPREAD = 0.3;
const batchGap = (cards: number) => Math.min(DRAW_STAGGER, BATCH_SPREAD / Math.max(1, cards - 1));
/**
 * How long a card handed back to the stock stays mounted after the game says it is in the deck: the
 * flight plus the batch's own spread. `/bag` keeps a returning card alive the same way.
 */
const RETURN_MS = 900;

/** What a drag carries: the card it started from. The run below it comes along. */
type DragPayload = CardAt;

/** A card outliving the board on its way back into the stock: where it was, and its place in the batch. */
type Returning = { card: Card; from: Pose; order: number };

export function SolitaireTable({
  state,
  cardBack,
  fresh,
  suggestion,
  onPlay,
  onCollect,
  onStock,
}: {
  state: GameState;
  cardBack: CardBack;
  /** Freshly dealt here, so the cards fly out of the stock. A resumed game appears in place. */
  fresh: boolean;
  /** A hinted move, highlighted until the next move. */
  suggestion: Move | null;
  onPlay: (move: Move) => void;
  onCollect: (at: CardAt) => void;
  onStock: () => void;
}) {
  const viewport = useThree(three => three.size);
  const rules = rulesFor(state.gameId);

  //
  // Which card the cursor is on — **the table's, not the card's**, because a hover here lifts a *run*.
  //
  // A fan offsets the next card by `fanDown` (0.3 of a card height), which is orders of magnitude more
  // than a card's thickness, so a single card lifting and tilting on its own rises straight through the
  // cards resting on top of it. What a hover promises is a drag, and a drag carries everything from that
  // card down — so that is exactly what lifts, and the run keeps its own spacing because every card in it
  // takes the same transform. Cheap: it re-renders the board on hover, not per frame.
  //
  const [hovered, setHovered] = useState<CardAt | null>(null);
  const sameCard = (a: CardAt | null, b: CardAt) => a?.pile === b.pile && a?.index === b.index;
  const trackHover = (at: CardAt, on: boolean) =>
    // Leaving only clears the hover if it is still this card's: crossing from one card to the next fires
    // the new card's `over` before the old one's `out`, which would otherwise blank it again.
    setHovered(current => (on ? at : sameCard(current, at) ? null : current));

  // Constant for the life of a game and read by every card, so it is computed once.
  const board = useMemo(() => boardMetrics(rules.piles), [rules]);
  const distance = cameraDistance(board, viewport.width / viewport.height);

  //
  // The card back, loaded and **pinned** for the life of the table: every face-down card wants it
  // already, and a back arriving late would flash blank stock across the whole board.
  //
  // The 52 faces are deliberately *not* pinned. They all fit under `CACHE_LIMIT` while they are in play,
  // so the LRU keeps them anyway — and pinning them would leave `/bag` six free slots out of sixty and
  // make its token art thrash for the rest of the session.
  //
  const back = useCardArt(backUrl(cardBack), { aspect: ASPECT, pixelated: true, pin: true });

  const piles = state.order.map(id => state.piles[id]);
  const stock = piles.find(pile => pile.kind === 'stock');
  const won = state.won;

  //
  // Which cards the stock has **just dealt**, in the order it dealt them.
  //
  // A drawn card has no earlier pose to travel from: while it was in the stock it was part of a
  // `Deck3D` block, so this render is the first time it exists as a card and `usePoseAnimation` would
  // place it straight onto the waste — cards appearing already drawn, which is what this fixes. They
  // get `stockTop` as an entrance and a per-card delay instead, so a draw-three deals three cards.
  //
  // Recognised by *having been in the stock last render* rather than by "the last few cards of the
  // waste", because those two only agree immediately after a draw. Undoing a card back onto the waste
  // from a tableau would otherwise fly it out of a stock it was never in — and it reads every pile
  // rather than the waste, so a variant whose stock deals onto its columns (Spider) needs no change.
  //
  const inStock = useRef(new Set<string>());
  const dealtOrder = new Map(
    piles
      .filter(pile => pile.kind !== 'stock')
      .flatMap(pile => pile.cards)
      .filter(card => inStock.current.has(card.id))
      .map((card, order) => [card.id, order] as const),
  );
  // Every render, so the snapshot is always the last board that was actually shown.
  useEffect(() => {
    inStock.current = new Set(stock?.cards.map(card => card.id));
  });

  //
  // Dragging. The hook reports where the pointer is on a plane above the felt; what may be picked up and
  // where it may land is decided here, against the rules.
  //
  /** The nearest pile that would accept the carried run, or null — the highlight and the drop agree. */
  const dropTarget = useCallback(
    (at: CardAt, point: [number, number, number]): PileId | null => {
      let best: PileId | null = null;
      let nearest = BOARD.dropRadius;
      for (const pile of state.order.map(id => state.piles[id])) {
        if (!canDropRun(state, rules, at, pile.id)) continue;
        const [x, z] = dropPoint(pile, board);
        const away = Math.hypot(point[0] - x, point[2] - z);
        if (away < nearest) {
          nearest = away;
          best = pile.id;
        }
      }
      return best;
    },
    [board, rules, state],
  );

  const { drag, begin } = useCardDrag<DragPayload>({
    height: BOARD.dragHeight,
    onDrop: finished => {
      // A press that never moved is a click, and the click handlers own that — releasing in place must
      // not also count as dropping the card back onto its own pile.
      if (!finished.moved) return;
      // A run that has been let go is not being hovered any more, wherever the pointer ended up: the
      // cards left the place the hover was recorded at, and only a pointer *move* would say so.
      setHovered(null);
      const to = dropTarget(finished.payload, finished.point);
      if (!to) return;
      onPlay({
        type: 'move',
        from: finished.payload.pile,
        to,
        count: state.piles[finished.payload.pile].cards.length - finished.payload.index,
      });
    },
  });

  //
  // Which pile the carried run would land on right now — **derived, not state.** The drag itself is
  // already state and re-renders as the pointer moves, so storing this too would mean a second render
  // per frame and a `setState` during the first one.
  //
  const target = drag?.moved ? dropTarget(drag.payload, drag.point) : null;

  const carrying = drag?.payload ?? null;
  /** How deep into the carried run a card is, or -1 if it is not being carried. */
  const runIndex = (at: CardAt): number =>
    carrying && at.pile === carrying.pile && at.index >= carrying.index
      ? at.index - carrying.index
      : -1;

  const entrance = stockTop(stock, board);

  //
  // Every card in play, in **two different orders, and both are load-bearing.**
  //
  // `thrown` is the card's place across the board, left to right and pile by pile: the deal staggers by
  // it (so a fresh game deals across the tableau instead of restarting per column) and the win cascade
  // throws by it (so the pack leaves evenly).
  //
  // The *render* order is by card id, and is **the order that must never change** — see the list below.
  // Sorting a copy is what lets the two coexist.
  //
  const entries = piles
    .filter(pile => pile.kind !== 'stock')
    .flatMap(pile => pile.cards.map((card, index) => ({ card, pile, index })))
    .map((entry, thrown) => ({ ...entry, thrown }));
  const rendered = [...entries].sort((a, b) => (a.card.id < b.card.id ? -1 : 1));

  //
  // Where each card was drawn **last** render, which is what makes a remount harmless.
  //
  // `initial` is mount-only, and it defaults to the card's *target* — so any card that remounts appears
  // at its destination, i.e. the move plays as a cut. The list below is built so that should never
  // happen, but "should never happen" is how the draw and the flat-list bugs both read before they were
  // found, and a cut is a silent failure. A card that remounts for any reason at all now enters from the
  // slot it was visibly in and travels from there, so the worst case is a move that starts from the
  // wrong point rather than one that does not animate.
  //
  // Absent from the map means genuinely new: dealt by the stock (→ `drawnFrom`) or the first render of a
  // resumed board (→ nothing, so the board is simply already there). `dealtOrder` separates those two,
  // and it is empty on a first render because `inStock` starts empty.
  //
  const poses = new Map(entries.map(e => [e.card.id, cardPose(e.pile, e.index, board)]));
  const lastPose = useRef(poses);
  const wasAt = lastPose.current;
  useEffect(() => {
    lastPose.current = poses;
  });

  //
  // Cards on their way **back** to the stock — the redeal, and the exact mirror of the draw.
  //
  // Turning the waste over refills the stock, and the stock is a `Deck3D` block, so those cards leave
  // the mounted board in the same render: they have no *later* pose to travel to and the return is a
  // cut. So they are kept alive here for `RETURN_MS` after the game has stopped counting them —
  // travelling from where they last lay to the top of the deck, turning face down on the way.
  //
  // `handedBack` is computed during the render that loses them (so there is no blank frame) and the
  // state carries the same cards, under the same keys, through the frames after it.
  //
  // `fresh` is excluded, and not only as an optimisation: a new deal fills the stock with cards that
  // were on the board a render ago (the *previous* game's), which reads exactly like a redeal. Those
  // cards have the deal's own entrance and must not also fly home.
  const [returning, setReturning] = useState<Returning[]>([]);
  const handedBack: Returning[] = (fresh ? [] : (stock?.cards ?? []))
    .flatMap(card => {
      const from = wasAt.get(card.id);
      return from && !inStock.current.has(card.id) ? [{ card, from }] : [];
    })
    .map((entry, order) => ({ ...entry, order }));
  const flying = handedBack.length ? handedBack : returning;
  // Keyed on the redeal count, which is the only thing that hands a pile back to the stock.
  useEffect(() => {
    if (!handedBack.length) return;
    setReturning(handedBack);
    const done = setTimeout(() => setReturning([]), RETURN_MS);
    return () => clearTimeout(done);
  }, [state.redeals]);

  return (
    <>
      <FitCamera distance={distance} direction={BOARD.direction} fov={BOARD.fov} />

      <ambientLight intensity={BOARD.lightAmbient} />
      <directionalLight
        position={BOARD.lightKeyPosition}
        intensity={BOARD.lightKeyIntensity}
        castShadow
        shadow-mapSize={[BOARD.shadowMapSize, BOARD.shadowMapSize]}
        shadow-camera-left={-BOARD.shadowExtent}
        shadow-camera-right={BOARD.shadowExtent}
        shadow-camera-top={BOARD.shadowExtent}
        shadow-camera-bottom={-BOARD.shadowExtent}
        shadow-camera-near={BOARD.shadowNear}
        shadow-camera-far={BOARD.shadowFar}
        shadow-bias={BOARD.shadowBias}
      />
      <directionalLight position={BOARD.lightFillPosition} intensity={BOARD.lightFillIntensity} />

      {/* The felt is CSS, so the board's only ground is this shadow catcher: `shadowMaterial` draws the
       * shadow and nothing else, and the page shows through everywhere else. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <shadowMaterial transparent opacity={BOARD.shadowOpacity} />
      </mesh>

      {/*
        The pile slots — one per pile, always drawn, always under everything. They are the markings on the
        felt that say where cards go, so they do not animate and are not conditional: a slot under a full
        tableau column is simply covered by it, which costs one unlit plane and means an emptying column
        reveals its slot with no state change at all. The stock draws its own, through `Deck3D`.
      */}
      {piles
        .filter(pile => pile.kind !== 'stock')
        .map(pile => (
          <group key={pile.id} position={pilePose(pile, board).position}>
            <CardSlot3D aspect={ASPECT} />
          </group>
        ))}

      {/*
        The drop target, marked **where the card will actually land** rather than on the pile's slot. On a
        fanned column those are far apart — the slot is at the top and the cards land at the bottom — so
        highlighting the slot would light up a spot the carried card is nowhere near, which reads as the
        wrong column. Positioned separately from the slots for exactly that reason.
      */}
      {target && <DropTarget point={dropPoint(state.piles[target], board)} />}

      {/*
        The stock as a deck: a squared-up face-down stack that deals when clicked, and the empty slot when
        it is out — which is where clicking turns the waste back over for another pass.
      */}
      {stock && (
        <Deck3D
          cards={Math.min(BOARD.stackDepth, stock.cards.length)}
          cardPose={stockCardPose}
          back={back}
          aspect={ASPECT}
          // `deckPose`, not `pilePose`: a deck's cards carry their own face-down rotation, so a pose that
          // is already turned face up would compose to zero and stand the stack upright.
          pose={deckPose(stock, board)}
          hoverPose={hoveredDeckPose}
          onSelect={won ? undefined : onStock}
        />
      )}

      {/*
        Every card in play: **one flat list, keyed by card id, in an order that never changes.** All
        three clauses are what make a card *move* between piles rather than appear in the new one, and
        each was a real bug.

        - **Flat.** Nesting a list per pile (`piles.map(pile => pile.cards.map(…))`) reads better and is
          wrong: React wraps each inner array in a fragment whose key is `null`
          (`createFiberFromFragment(…, null)` in `react-dom`) — matched by slot *index* — and keys are
          only compared with siblings inside that fragment. A card whose id moves from the waste's array
          to a tableau's is therefore a different child: it unmounts, remounts, and `usePoseAnimation`
          puts it on its new pose the frame it mounts. Flat, the ids are all siblings.
        - **In card-id order, not board order** (`rendered`, sorted above) — belt and braces, because
          board order changes on almost every move and card-id order never changes, so React emits no
          child *moves* at all. Worth doing because R3F's `insertBefore` splices the instance in at its
          new index without removing it from the old one (`events-*.js`; the DOM's own `insertBefore`
          unlinks first), leaving it listed twice in the parent's `children` — the three.js scene graph
          and the transforms survive that, so it is a latent hazard rather than the cause of anything
          seen so far, but a reorder that never happens cannot trip over it. Nothing else depends on
          render order: cards are opaque and placed by pose, so the depth buffer sorts them, and a
          carried run sorts itself with `depth`.
        - **Wrapped in `<group key={state.seed}>`**, so a *new deal* does remount all 52. The ids repeat
          game to game, so without it the cards would slide from the old board to the new one.

        The stock's cards are the exception and are drawn by `Deck3D` above rather than individually:
        they are a squared-up block whose members are never addressed, and 24 damped groups for a pile
        nobody can see into is work for nothing. Which is why a card *leaving* the stock mounts here.
      */}
      <group key={state.seed}>
        {rendered.map(({ card, pile, index, thrown }) => {
          const at: CardAt = { pile: pile.id, index };
          const carried = runIndex(at);
          const resting = poses.get(card.id) ?? cardPose(pile, index, board);
          const liftable = card.faceUp && !won && rules.canPickUp(state, at);
          const hinted =
            suggestion?.type === 'move' &&
            suggestion.from === pile.id &&
            index >= pile.cards.length - suggestion.count;

          return (
            <Card3D
              key={card.id}
              frontUrl={card.faceUp ? faceUrl(card.suit, card.rank) : undefined}
              back={back}
              aspect={ASPECT}
              pixelated
              faceDown={!card.faceUp}
              pose={
                won
                  ? winPose(thrown, 52)
                  : carried >= 0 && drag
                    ? dragPose(drag.point, carried)
                    : resting
              }
              // A fresh deal flies out of the stock, and so does a card the stock has just dealt —
              // the same entrance, staggered the same way, one card behind the other. Otherwise a card
              // enters from wherever it last was: nothing at all on the normal path (`initial` is
              // mount-only and the card is already there), and the safety net above on a remount. A
              // resumed board's first render has neither, so it is simply already there.
              initial={
                fresh
                  ? entrance
                  : dealtOrder.has(card.id)
                    ? drawnFrom(stock, board, resting)
                    : wasAt.get(card.id)
              }
              delay={
                fresh
                  ? DEAL_DELAY + thrown * DEAL_STAGGER
                  : (dealtOrder.get(card.id) ?? 0) * batchGap(dealtOrder.size)
              }
              grabbed={carried >= 0}
              depth={Math.max(0, carried)}
              hoverable={carried < 0 && !won}
              // Only a card that can actually be lifted acknowledges the cursor — a hover lift on a
              // buried card would promise a move that is not there.
              hoverPose={liftable ? hoveredCardPose : undefined}
              // Lifted by the cursor being anywhere on the run this card belongs to, not just on it.
              // Every card of a legal run is itself the head of a shorter legal run, so they all have
              // a `hoverPose` and the run comes up as one piece.
              hovered={hovered?.pile === pile.id && index >= hovered.index}
              onHover={liftable ? on => trackHover(at, on) : undefined}
              onPointerDown={liftable ? event => begin(at, event, resting.position) : undefined}
              onDoubleClick={
                liftable
                  ? () => {
                      // Same reason as the drop: these cards are about to leave, so the run they
                      // were the head of stops being hovered now rather than at the next mouse move.
                      setHovered(null);
                      onCollect(at);
                    }
                  : undefined
              }
            >
              {hinted && <Marker />}
            </Card3D>
          );
        })}

        {/*
          And the cards going the other way, into the deck. Their own list, so that a card entering it
          *is* a remount — which is what gives it an entrance (`from`, where it last lay) and a fresh
          `delay`. They carry no handler at all: R3F leaves an object with no handlers out of hit
          testing entirely, so a card in flight cannot swallow a click meant for the deck below it.
        */}
        {flying.map(({ card, from, order }) => (
          <Card3D
            key={card.id}
            frontUrl={faceUrl(card.suit, card.rank)}
            back={back}
            aspect={ASPECT}
            pixelated
            // Already face down, and yawed, so the pose *is* the turn — `faceDown` would only set the
            // tilt this has and drop the yaw with it.
            pose={returnedTo(stock, board, from) ?? from}
            initial={from}
            delay={order * batchGap(flying.length)}
            hoverable={false}
          />
        ))}
      </group>
    </>
  );
}

/**
 * Where a carried run would land: a flat wash on the felt, unlit and not writing depth so it can never
 * shade the card passing over it. Lies just clear of the shadow catcher, under every card.
 */
function DropTarget({ point }: { point: [number, number] }) {
  return (
    <mesh position={[point[0], 0.004, point[1]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[ASPECT * 1.14, 1.14]} />
      <meshBasicMaterial color="#ffd84d" transparent opacity={0.3} depthWrite={false} />
    </mesh>
  );
}

/**
 * The hinted card, marked in the same colour as a drop target — one visual language for "here".
 *
 * Drawn **behind** the card (local −z, which is into the felt once the card lies face up) and slightly
 * larger than it, so the card occludes the middle and only a halo shows around the silhouette. In front
 * it would wash out the very face the hint is pointing at.
 */
function Marker() {
  return (
    <mesh position={[0, 0, -0.006]}>
      <planeGeometry args={[ASPECT * 1.16, 1.16]} />
      <meshBasicMaterial color="#ffd84d" transparent opacity={0.55} depthWrite={false} />
    </mesh>
  );
}
