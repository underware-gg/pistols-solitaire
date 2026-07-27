import { KLONDIKE, KLONDIKE_DEFAULTS } from '@/solitaire/rules/klondike';
import type { GameId, GameOptions, SolitaireRules } from '@/solitaire/types';

//
// The registry: every variant the app can play, by id.
//
// **This is the whole cost of adding a game.** Write `rules/<game>.ts` implementing `SolitaireRules`,
// add it to `GameId` in `types.ts`, and add the two entries below — the store, the table, the layout,
// hints, undo and auto-collect all work on it without changes, because none of them names a variant.
//

export const GAMES: Record<GameId, SolitaireRules> = {
  klondike: KLONDIKE,
};

/** Each game's starting options. The store persists whatever the player changes them to. */
export const GAME_DEFAULTS: Record<GameId, GameOptions> = {
  klondike: KLONDIKE_DEFAULTS,
};

/** Which game a new session opens on. */
export const DEFAULT_GAME: GameId = 'klondike';

export const rulesFor = (id: GameId): SolitaireRules => GAMES[id] ?? GAMES[DEFAULT_GAME];

export { KLONDIKE };
