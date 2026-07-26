'use client';

import { type ReactNode, useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings-store';

//
// The settings layer: rehydrates the persisted store after mount (it is created with
// `skipHydration`, so the first client render matches the SSR defaults) and reflects the
// settings that CSS needs onto <html>.
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
  }, []);

  useEffect(() => {
    document.documentElement.dataset.table = tableColor;
  }, [tableColor]);

  return children;
}
