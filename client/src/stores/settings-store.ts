import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

//
// The player's settings — the durable preferences, all of them persisted to localStorage.
// Ported from ec-dapp's `settings-store.ts`, minus its per-session UI state: read/write
// directly via `useSettingsStore(s => s.foo)`, no `useXActions` wrappers ("actions" is
// reserved for server actions) and no trivial passthrough read hooks.
//
// Everything in this store is a setting, so there is no `partialize` — a new setting is a
// field plus its setter, and it persists for free. Per-session UI state (open panels,
// in-flight flags) does not belong here; give it its own store.
//

//--------------------------------
// Types
//
// The felt the game is played on. The array is the cycle order used by `cycleTableColor`, and it
// leads with the default; every value but that one has an `html[data-table='…']` block in
// `styles/main.css` (the default is what `--color-ps-bg` already is, so it needs no block).
export const TABLE_COLORS = ['red', 'green', 'blue'] as const;
export type TableColor = (typeof TABLE_COLORS)[number];

// Which collections come to the table: this game's own, or every game we index.
export const GAME_FILTERS = ['pistols', 'all'] as const;
export type GameFilter = (typeof GAME_FILTERS)[number];

type SettingsState = {
  // Table felt colour
  tableColor: TableColor;
  setTableColor: (color: TableColor) => void;
  cycleTableColor: () => void;
  // Which games' collections are dealt onto the table
  gameFilter: GameFilter;
  setGameFilter: (filter: GameFilter) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      tableColor: 'red',
      setTableColor: color => set({ tableColor: color }),
      cycleTableColor: () =>
        set({
          tableColor:
            TABLE_COLORS[(TABLE_COLORS.indexOf(get().tableColor) + 1) % TABLE_COLORS.length],
        }),
      gameFilter: 'pistols',
      setGameFilter: filter => set({ gameFilter: filter }),
    }),
    {
      name: 'ps-settings',
      storage: createJSONStorage(() => localStorage),
      // SSR-safe: skip auto-hydration and rehydrate on mount (SettingsProvider) so the
      // first client render matches the server (the defaults), then flips — otherwise a
      // persisted value rendered into SSR HTML would cause a hydration mismatch.
      skipHydration: true,
    },
  ),
);
