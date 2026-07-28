import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { CARD_BACKS, type CardBack } from '@/engine/standard-deck';
import { autoCollect, collectMove, hint, type LegalMove, stockMove } from '@/solitaire/legal';
import { DEFAULT_GAME, GAME_DEFAULTS, rulesFor } from '@/solitaire/rules';
import { randomSeed } from '@/solitaire/shuffle';
import { applyMove, replay } from '@/solitaire/state';
import type { CardAt, GameId, GameState, Move } from '@/solitaire/types';

//
// The game in progress, and the settings that shape it.
//
// **A game is persisted as a seed plus a list of moves, never as a board.** Everything else follows
// from that one decision:
//
// - Undo is dropping the last move and replaying. No inverse-move code, and no way for a board and its
//   history to drift apart — the board *is* the history, evaluated.
// - The stored game is tiny. A `GameState` is ~4KB of JSON, so a few hundred of them would be most of
//   a localStorage budget; a few hundred `Move`s is ~8KB.
// - A deal is reproducible and shareable as a number, which is also how the win cascade gets tested
//   without playing a game out.
//
// The price is that the deal and every rule must be deterministic, which `shuffle.ts` and the pure
// `SolitaireRules` interface guarantee. `state` is therefore **derived and deliberately not
// persisted** (`partialize`), unlike `settings-store`, which persists everything because everything in
// it is a setting.
//
// Rehydration follows the house rule for persisted stores — `skipHydration` plus a rehydrate on mount
// from `SettingsProvider` — because reading a stored game during the first client render would not
// match the prerendered HTML. `hydrated` is what the scene waits for: **it must not deal until
// rehydration has landed**, or a returning player would watch a fresh game deal itself and then be
// replaced by their real one.
//

//--------------------------------
// Types
//
type SolitaireState = {
  //
  // Persisted: the whole game, and the player's preferences.
  //
  gameId: GameId;
  /** The deal. `null` means no game has been started on this device yet. */
  seed: number | null;
  /** Every move played, in order. With `seed`, this *is* the game. */
  moves: Move[];
  /** Cards the stock deals at a time. Changing it starts a new deal — it changes solvability. */
  drawCount: 1 | 3;
  cardBack: CardBack;

  //
  // Derived, never persisted.
  //
  /** The board as it stands, replayed from `seed` + `moves`. `null` before the first deal. */
  state: GameState | null;
  /** True once `persist.rehydrate()` has run. Nothing may deal before this. */
  hydrated: boolean;
  /**
   * This game was just dealt here, rather than restored — so the table should animate the deal.
   * A resumed game sets it false and its cards simply appear where they were left.
   */
  fresh: boolean;
  /** A move the player asked to be shown, cleared on the next move. */
  suggestion: LegalMove | null;

  //
  // Actions.
  //
  newGame: (seed?: number) => void;
  /** Play one move. Ignored if the rules refuse it. */
  play: (move: Move) => void;
  /** Send the run at `at` wherever a double-click should send it. True if something moved. */
  collect: (at: CardAt) => boolean;
  /** Click the stock: draw, or turn the waste back. */
  drawFromStock: () => void;
  /** Everything that can go to a foundation, as one batch of moves. */
  collectAll: () => void;
  undo: () => void;
  showHint: () => void;
  clearHint: () => void;
  setDrawCount: (count: 1 | 3) => void;
  setCardBack: (back: CardBack) => void;
  /** Rebuild `state` from what was persisted, or note that there is nothing to rebuild. */
  resume: () => void;
};

/** How many moves of history to keep. Deep enough to undo a whole game, small enough to store. */
const HISTORY_LIMIT = 400;

export const useSolitaireStore = create<SolitaireState>()(
  persist(
    (set, get) => ({
      gameId: DEFAULT_GAME,
      seed: null,
      moves: [],
      drawCount: GAME_DEFAULTS[DEFAULT_GAME].drawCount,
      cardBack: CARD_BACKS[0],

      state: null,
      hydrated: false,
      fresh: false,
      suggestion: null,

      newGame: seed => {
        const { gameId, drawCount } = get();
        const nextSeed = seed ?? randomSeed();
        set({
          seed: nextSeed,
          moves: [],
          state: replay(rulesFor(gameId), nextSeed, [], { drawCount }),
          fresh: true,
          suggestion: null,
        });
      },

      play: move => {
        const { state, gameId, moves, drawCount } = get();
        if (!state) return;
        const next = applyMove(state, move, rulesFor(gameId), { drawCount });
        // `applyMove` returns the *same* object when the rules refuse — which is the whole snap-back
        // mechanism, so a rejected move must not be recorded or re-render anything.
        if (next === state) return;
        set({
          state: next,
          moves: [...moves, move].slice(-HISTORY_LIMIT),
          fresh: false,
          suggestion: null,
        });
      },

      collect: at => {
        const { state, gameId } = get();
        if (!state) return false;
        const move = collectMove(state, rulesFor(gameId), at);
        if (!move) return false;
        get().play(move);
        return true;
      },

      drawFromStock: () => {
        const { state, gameId, drawCount } = get();
        if (!state) return;
        const move = stockMove(state, rulesFor(gameId), { drawCount });
        if (move) get().play(move);
      },

      collectAll: () => {
        const { state, gameId, drawCount } = get();
        if (!state) return;
        const rules = rulesFor(gameId);
        const batch = autoCollect(state, rules, { drawCount });
        if (!batch.length) return;
        // Applied as one state change rather than one at a time: every card that can go home sets off
        // at once and the damped poses fan them out on their own, which is what the cascade looks like.
        const next = batch.reduce((s, move) => applyMove(s, move, rules, { drawCount }), state);
        set({
          state: next,
          moves: [...get().moves, ...batch].slice(-HISTORY_LIMIT),
          fresh: false,
          suggestion: null,
        });
      },

      //
      // Undo: drop the last move and replay from the seed. Replaying a few hundred pure moves takes
      // microseconds, and it is the only implementation that cannot disagree with the stored history.
      //
      undo: () => {
        const { seed, moves, gameId, drawCount } = get();
        if (seed === null || !moves.length) return;
        const kept = moves.slice(0, -1);
        set({
          moves: kept,
          state: replay(rulesFor(gameId), seed, kept, { drawCount }),
          fresh: false,
          suggestion: null,
        });
      },

      showHint: () => {
        const { state, gameId } = get();
        if (!state) return;
        set({ suggestion: hint(state, rulesFor(gameId)) });
      },

      clearHint: () => set({ suggestion: null }),

      // A different draw count is a different game — the same deal is not equally solvable at 1 and 3,
      // so keeping the board would silently change the rules mid-game.
      setDrawCount: count => {
        if (get().drawCount === count) return;
        set({ drawCount: count });
        get().newGame();
      },

      // Purely cosmetic and takes effect immediately — the back is a texture the table reads, so
      // switching it mid-game costs nothing and changes no rule.
      setCardBack: back => set({ cardBack: back }),

      resume: () => {
        const { seed, moves, gameId, drawCount } = get();
        set({
          hydrated: true,
          // A stored game comes back exactly as it was left, and without the deal animation.
          state: seed === null ? null : replay(rulesFor(gameId), seed, moves, { drawCount }),
          fresh: false,
        });
      },
    }),
    {
      name: 'ps-solitaire',
      storage: createJSONStorage(() => localStorage),
      // Everything derived is rebuilt by `resume()`; persisting it would let a stored board contradict
      // the move list it is supposed to be the result of.
      partialize: state => ({
        gameId: state.gameId,
        seed: state.seed,
        moves: state.moves,
        drawCount: state.drawCount,
        cardBack: state.cardBack,
      }),
      // Same reason as `settings-store`: reading storage during the first client render would not match
      // the prerendered HTML. `SettingsProvider` rehydrates on mount.
      skipHydration: true,
      onRehydrateStorage: () => () => {
        // Fires after the merge whether or not anything was stored, which is exactly when the board can
        // be rebuilt and the scene released to deal.
        useSolitaireStore.getState().resume();
      },
    },
  ),
);
