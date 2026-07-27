'use client';

import { useThree } from '@react-three/fiber';
import { useCallback, useMemo } from 'react';
import {
  ASPECT,
  BOARD,
  boardMetrics,
  cameraDistance,
  cardPose,
  dealOrigin,
  deckPose,
  dragPose,
  dropPoint,
  hoveredCardPose,
  hoveredDeckPose,
  pilePose,
  stockCardPose,
  winPose,
} from '@/components/pages/solitaire/solitaire-layout';
import { Card3D, CardSlot3D, Deck3D, FitCamera, useCardArt, useCardDrag } from '@/engine';
import { backUrl, type CardBack, faceUrl } from '@/engine/standard-deck';
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
// **Every card is mounted for the life of the game, keyed by its own id.** That is what makes the whole
// thing animate: a card does not move because something animated it, it moves because the pose derived
// from the new game state is somewhere else and `usePoseAnimation` is already damping toward it. A move,
// an undo, a flip, a snapped-back drag and the win cascade are all that one mechanism.
//

/** Beat before the first card of a fresh deal leaves the stock. */
const DEAL_DELAY = 0.15;
/** Gap between consecutive cards in a deal — the difference between dealing and appearing. */
const DEAL_STAGGER = 0.028;

/** What a drag carries: the card it started from. The run below it comes along. */
type DragPayload = CardAt;

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

  // Deal order across the whole board, and the index the win cascade throws each card by. Counted here
  // rather than per pile so the deal runs left to right across the tableau instead of restarting per
  // column, and so the cascade leaves evenly.
  let order = 0;
  const entrance = dealOrigin(stock, board);

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
        Every card in play. The stock's cards are drawn by `Deck3D` above rather than individually — they
        are a squared-up block whose members are never addressed, and 24 damped groups for a pile nobody
        can see into is work for nothing.
      */}
      {piles.map(pile =>
        pile.kind === 'stock'
          ? null
          : pile.cards.map((card, index) => {
              const at: CardAt = { pile: pile.id, index };
              const carried = runIndex(at);
              const resting = cardPose(pile, index, board);
              const liftable = card.faceUp && !won && rules.canPickUp(state, at);
              const hinted =
                suggestion?.type === 'move' &&
                suggestion.from === pile.id &&
                index >= pile.cards.length - suggestion.count;
              const thrown = order++;

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
                  // A fresh deal flies out of the stock. A resumed game passes nothing, so each card
                  // mounts at its own resting pose and the board is simply already there.
                  initial={fresh ? entrance : undefined}
                  delay={fresh ? DEAL_DELAY + thrown * DEAL_STAGGER : 0}
                  grabbed={carried >= 0}
                  depth={Math.max(0, carried)}
                  hoverable={carried < 0 && !won}
                  // Only a card that can actually be lifted acknowledges the cursor — a hover lift on a
                  // buried card would promise a move that is not there.
                  hoverPose={liftable ? hoveredCardPose : undefined}
                  onPointerDown={liftable ? event => begin(at, event, resting.position) : undefined}
                  onDoubleClick={liftable ? () => onCollect(at) : undefined}
                >
                  {hinted && <Marker />}
                </Card3D>
              );
            }),
      )}
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
