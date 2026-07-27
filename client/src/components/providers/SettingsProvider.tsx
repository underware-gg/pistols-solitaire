'use client';

import { type ReactNode, useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { useSolitaireStore } from '@/stores/solitaire-store';

//
// The settings layer: rehydrates **every** persisted store after mount (they are created with
// `skipHydration`, so the first client render matches the SSR defaults) and reflects the
// settings that CSS needs onto <html>.
//
// `solitaire-store` rehydrates here too, and the order matters to the game: it holds a saved
// game as a seed plus a move list, and `/solitaire` deliberately deals nothing until its
// `hydrated` flag is set — otherwise a returning player would watch a fresh game deal itself
// and then be replaced by their real one.
//
// The felt colour is a `data-table` attribute rather than a class or an inline style
// because the whole palette derives from `--color-ps-bg` — `styles/main.css` re-points that
// one token per attribute value and every derived colour, shadow and stamp follows. It has
// to be set from an effect: the value lives in localStorage, which the server can't read,
// and <html> is rendered by `app/layout.tsx` on the server. The table therefore paints
// green for one frame before flipping to a stored colour.
//
export function SettingsProvider({ children }: { children: ReactNode }) {
  const tableColor = useSettingsStore(s => s.tableColor);

  useEffect(() => {
    useSettingsStore.persist.rehydrate();
    // Its `onRehydrateStorage` rebuilds the board from the stored seed and moves, and sets `hydrated`
    // — which is what releases the table to deal.
    useSolitaireStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.table = tableColor;
  }, [tableColor]);

  return children;
}
