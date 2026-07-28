'use client';

import { ChevronLeft, Lightbulb, RotateCcw, Sparkles, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { SolitaireScene } from '@/components/pages/solitaire/SolitaireScene';
import { Button } from '@/components/ui/Button';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/SegmentedControl';
import { CARD_BACKS, type CardBack } from '@/engine/standard-deck';
import { cn } from '@/lib/cn';
import { rulesFor } from '@/solitaire/rules';
import { useSolitaireStore } from '@/stores/solitaire-store';

//
// The `/solitaire` route: the board, and the chrome laid over it.
//
// Like `/bag`, the chrome is ordinary DOM above a transparent canvas and is **`pointer-events-none` by
// default** so every pixel of felt stays clickable — each control turns its own pointer events back on.
// It owns no game state: everything comes from `solitaire-store`, which is also what the keyboard in
// `SolitaireScene` drives, so the two can never disagree about the board.
//

type Action = {
  tip: string;
  icon: typeof Lightbulb;
  onClick: () => void;
  disabled?: boolean;
};

/**
 * The backs on offer, in the deck's own order — **derived from `CARD_BACKS` rather than written out**,
 * so adding a back to that tuple puts a segment here with no edit at all. The names are the labels:
 * `Button` already renders in `small-caps`, so the tuple's lowercase reads as titling.
 */
const BACK_OPTIONS: SegmentedOption<CardBack>[] = CARD_BACKS.map(back => ({
  value: back,
  label: back,
  ariaLabel: `${back} card back`,
}));

export function SolitairePage() {
  const [tip, setTip] = useState<string | null>(null);

  const state = useSolitaireStore(s => s.state);
  const moves = useSolitaireStore(s => s.moves);
  const drawCount = useSolitaireStore(s => s.drawCount);
  const cardBack = useSolitaireStore(s => s.cardBack);
  const gameId = useSolitaireStore(s => s.gameId);

  const newGame = useSolitaireStore(s => s.newGame);
  const undo = useSolitaireStore(s => s.undo);
  const showHint = useSolitaireStore(s => s.showHint);
  const collectAll = useSolitaireStore(s => s.collectAll);
  const setDrawCount = useSolitaireStore(s => s.setDrawCount);
  const setCardBack = useSolitaireStore(s => s.setCardBack);

  const won = state?.won ?? false;

  // The icon row is a table, so a control's label can live under it instead of in a popover per
  // button: one line, right-aligned under the icons, holding whichever one the pointer (or focus)
  // is on. It is also each button's `aria-label`, so the tip and the screen reader never diverge.
  const actions: Action[] = [
    { tip: 'Hint (H)', icon: Lightbulb, onClick: showHint },
    { tip: 'Undo (Ctrl+Z)', icon: Undo2, onClick: undo, disabled: !moves.length },
    { tip: 'Collect all', icon: Sparkles, onClick: collectAll },
    { tip: 'New game (N)', icon: RotateCcw, onClick: () => newGame() },
  ];

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <SolitaireScene />

      <div className="pointer-events-none relative z-10 flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {/* A real link, not a Button — `Button` renders a `<button>` and has no `asChild`, and
             * back-to-the-menu should be middle-clickable and crawlable like any other navigation. */}
            <Link
              href="/"
              aria-label="Back to the menu"
              className="mt-2 pointer-events-auto text-ps-text transition-colors hover:text-ps-accent"
            >
              <ChevronLeft className="size-5" />
            </Link>
            <div className="text-left">
              <h2>{rulesFor(gameId).name}</h2>
              <p className="text-ps-text/60 text-sm">
                {moves.length} {moves.length === 1 ? 'move' : 'moves'}
              </p>
            </div>
          </div>

          {/* The column stays `pointer-events-none` — only the buttons take the pointer back, so the
           * tip's own (mostly empty) line never covers a slice of felt. */}
          <div className="flex flex-col items-end gap-1">
            {/* The row clears the tip as well as each button, because a browser dispatches no pointer
             * events from a *disabled* control: undoing the last move disables the button under the
             * cursor, and its own `onPointerLeave` would then never arrive. */}
            <div
              className="pointer-events-auto flex items-center gap-2"
              onPointerLeave={() => setTip(null)}
            >
              {actions.map(({ tip: label, icon: Icon, onClick, disabled }) => (
                <Button
                  key={label}
                  variant="ghost"
                  size="sm"
                  aria-label={label}
                  disabled={disabled}
                  onClick={onClick}
                  onPointerEnter={() => setTip(label)}
                  onPointerLeave={() => setTip(t => (t === label ? null : t))}
                  onFocus={() => setTip(label)}
                  onBlur={() => setTip(t => (t === label ? null : t))}
                >
                  <Icon className="size-5" />
                </Button>
              ))}
            </div>
            {/* Fixed height and always mounted: the tip fades in place rather than pushing the icons
             * up and down as the pointer crosses the row. */}
            <p
              aria-hidden
              className={cn(
                'h-4 whitespace-nowrap text-ps-text text-xs leading-4 transition-opacity duration-150',
                tip ? 'opacity-100' : 'opacity-0',
              )}
            >
              {tip ?? ''}
            </p>
          </div>
        </div>

        {/*
          Won: the cascade is already running behind this, so the banner only has to offer the next game.
        */}
        {won && (
          <div className="-translate-x-1/2 -translate-y-1/2 pointer-events-auto absolute top-1/2 left-1/2 flex flex-col items-center gap-4 rounded-xl border border-ps-line bg-ps-panel/90 px-10 py-8 text-center shadow-card">
            <h2 className="text-ps-accent">You win</h2>
            <p className="text-ps-text/70 text-sm">
              in {moves.length} {moves.length === 1 ? 'move' : 'moves'}
            </p>
            <Button variant="primary" size="md" onClick={() => newGame()}>
              New game
            </Button>
          </div>
        )}

        {/* Settings sit at the foot of the table, out of the board's way. */}
        <div className="pointer-events-auto mt-auto flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Cards drawn from the stock at a time"
            onClick={() => setDrawCount(drawCount === 3 ? 1 : 3)}
          >
            Draw {drawCount}
          </Button>
          {/* A segmented control rather than a cycling button: there are three backs now, and picking
           * one directly is a click where cycling to it is up to two. */}
          <SegmentedControl
            size="sm"
            label="Card back"
            options={BACK_OPTIONS}
            value={cardBack}
            onChange={setCardBack}
          />
        </div>
      </div>
    </main>
  );
}
