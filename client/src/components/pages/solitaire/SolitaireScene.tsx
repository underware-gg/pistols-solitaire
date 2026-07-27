'use client';

import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import { SolitaireTable } from '@/components/pages/solitaire/SolitaireTable';
import { BOARD } from '@/components/pages/solitaire/solitaire-layout';
import { useSolitaireStore } from '@/stores/solitaire-store';
import { cn } from '@/lib/cn';

//
// The canvas, and the two things the board does without the mouse.
//
// **The game starts itself, and resuming is the same code path.** Nothing may deal until the persisted
// store has rehydrated (`hydrated`) — otherwise a returning player would watch a fresh game deal itself
// and then be replaced by their real one. Once it has: if there is no game, deal one. That single effect
// is both "starts automatically" and "resume on refresh".
//
// The keyboard lives here rather than in the chrome because these are global to the page, and because
// the chrome is `pointer-events-none` and never holds focus.
//

export function SolitaireScene({ className }: { className?: string }) {
  const state = useSolitaireStore(s => s.state);
  const hydrated = useSolitaireStore(s => s.hydrated);
  const fresh = useSolitaireStore(s => s.fresh);
  const cardBack = useSolitaireStore(s => s.cardBack);
  const suggestion = useSolitaireStore(s => s.suggestion);

  const newGame = useSolitaireStore(s => s.newGame);
  const play = useSolitaireStore(s => s.play);
  const collect = useSolitaireStore(s => s.collect);
  const drawFromStock = useSolitaireStore(s => s.drawFromStock);
  const undo = useSolitaireStore(s => s.undo);
  const showHint = useSolitaireStore(s => s.showHint);

  // Deal on arrival, once — and only once there is nothing stored to resume instead.
  useEffect(() => {
    if (hydrated && !state) newGame();
  }, [hydrated, state, newGame]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Never steal a key from a form field, whatever the page grows later.
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key.toLowerCase()) {
        case 'n':
          newGame();
          break;
        case 'h':
          showHint();
          break;
        // The stock is the one move that has no card to click on, so it gets the space bar.
        case ' ':
          event.preventDefault();
          drawFromStock();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, newGame, showHint, drawFromStock]);

  return (
    <div className={cn('absolute inset-0', className)}>
      {/* `flat` keeps three's tone mapping off the card art — ACES would quietly desaturate a pixel deck
       * whose colours are already flat and deliberate. */}
      <Canvas
        flat
        shadows
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        camera={{ fov: BOARD.fov, near: 0.1, far: 80 }}
      >
        {state && (
          <SolitaireTable
            state={state}
            cardBack={cardBack}
            fresh={fresh}
            suggestion={suggestion?.move ?? null}
            onPlay={play}
            onCollect={collect}
            onStock={drawFromStock}
          />
        )}
      </Canvas>
    </div>
  );
}
